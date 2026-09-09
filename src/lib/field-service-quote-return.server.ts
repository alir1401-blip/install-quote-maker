import { buildFieldServiceQuotePayload } from "./field-service-quote-return.ts";
import { loadConfig, openSession } from "./quote-webhook.server.ts";
import { postQuoteWebhook, type QuoteSnapshot } from "./quote-webhook.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function sendFieldServiceQuoteReturn(request: Request, quoteId: string) {
  // Reject an unauthenticated caller and a malformed id before any network round-trip.
  if (!request.headers.get("Authorization")?.startsWith("Bearer "))
    return reply({ error: "Connectez-vous pour envoyer le devis." }, 401);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId))
    return reply({ error: "Identifiant de devis invalide." }, 400);
  const session = await openSession(request);
  if (session.error) return session.error;
  const { db, owner } = session;
  try {
    const config = await loadConfig(db, owner);
    if (config.error) return config.error;
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
      outcome = await postQuoteWebhook(config.destination, payload, {
        apikey: config.apikey,
        secret: config.secret,
      });
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
