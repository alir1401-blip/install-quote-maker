import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  QUOTE_WEBHOOK_KEY,
  QUOTE_WEBHOOK_EVENTS,
  validateQuoteWebhookUrl,
} from "@/lib/quote-webhook";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Config = { url: string; enabled: boolean };
export function QuoteWebhookCard({ ownerId }: { ownerId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Config | null>(null);
  const configKey = ["quote-webhook-config", ownerId];
  const config = useQuery({
    queryKey: configKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("owner_id", ownerId)
        .eq("key", QUOTE_WEBHOOK_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as Partial<Config> | undefined;
      return {
        url: typeof value?.url === "string" ? value.url : "",
        enabled: value?.enabled === true,
      };
    },
  });
  const current = draft ?? config.data ?? { url: "", enabled: false };
  const save = useMutation({
    mutationFn: async () => {
      const value = {
        ...current,
        url: current.url.trim() ? validateQuoteWebhookUrl(current.url) : "",
      };
      if (value.enabled && !value.url)
        throw new Error("Indiquez l’URL de destination avant d’activer l’envoi.");
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { owner_id: ownerId, key: QUOTE_WEBHOOK_KEY, value },
          { onConflict: "owner_id,key" },
        );
      if (error) throw new Error("Impossible d’enregistrer l’URL du webhook.");
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(configKey, value);
      setDraft(null);
      toast.success("Configuration enregistrée.");
    },
    onError: (error) => toast.error(error.message),
  });
  const history = useQuery({
    queryKey: ["quote-webhook-history", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("history_events")
        .select("id, created_at, event_type, description, metadata")
        .eq("owner_id", ownerId)
        .in("event_type", QUOTE_WEBHOOK_EVENTS)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-5 w-5" /> Envoi des devis par POST
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enregistrez l’adresse de votre outil, puis cliquez sur « Envoyer au webhook » dans un
          devis. Chaque clic envoie sa version enregistrée et crée une tentative dans l’historique.
        </p>
        {config.isPending ? (
          <p role="status">Chargement…</p>
        ) : config.isError ? (
          <p role="alert">
            Impossible de charger la configuration.{" "}
            <Button variant="link" onClick={() => void config.refetch()}>
              Réessayer
            </Button>
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Label htmlFor="quote-webhook-destination">URL de destination HTTPS</Label>
            <Input
              id="quote-webhook-destination"
              type="url"
              placeholder="https://votre-outil.fr/webhook/devis"
              value={current.url}
              disabled={save.isPending}
              onChange={(event) => setDraft({ ...current, url: event.target.value })}
            />
            <div className="flex items-center gap-3">
              <Switch
                id="quote-webhook-enabled"
                checked={current.enabled}
                disabled={save.isPending}
                onCheckedChange={(enabled) => setDraft({ ...current, enabled })}
              />
              <Label htmlFor="quote-webhook-enabled">Activer l’envoi des devis</Label>
            </div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer">Contenu envoyé et fonctionnement</summary>
          <p className="mt-2 text-muted-foreground">
            Le JSON contient event (quote.exported), schema_version (1), event_id, sent_at, currency
            (EUR), quote, client, site, contract, installations, items, tickets, report,
            ticket_group, document et totals. Les lignes incluent les pièces, quantités, dimensions,
            prix et coûts ; les installations incluent marque, type, modèle, contrat et
            caractéristiques. Les notes enregistrées sont incluses. Les photos sont transmises par
            URL.
          </p>
          <p className="mt-2 text-muted-foreground">
            Le destinataire doit répondre avec un code HTTP 2xx sous 15 secondes. Chaque tentative
            possède un identifiant dans event_id et l’en-tête X-Webhook-Id. Les redirections et les
            nouvelles tentatives automatiques sont désactivées. L’envoi ne change pas le statut du
            devis.
          </p>
        </details>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">20 derniers envois</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void history.refetch()}
            disabled={history.isFetching}
          >
            Actualiser
          </Button>
        </div>
        {history.isPending ? (
          <p role="status">Chargement…</p>
        ) : history.isError ? (
          <p role="alert">Impossible de charger les envois.</p>
        ) : !history.data?.length ? (
          <p className="text-sm text-muted-foreground">Aucun devis envoyé pour le moment.</p>
        ) : (
          <ul className="space-y-3">
            {history.data.map((entry) => {
              const meta = entry.metadata as Record<string, unknown>;
              return (
                <li key={entry.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Link
                      to="/quotes/$quoteId"
                      params={{ quoteId: String(meta.quote_id) }}
                      className="font-medium underline"
                    >
                      {String(meta.quote_number ?? "Devis")}
                    </Link>
                    <span>
                      {entry.event_type === "quote_webhook_delivered"
                        ? "Reçu"
                        : entry.event_type === "quote_webhook_failed"
                          ? "Échec / non confirmé"
                          : "En cours / non confirmé"}
                      {meta.http_status ? ` · HTTP ${meta.http_status}` : ""}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("fr-FR")} ·{" "}
                    {String(meta.destination_host ?? "")}
                  </p>
                  {entry.description && <p>{entry.description}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
