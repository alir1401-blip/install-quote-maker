import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, RefreshCw, Send, Webhook } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { QuoteWebhookCard } from "@/components/quote-webhook-card";
import { FieldServiceQuoteSecretCard } from "@/components/field-service-quote-secret-card";
import { InstallationImportCard } from "@/components/installation-import-card";
import { QuoteTicketImportCard } from "@/components/quote-ticket-import-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/webhooks")({ component: WebhooksPage });

function prettyBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function WebhooksPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const endpointKey = ["webhook-endpoint", user.id];
  const eventsKey = ["webhook-events", user.id];

  const endpoint = useQuery({
    queryKey: endpointKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const createEndpoint = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("webhook_endpoints").insert({ owner_id: user.id });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointKey }),
    onError: () => toast.error("Impossible de créer l’URL de réception."),
  });
  const events = useQuery({
    queryKey: eventsKey,
    enabled: !!endpoint.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("id, received_at, content_type, size_bytes")
        .eq("owner_id", user.id)
        .order("received_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
  const activeId = selectedId ?? events.data?.[0]?.id;
  const detail = useQuery({
    queryKey: ["webhook-event", user.id, activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("*")
        .eq("owner_id", user.id)
        .eq("id", activeId!)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });

  const endpointUrl =
    endpoint.data && typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/${endpoint.data.token}`
      : "";
  const test = useMutation({
    mutationFn: async () => {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "webhook.test",
          message: "Bonjour ! Votre webhook fonctionne.",
          sent_at: new Date().toISOString(),
        }),
      });
      const receipt = await response.json().catch(() => null);
      if (!response.ok || !receipt?.received) {
        throw new Error(receipt?.error || "Le serveur n’a pas confirmé la réception du webhook.");
      }
      return receipt.id as string;
    },
    onSuccess: (id) => {
      setSelectedId(id);
      void queryClient.invalidateQueries({ queryKey: eventsKey });
      toast.success("Webhook reçu et enregistré.");
    },
    onError: (error) => toast.error(error.message),
  });

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié dans le presse-papiers.");
    } catch {
      toast.error("Copie impossible. Sélectionnez et copiez le texte manuellement.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Recevez les messages de vos outils et envoyez vos devis par webhook."
        actions={
          <Button
            variant="outline"
            disabled={endpoint.isFetching || events.isFetching}
            onClick={() => {
              void endpoint.refetch();
              if (endpoint.data) void events.refetch();
              if (activeId) void detail.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Actualiser
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-5 w-5 text-primary" /> Votre URL de réception
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {endpoint.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Chargement…
            </p>
          ) : endpoint.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Impossible de charger votre URL de réception. Réessayez avec « Actualiser ».
            </p>
          ) : !endpoint.data ? (
            <>
              <p className="text-sm text-muted-foreground">
                Créez votre URL, puis renseignez-la dans l’outil qui envoie vos webhooks.
              </p>
              <Button onClick={() => createEndpoint.mutate()} disabled={createEndpoint.isPending}>
                {createEndpoint.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer mon URL de réception
              </Button>
            </>
          ) : (
            <>
              <Label htmlFor="webhook-url">Envoyez vos requêtes POST à cette adresse</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="webhook-url"
                  readOnly
                  value={endpointUrl}
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button variant="outline" onClick={() => copy(endpointUrl)}>
                  <Copy className="mr-2 h-4 w-4" /> Copier
                </Button>
                <Button onClick={() => test.mutate()} disabled={test.isPending || !endpointUrl}>
                  {test.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}{" "}
                  Envoyer un test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Gardez cette URL privée : toute personne qui la connaît peut vous envoyer un
                message. JSON, texte et formulaires UTF-8 acceptés, jusqu’à 256 Ko et 60 messages
                par minute.
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Exemple de requête cURL
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-4 text-xs">
                  {`curl -X POST "${endpointUrl}" -H "Content-Type: application/json" -d '{"event":"test","message":"Bonjour"}'`}
                </pre>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      <QuoteWebhookCard ownerId={user.id} />

      <FieldServiceQuoteSecretCard ownerId={user.id} />

      {endpoint.data && (
        <>
          <InstallationImportCard
            endpoint={endpoint.data}
            onChange={() => queryClient.invalidateQueries({ queryKey: endpointKey })}
          />
          <QuoteTicketImportCard
            endpoint={endpoint.data}
            onChange={() => queryClient.invalidateQueries({ queryKey: endpointKey })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Messages reçus</h2>
            <span className="text-xs text-muted-foreground">
              50 derniers messages · Actualisation toutes les 5 s
            </span>
          </div>
          {events.isError && (
            <p role="alert" className="text-sm text-destructive">
              Impossible d’actualiser les messages. Réessayez avec « Actualiser ».
            </p>
          )}
          {events.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Chargement des messages…
            </p>
          ) : !events.data?.length && !events.isError ? (
            <EmptyState
              title="En attente du premier webhook"
              description="Envoyez un test ou configurez votre outil avec l’URL ci-dessus. Les messages seront conservés même lorsque cette page est fermée."
            />
          ) : (
            !!events.data?.length && (
              <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div
                  className="max-h-[650px] space-y-2 overflow-y-auto"
                  aria-label="Messages reçus"
                >
                  {events.data.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      aria-pressed={activeId === event.id}
                      onClick={() => setSelectedId(event.id)}
                      className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/60 ${activeId === event.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">POST</Badge>
                        <span className="text-xs text-muted-foreground">
                          {event.size_bytes.toLocaleString("fr-FR")} octets
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {new Date(event.received_at).toLocaleString("fr-FR")}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {event.content_type}
                      </p>
                    </button>
                  ))}
                </div>
                <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle className="text-base">Détail du message</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detail.isPending ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        Chargement…
                      </p>
                    ) : detail.isError ? (
                      <p role="alert" className="text-sm text-destructive">
                        Impossible de charger ce message.
                      </p>
                    ) : (
                      detail.data && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              Reçu le {new Date(detail.data.received_at).toLocaleString("fr-FR")}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copy(detail.data.body)}
                            >
                              <Copy className="mr-2 h-4 w-4" /> Copier le contenu
                            </Button>
                          </div>
                          <Tabs defaultValue="body">
                            <TabsList className="flex h-auto flex-wrap">
                              <TabsTrigger value="body">Contenu</TabsTrigger>
                              <TabsTrigger value="raw">Brut</TabsTrigger>
                              <TabsTrigger value="headers">En-têtes</TabsTrigger>
                              <TabsTrigger value="params">Paramètres</TabsTrigger>
                            </TabsList>
                            {[
                              ["body", prettyBody(detail.data.body) || "(corps vide)"],
                              ["raw", detail.data.body || "(corps vide)"],
                              ["headers", JSON.stringify(detail.data.headers, null, 2)],
                              ["params", JSON.stringify(detail.data.query_params, null, 2)],
                            ].map(([tab, content]) => (
                              <TabsContent key={tab} value={tab}>
                                <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
                                  {content}
                                </pre>
                              </TabsContent>
                            ))}
                          </Tabs>
                          <p className="text-xs text-muted-foreground">
                            Les en-têtes et paramètres d’authentification courants sont masqués.
                          </p>
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
