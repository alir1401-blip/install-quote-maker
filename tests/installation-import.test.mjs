import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInstallationImport } from "../src/lib/installation-import.ts";
import { receiveWebhook } from "../src/lib/webhook-receiver.ts";

const payload = {
  client: { name: "Client Exemple" },
  site: { name: "Site Exemple" },
  installation: { name: "Porte 1" },
};
const parse = (value, type = "application/json") =>
  parseInstallationImport(JSON.stringify(value), type);
const rejects = (value, status = 400) => assert.throws(() => parse(value), { status });

test("accepts the creation hierarchy and existing UUID references", () => {
  assert.deepEqual(parse(payload), payload);
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parse({ ...payload, client: { id } }).client, { id });
  assert.equal(parse(payload, "application/json; charset=utf-8").site.name, "Site Exemple");
});

test("requires three objects with a name or existing identifier", () => {
  for (const value of [
    null,
    [],
    {},
    { client: {} },
    { ...payload, site: {} },
    { ...payload, installation: { name: "   " } },
  ])
    rejects(value);
});

test("rejects unknown and ownership fields instead of silently accepting them", () => {
  rejects({ ...payload, owner_id: "forged" });
  rejects({ ...payload, client: { ...payload.client, owner_id: "forged" } });
  rejects({ ...payload, site: { ...payload.site, client_id: "forged" } });
  rejects({ ...payload, installation: { ...payload.installation, site_id: "forged" } });
});

test("validates identifiers, year, names and characteristics", () => {
  rejects({ ...payload, client: { id: "unknown" } });
  rejects({ ...payload, installation: { name: "x", year: 2020.5 } });
  rejects({ ...payload, installation: { name: "x", year: 2300 } });
  rejects({ ...payload, installation: { name: "x", characteristics: [] } });
  rejects({ ...payload, client: { name: "x".repeat(201) } });
});

test("rejects non-JSON, malformed JSON and oversized bodies", () => {
  assert.throws(() => parse(payload, "text/plain"), { status: 415 });
  assert.throws(() => parseInstallationImport("{invalid", "application/json"), { status: 400 });
  assert.throws(() => parseInstallationImport(" ".repeat(65537), "application/json"), {
    status: 413,
  });
});

test("the HTTP pipeline preserves creation flags and IDs in its receipt", async () => {
  const token = "a".repeat(64);
  const request = new Request("https://example.com/api/imports/installations/" + token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const entity = { id: "existing-or-created", number: "00001", created: true };
  const response = await receiveWebhook(request, token, async (delivery) => {
    assert.deepEqual(parseInstallationImport(delivery.p_body, delivery.p_content_type), payload);
    return {
      id: "receipt",
      received_at: "2026-09-08T12:00:00Z",
      client: entity,
      site: entity,
      installation: entity,
    };
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.received, true);
  assert.equal(body.installation.created, true);
  assert.equal(body.client.id, entity.id);
});
