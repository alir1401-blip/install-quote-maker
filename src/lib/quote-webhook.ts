export const QUOTE_WEBHOOK_KEY = "quote_webhook";
export const QUOTE_WEBHOOK_EVENTS = [
  "quote_webhook_pending",
  "quote_webhook_delivered",
  "quote_webhook_failed",
];

// Defaults target the field-service tool that sends us the tickets; its apikey is a public
// anon key. Everything stays editable, and the shared secret is never pre-filled.
export const QUOTE_WEBHOOK_DEFAULTS = {
  url: "https://snxunodxgbeldliiqlab.supabase.co/rest/v1/rpc/receive_ticket_quote",
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueHVub2R4Z2JlbGRsaWlxbGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTA3OTEsImV4cCI6MjA5NTk2Njc5MX0.FwqbKKCn3PYSsa2eFw0Jt_1EVjS8EAFNWJjEOIZEMQs",
  secret: "",
};

export type QuoteWebhookCredentials = { apikey?: string; secret?: string };

export function validateQuoteWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Indiquez une URL HTTPS valide.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    value.length > 2048 ||
    !hostname.includes(".") ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    /^[\d.]+$/.test(hostname) ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hostname)
  ) {
    throw new Error(
      "Utilisez une URL HTTPS publique, sans identifiants ni fragment, sur le port 443.",
    );
  }
  return url.toString();
}

type Row = Record<string, unknown>;
export type QuoteSnapshot = {
  quote: Row;
  client: Row | null;
  site: Row | null;
  contract: Row | null;
  items: (Row & { part: Row | null })[];
  installations: Row[];
  tickets: Row[];
  report: Row | null;
  ticket_group: Row | null;
  document: Row;
};
const num = (value: unknown, fallback = 0) => Number(value ?? fallback);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildQuoteWebhookPayload(snapshot: QuoteSnapshot, eventId: string, sentAt: string) {
  const q = snapshot.quote;
  // Keep the same billing rules as the saved quote document, including linear metres.
  const items = snapshot.items.map((item) => {
    const billableQuantity =
      num(item.quantity) *
      (item.part?.pricing_unit === "linear_meter" || num(item.length_meters) > 0
        ? num(item.length_meters) || 1
        : 1);
    return {
      ...item,
      billable_quantity: billableQuantity,
      total_ht: money(num(item.unit_price) * billableQuantity),
    };
  });
  const parts = snapshot.items.reduce(
    (sum, item, index) => sum + num(item.unit_price) * items[index].billable_quantity,
    0,
  );
  const labor = num(q.labor_hours) * num(q.travel_count, 1) * num(q.labor_rate);
  const fees = [
    "travel_fee",
    "shipping_fee",
    "waste_treatment_fee",
    "oversized_shipping_fee",
    "dump_evacuation_fee",
    "lifting_equipment_fee",
  ] as const;
  const total = parts + labor + fees.reduce((sum, key) => sum + num(q[key]), 0);
  const vat = (total * num(q.vat_rate)) / 100;
  // The receiver attaches the quote to the ticket it sent us, so quote.ticket_id carries the
  // source ticket reference rather than our internal identifier whenever the quote has one.
  const sourceTicket = snapshot.tickets.find(
    (ticket) => ticket.external_source === "field_service" && ticket.external_ref,
  );
  return {
    event: "quote.exported",
    schema_version: 1,
    event_id: eventId,
    sent_at: sentAt,
    currency: "EUR",
    ...snapshot,
    quote: { ...q, ticket_id: sourceTicket?.external_ref ?? q.ticket_id ?? null },
    items,
    totals: {
      parts_ht: money(parts),
      labor_ht: money(labor),
      ...Object.fromEntries(fees.map((key) => [key, num(q[key])])),
      total_ht: money(total),
      vat_rate: num(q.vat_rate),
      vat_amount: money(vat),
      total_ttc: money(total + vat),
    },
  };
}

export function buildQuoteWebhookTestPayload(eventId: string, sentAt: string) {
  return {
    event: "quote.exported",
    schema_version: 1,
    event_id: eventId,
    sent_at: sentAt,
    test: true,
    currency: "EUR",
    quote: { quote_number: "TEST-0000", ticket_id: null, status: "brouillon" },
    items: [],
    totals: { total_ht: 0, vat_rate: 0, vat_amount: 0, total_ttc: 0 },
  };
}

export async function postQuoteWebhook(
  url: string,
  payload: { event: string; event_id: string },
  { apikey, secret, send = fetch }: QuoteWebhookCredentials & { send?: typeof fetch } = {},
) {
  const response = await send(validateQuoteWebhookUrl(url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Event": payload.event,
      "X-Webhook-Id": payload.event_id,
      ...(apikey ? { apikey } : {}),
      ...(secret ? { "X-Webhook-Secret": secret } : {}),
    },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  // Never follow redirects or read an unbounded third-party response body.
  await response.body?.cancel();
  return { delivered: response.status >= 200 && response.status < 300, status: response.status };
}
