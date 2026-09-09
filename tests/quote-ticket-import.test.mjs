import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuoteTicketImport } from "../src/lib/quote-ticket-import.ts";
import { receiveWebhook } from "../src/lib/webhook-receiver.ts";

const payload = {
  event: "status_en_attente_devis",
  ticket: { id: "ext-1", title: "Porte bloquée" },
  client: { name: "Client Exemple" },
  site: { name: "Site Exemple" },
};
const parse = (value, type = "application/json") =>
  parseQuoteTicketImport(JSON.stringify(value), type);
const rejects = (value, status = 400) => assert.throws(() => parse(value), { status });

test("accepts the minimal shape and passes through unlisted fields", () => {
  assert.deepEqual(parse(payload), payload);
  const withExtra = {
    ...payload,
    problem: { panne_description: "Ressort cassé" },
    equipment: { code: "P-03", equipment_type: "Porte sectionnelle", serial_number: "SN-1" },
    equipment_checks: [{ status: "ko", note: "Ressort cassé" }],
    work_type: { name: "Maintenance préventive" },
    technician: { full_name: "Jean Dupont" },
  };
  assert.deepEqual(parse(withExtra), withExtra);
});

test("only handles the status_en_attente_devis event", () => {
  rejects({ ...payload, event: "status_cloture" });
  rejects({ ...payload, event: undefined });
});

test("requires a ticket id and either a client/site id or name", () => {
  rejects({ ...payload, ticket: { title: "x" } });
  rejects({ ...payload, ticket: { id: "" } });
  rejects({ ...payload, client: {} });
  rejects({ ...payload, site: {} });
  assert.deepEqual(parse({ ...payload, client: { id: "11111111-1111-4111-8111-111111111111" } }).client, {
    id: "11111111-1111-4111-8111-111111111111",
  });
});

test("validates coordinate ranges and equipment year", () => {
  for (const site of [{ lat: 91 }, { lat: -91 }, { lng: 181 }, { lng: "48.8" }]) {
    rejects({ ...payload, site: { ...payload.site, ...site } });
  }
  rejects({ ...payload, equipment: { code: "P-03", year: 2300 } });
  assert.equal(parse({ ...payload, site: { ...payload.site, lat: 48.85, lng: 2.35 } }).site.lat, 48.85);
});

test("rejects non-JSON, malformed JSON and oversized bodies", () => {
  assert.throws(() => parse(payload, "text/plain"), { status: 415 });
  assert.throws(() => parseQuoteTicketImport("{invalid", "application/json"), { status: 400 });
  assert.throws(() => parseQuoteTicketImport(" ".repeat(65537), "application/json"), {
    status: 413,
  });
});

test("the HTTP pipeline preserves the receipt shape", async () => {
  const token = "a".repeat(64);
  const request = new Request("https://example.com/api/webhooks/tickets/" + token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const entity = { id: "existing-or-created", number: "tck-000001", created: true };
  const response = await receiveWebhook(request, token, async (delivery) => {
    assert.deepEqual(parseQuoteTicketImport(delivery.p_body, delivery.p_content_type), payload);
    return {
      id: "receipt",
      received_at: "2026-09-09T12:00:00Z",
      client: entity,
      site: entity,
      installation: null,
      ticket: entity,
    };
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.received, true);
  assert.equal(body.ticket.created, true);
  assert.equal(body.installation, null);
});
