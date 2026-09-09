import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQuoteWebhookPayload,
  postQuoteWebhook,
  validateQuoteWebhookUrl,
} from "../src/lib/quote-webhook.ts";
import { sendSavedQuoteWebhook } from "../src/lib/quote-webhook.server.ts";

const snapshot = {
  quote: {
    id: "q",
    quote_number: "DEV-1",
    notes: "Note du devis",
    labor_hours: 2,
    labor_rate: 50,
    travel_count: 2,
    travel_fee: 30,
    shipping_fee: 10,
    waste_treatment_fee: 5,
    oversized_shipping_fee: 15,
    dump_evacuation_fee: 20,
    lifting_equipment_fee: 25,
    vat_rate: 20,
  },
  client: { name: "Client" },
  site: { name: "Site" },
  contract: { type: "maintenance" },
  items: [
    {
      quantity: 2,
      length_meters: 1.5,
      unit_price: 10,
      unit_cost: 5,
      installation_id: "i1",
      part: { pricing_unit: "linear_meter" },
    },
    { quantity: 3, unit_price: 20, installation_id: "i2", part: null },
  ],
  installations: [{ id: "i1", brand: { name: "Marque" } }, { id: "i2" }],
  tickets: [],
  report: null,
  ticket_group: null,
  document: { terms: "Conditions" },
};
test("exports all saved data and totals with linear metres, labour, fees and VAT", () => {
  const result = buildQuoteWebhookPayload(snapshot, "event-1", "2026-09-09T12:00:00Z");
  assert.equal(result.event, "quote.exported");
  assert.equal(result.event_id, "event-1");
  assert.equal(result.items[0].billable_quantity, 3);
  assert.equal(result.items[0].total_ht, 30);
  assert.equal(result.totals.parts_ht, 90);
  assert.equal(result.totals.labor_ht, 200);
  assert.equal(result.totals.total_ht, 395);
  assert.equal(result.totals.vat_amount, 79);
  assert.equal(result.totals.total_ttc, 474);
  assert.deepEqual(result.installations, snapshot.installations);
  assert.equal(result.quote.notes, "Note du devis");
  assert.equal(result.document.terms, "Conditions");
  assert.equal(snapshot.items[0].total_ht, undefined);
});
test("handles a stock-site quote without installations or parts and rounds currency", () => {
  const result = buildQuoteWebhookPayload(
    {
      ...snapshot,
      quote: { vat_rate: 20 },
      installations: [],
      items: [{ quantity: 3, unit_price: 0.1, part: null }],
    },
    "e",
    "now",
  );
  assert.deepEqual(result.installations, []);
  assert.equal(result.totals.total_ht, 0.3);
  assert.equal(result.totals.total_ttc, 0.36);
});
test("requires public HTTPS destinations and rejects credentials, local IPs and redirects", () => {
  assert.equal(
    validateQuoteWebhookUrl(" https://hooks.example.com/devis?key=abc "),
    "https://hooks.example.com/devis?key=abc",
  );
  for (const url of [
    "invalid",
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://10.0.0.1",
    "https://host.internal",
    "https://user:pass@example.com",
    "https://example.com/#fragment",
    "https://example.com:8080",
  ])
    assert.throws(() => validateQuoteWebhookUrl(url));
});
test("POST sends JSON and event headers without forwarding user credentials; only 2xx is success", async () => {
  const payload = buildQuoteWebhookPayload(snapshot, "e", "now");
  for (const status of [200, 204, 302, 400, 500]) {
    const result = await postQuoteWebhook(
      "https://hooks.example.com",
      payload,
      async (url, init) => {
        assert.equal(init.method, "POST");
        assert.equal(init.redirect, "manual");
        assert.equal(init.headers["Content-Type"], "application/json");
        assert.equal(init.headers["X-Webhook-Id"], "e");
        assert.equal(init.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(init.body), payload);
        return new Response(null, { status });
      },
    );
    assert.equal(result.delivered, status >= 200 && status < 300);
    assert.equal(result.status, status);
  }
  await assert.rejects(
    postQuoteWebhook("https://hooks.example.com", payload, async () => {
      throw new Error("network");
    }),
  );
});
test("rejects unauthenticated requests and malformed IDs before accessing data or sending", async () => {
  assert.equal(
    (await sendSavedQuoteWebhook(new Request("https://app.example.com/api"), "q")).status,
    401,
  );
  assert.equal(
    (
      await sendSavedQuoteWebhook(
        new Request("https://app.example.com/api", { headers: { Authorization: "Bearer test" } }),
        "q",
      )
    ).status,
    400,
  );
});

test("authenticated pipeline uses saved configuration, records outcomes and blocks missing/foreign quotes", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://database.example.com";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const quoteId = "00000000-0000-4000-8000-000000000001";
  try {
    for (const scenario of [
      "success",
      "disabled",
      "foreign",
      "log_failure",
      "remote_failure",
      "network_failure",
    ]) {
      let outgoing = 0;
      const records = [];
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://hooks.example.com")) {
          outgoing++;
          assert.equal(new Headers(init.headers).has("authorization"), false);
          assert.equal(JSON.parse(init.body).quote.notes, "Note du devis");
          if (scenario === "network_failure") throw new Error("network");
          return new Response(null, { status: scenario === "remote_failure" ? 500 : 204 });
        }
        assert.equal(new Headers(init.headers).get("Authorization"), "Bearer caller-jwt");
        if (url.includes("/auth/v1/user"))
          return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
        if (url.includes("/rest/v1/app_settings"))
          return Response.json([
            { value: { enabled: scenario !== "disabled", url: "https://hooks.example.com/devis" } },
          ]);
        if (url.includes("/rest/v1/rpc/get_quote_webhook_snapshot")) {
          assert.deepEqual(JSON.parse(init.body), { p_quote_id: quoteId });
          return scenario === "foreign"
            ? Response.json({ code: "PT404", message: "Devis introuvable" }, { status: 404 })
            : Response.json(snapshot);
        }
        if (url.includes("/rest/v1/history_events")) {
          records.push(JSON.parse(init.body));
          return scenario === "log_failure"
            ? Response.json({ code: "error", message: "unavailable" }, { status: 503 })
            : new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected request: ${url}`);
      };
      const response = await sendSavedQuoteWebhook(
        new Request("https://app.example.com/api", {
          method: "POST",
          headers: { Authorization: "Bearer caller-jwt" },
        }),
        quoteId,
      );
      const result = await response.json();
      if (["disabled", "foreign", "log_failure"].includes(scenario)) {
        assert.equal(outgoing, 0, scenario);
        assert.ok(response.status >= 400, scenario);
      } else {
        assert.equal(outgoing, 1, scenario);
        assert.equal(records[0].event_type, "quote_webhook_pending");
        assert.equal(
          records[1].event_type,
          scenario === "success" ? "quote_webhook_delivered" : "quote_webhook_failed",
        );
        assert.equal(result.delivered, scenario === "success");
        assert.equal(records[0].metadata.event_id, result.event_id);
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
