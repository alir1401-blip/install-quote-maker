import { createClient } from "@supabase/supabase-js";
import {
  buildQuoteWebhookPayload,
  postQuoteWebhook,
  QUOTE_WEBHOOK_KEY,
  validateQuoteWebhookUrl,
  type QuoteSnapshot,
} from "./quote-webhook.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function sendSavedQuoteWebhook(request: Request, quoteId: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply({ error: "Connectez-vous pour envoyer le devis." }, 401);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId))
    return reply({ error: "Identifiant de devis invalide." }, 400);
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return reply({ error: "L’envoi des devis n’est pas configuré sur le serveur." }, 503);
  // Every database request uses the caller's JWT and RLS, never a service-role key.
  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return reply({ error: "Session expirée. Reconnectez-vous." }, 401);
    const owner = auth.user.id;
    const { data: setting, error: settingError } = await db
      .from("app_settings")
      .select("value")
      .eq("owner_id", owner)
      .eq("key", QUOTE_WEBHOOK_KEY)
      .maybeSingle();
    if (settingError)
      return reply({ error: "Impossible de lire la configuration du webhook." }, 503);
    if (setting?.value?.enabled !== true || !setting.value.url)
      return reply(
        { error: "Configurez et activez l’envoi des devis dans l’onglet Webhooks." },
        409,
      );
    let destination: string;
    try {
      destination = validateQuoteWebhookUrl(setting.value.url);
    } catch {
      return reply(
        { error: "L’URL du webhook est invalide. Corrigez-la dans l’onglet Webhooks." },
        400,
      );
    }
    const { data, error } = await db.rpc("get_quote_webhook_snapshot", { p_quote_id: quoteId });
    if (error)
      return reply(
        {
          error:
            error.code === "PT404"
              ? "Devis introuvable."
              : "Impossible de charger le devis complet. Vérifiez que la migration des webhooks a été appliquée.",
        },
        error.code === "PT404" ? 404 : 503,
      );
    if (!data?.quote || !Array.isArray(data.items) || !Array.isArray(data.installations))
      return reply({ error: "Le devis reçu est incomplet." }, 503);
    const eventId = crypto.randomUUID();
    const payload = buildQuoteWebhookPayload(
      data as QuoteSnapshot,
      eventId,
      new Date().toISOString(),
    );
    const metadata = {
      quote_id: quoteId,
      quote_number: String(data.quote.quote_number),
      event_id: eventId,
      destination_host: new URL(destination).hostname,
    };
    const { error: logError } = await db.from("history_events").insert({
      id: eventId,
      owner_id: owner,
      actor_id: owner,
      event_type: "quote_webhook_pending",
      title: `Envoi webhook du devis ${data.quote.quote_number}`,
      metadata,
    });
    if (logError)
      return reply(
        { error: "Impossible d’enregistrer la tentative d’envoi. Aucun POST n’a été envoyé." },
        503,
      );
    let outcome: { delivered: boolean; status: number | null; error?: string };
    try {
      outcome = await postQuoteWebhook(destination, payload);
    } catch {
      outcome = {
        delivered: false,
        status: null,
        error:
          "Réception non confirmée : délai dépassé ou erreur réseau. Vérifiez le destinataire avant de réessayer.",
      };
    }
    const message = outcome.delivered
      ? "Devis reçu par le webhook."
      : outcome.error || `Le webhook a répondu HTTP ${outcome.status}.`;
    const { error: updateError } = await db
      .from("history_events")
      .update({
        event_type: outcome.delivered ? "quote_webhook_delivered" : "quote_webhook_failed",
        description: message,
        metadata: { ...metadata, http_status: outcome.status },
      })
      .eq("id", eventId)
      .eq("owner_id", owner);
    return reply(
      {
        delivered: outcome.delivered,
        event_id: eventId,
        http_status: outcome.status,
        ...(outcome.delivered ? {} : { error: message }),
        ...(updateError
          ? { warning: "Le résultat n’a pas pu être enregistré dans l’historique." }
          : {}),
      },
      outcome.delivered ? 200 : 502,
    );
  } catch {
    return reply(
      {
        error: "Envoi non confirmé. Consultez l’historique et le destinataire avant de réessayer.",
      },
      503,
    );
  }
}
