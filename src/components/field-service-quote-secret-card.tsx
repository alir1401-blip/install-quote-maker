import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  FIELD_SERVICE_QUOTE_SECRET_KEY,
  FIELD_SERVICE_QUOTE_EVENTS,
} from "@/lib/field-service-quote-return";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function FieldServiceQuoteSecretCard({ ownerId }: { ownerId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const configKey = ["field-service-quote-secret", ownerId];
  const config = useQuery({
    queryKey: configKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("owner_id", ownerId)
        .eq("key", FIELD_SERVICE_QUOTE_SECRET_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as { secret?: string } | undefined;
      return typeof value?.secret === "string" ? value.secret : "";
    },
  });
  const current = draft ?? config.data ?? "";
  const save = useMutation({
    mutationFn: async () => {
      const secret = current.trim();
      if (!secret) throw new Error("Indiquez le secret partagé fourni par l’outil terrain.");
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { owner_id: ownerId, key: FIELD_SERVICE_QUOTE_SECRET_KEY, value: { secret } },
          { onConflict: "owner_id,key" },
        );
      if (error) throw new Error("Impossible d’enregistrer le secret.");
      return secret;
    },
    onSuccess: (secret) => {
      qc.setQueryData(configKey, secret);
      setDraft(null);
      toast.success("Secret enregistré.");
    },
    onError: (error) => toast.error(error.message),
  });
  const history = useQuery({
    queryKey: ["field-service-quote-history", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("history_events")
        .select("id, created_at, event_type, description, metadata")
        .eq("owner_id", ownerId)
        .in("event_type", FIELD_SERVICE_QUOTE_EVENTS)
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
          <Wrench className="h-5 w-5" /> Retour des devis vers l’outil terrain
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Une fois le devis chiffré, envoyez-le depuis la fiche devis (bouton « Envoyer au ticket
          d’origine ») pour qu’il apparaisse automatiquement sur le ticket importé depuis l’outil
          terrain. Le secret ci-dessous est transmis dans l’en-tête X-Webhook-Secret ; il est fourni
          par l’outil terrain, propre à votre compte.
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
            <Label htmlFor="field-service-quote-secret">Secret partagé</Label>
            <div className="flex gap-2">
              <Input
                id="field-service-quote-secret"
                type={reveal ? "text" : "password"}
                placeholder="Secret fourni par l’outil terrain"
                value={current}
                disabled={save.isPending}
                onChange={(event) => setDraft(event.target.value)}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => setReveal((v) => !v)}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-medium">20 derniers retours</h3>
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
          <p className="text-sm text-muted-foreground">Aucun devis renvoyé pour le moment.</p>
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
                      {entry.event_type === "field_service_quote_delivered"
                        ? "Reçu"
                        : entry.event_type === "field_service_quote_failed"
                          ? "Échec / non confirmé"
                          : "En cours / non confirmé"}
                      {meta.http_status ? ` · HTTP ${meta.http_status}` : ""}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("fr-FR")} · ticket{" "}
                    {String(meta.external_ticket_ref ?? "")}
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
