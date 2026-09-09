import { buildQuoteWebhookPayload, type QuoteSnapshot } from "./quote-webhook.ts";

// Fixed endpoint of the external field-service tool. Its apikey is a public anon key
// (safe to ship client-side); only the shared secret below is confidential.
export const FIELD_SERVICE_QUOTE_ENDPOINT =
  "https://snxunodxgbeldliiqlab.supabase.co/rest/v1/rpc/receive_ticket_quote";
export const FIELD_SERVICE_QUOTE_APIKEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueHVub2R4Z2JlbGRsaWlxbGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTA3OTEsImV4cCI6MjA5NTk2Njc5MX0.FwqbKKCn3PYSsa2eFw0Jt_1EVjS8EAFNWJjEOIZEMQs";
export const FIELD_SERVICE_QUOTE_SECRET_KEY = "field_service_quote_secret";
export const FIELD_SERVICE_QUOTE_EVENTS = [
  "field_service_quote_pending",
  "field_service_quote_delivered",
  "field_service_quote_failed",
];

export function buildFieldServiceQuotePayload(
  snapshot: QuoteSnapshot,
  externalTicketId: string,
  eventId: string,
  sentAt: string,
) {
  const payload = buildQuoteWebhookPayload(snapshot, eventId, sentAt);
  return { ...payload, quote: { ...payload.quote, ticket_id: externalTicketId } };
}

export async function postFieldServiceQuote(
  secret: string,
  payload: ReturnType<typeof buildFieldServiceQuotePayload>,
  send: typeof fetch = fetch,
) {
  const response = await send(FIELD_SERVICE_QUOTE_ENDPOINT, {
    method: "POST",
    headers: {
      apikey: FIELD_SERVICE_QUOTE_APIKEY,
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
    },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  // Never follow redirects or read an unbounded third-party response body.
  await response.body?.cancel();
  return { delivered: response.status >= 200 && response.status < 300, status: response.status };
}
