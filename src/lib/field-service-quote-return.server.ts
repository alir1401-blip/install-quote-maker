import { createClient } from "@supabase/supabase-js";
import {
  buildFieldServiceQuotePayload,
  postFieldServiceQuote,
  FIELD_SERVICE_QUOTE_SECRET_KEY,
} from "./field-service-quote-return.ts";
import type { QuoteSnapshot } from "./quote-webhook.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function sendFieldServiceQuoteReturn(request: Request, quoteId: string) {
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
      .eq("key", FIELD_SERVICE_QUOTE_SECRET_KEY)
      .maybeSingle();
    if (settingError)
      return reply({ error: "Impossible de lire la configuration du webhook." }, 503);
    const secret = setting?.value?.secret;
    if (typeof secret !== "string" || !secret)
      return reply(
        { error: "Configurez le secret partagé dans l’onglet Webhooks avant d’envoyer." },
        409,
      );
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
    if (!data?.quote || !Array.isArray(data.items) || !Array.isArray(data.tickets))
      return reply({ error: "Le devis reçu est incomplet." }, 503);
    const ticket = (data.tickets as { external_source?: string; external_ref?: string }[]).find(
      (t) => t.external_source === "field_service" && t.external_ref,
    );
    if (!ticket?.external_ref)
      return reply(
        { error: "Ce devis n’est pas lié à un ticket importé depuis l’outil terrain." },
        409,
      );
    const eventId = crypto.randomUUID();
    const payload = buildFieldServiceQuotePayload(
      data as QuoteSnapshot,
      ticket.external_ref,
      eventId,
      new Date().toISOString(),
    );
    const metadata = {
      quote_id: quoteId,
      quote_number: String(data.quote.quote_number),
      event_id: eventId,
      external_ticket_ref: ticket.external_ref,
    };
    const { error: logError } = await db.from("history_events").insert({
      id: eventId,
      owner_id: owner,
      actor_id: owner,
      event_type: "field_service_quote_pending",
      title: `Retour webhook du devis ${data.quote.quote_number}`,
      metadata,
    });
    if (logError)
      return reply(
        { error: "Impossible d’enregistrer la tentative d’envoi. Aucun POST n’a été envoyé." },
        503,
      );
    let outcome: { delivered: boolean; status: number | null; error?: string };
    try {
      outcome = await postFieldServiceQuote(secret, payload);
    } catch {
      outcome = {
        delivered: false,
        status: null,
        error:
          "Réception non confirmée : délai dépassé ou erreur réseau. Vérifiez l’outil terrain avant de réessayer.",
      };
    }
    const message = outcome.delivered
      ? "Devis reçu par l’outil terrain."
      : outcome.error || `L’outil terrain a répondu HTTP ${outcome.status}.`;
    const { error: updateError } = await db
      .from("history_events")
      .update({
        event_type: outcome.delivered
          ? "field_service_quote_delivered"
          : "field_service_quote_failed",
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
        error: "Envoi non confirmé. Consultez l’historique et l’outil terrain avant de réessayer.",
      },
      503,
    );
  }
}
