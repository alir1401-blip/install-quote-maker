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

test("accepts optional catalogue references, photo and site coordinates", () => {
  const value = {
    ...payload,
    site: { ...payload.site, latitude: 0, longitude: -180 },
    installation: {
      ...payload.installation,
      type: { name: "Porte automatique" },
      brand: { name: "Marque" },
      model: { id: "11111111-1111-4111-8111-111111111111" },
      contract: { name: "Maintenance annuelle", type: "maintenance" },
      photo_url: "https://example.com/porte.jpg",
    },
  };
  assert.deepEqual(parse(value), value);
  assert.equal(parse({ ...payload, installation: { ...payload.installation, brand: null } }).installation.brand, null);
});

test("rejects malformed catalogue references and unsupported contract types", () => {
  for (const key of ["type", "brand", "model", "contract"]) {
    for (const value of ["name", {}, { id: "invalid" }, { name: " " }, { name: "x", owner_id: "forged" }]) {
      rejects({ ...payload, installation: { ...payload.installation, [key]: value } });
    }
  }
  rejects({ ...payload, installation: { ...payload.installation, contract: { name: "x", type: "invalid" } } });
  rejects({ ...payload, installation: { ...payload.installation, contract: { type: "maintenance" } } });
});

test("validates coordinate ranges and rejects numeric strings", () => {
  for (const site of [{ latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 }, { latitude: "48.8" }]) {
    rejects({ ...payload, site: { ...payload.site, ...site } });
  }
  assert.equal(parse({ ...payload, site: { ...payload.site, latitude: null, longitude: 180 } }).site.longitude, 180);
});