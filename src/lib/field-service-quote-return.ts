import { buildQuoteWebhookPayload, type QuoteSnapshot } from "./quote-webhook.ts";

export const FIELD_SERVICE_QUOTE_EVENTS = [
  "field_service_quote_pending",
  "field_service_quote_delivered",
  "field_service_quote_failed",
];

// Same delivery settings as the quote webhook; only the ticket reference differs, so the
// field-service tool can attach the quote to the ticket it sent us.
export function buildFieldServiceQuotePayload(
  snapshot: QuoteSnapshot,
  externalTicketId: string,
  eventId: string,
  sentAt: string,
) {
  const payload = buildQuoteWebhookPayload(snapshot, eventId, sentAt);
  return { ...payload, quote: { ...payload.quote, ticket_id: externalTicketId } };
}
