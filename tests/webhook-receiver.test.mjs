import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_WEBHOOK_BYTES, receiveWebhook, WebhookError } from "../src/lib/webhook-receiver.ts";

const token = "a".repeat(64);
const receipt = { id: "stored-event", received_at: "2026-09-08T12:00:00Z" };
const request = (body, headers = {}) =>
  new Request(`https://example.com/api/webhooks/${token}?tag=a&tag=b&api_key=private`, {
    method: "POST",
    headers,
    body,
  });

test("persists raw JSON, redacts credentials and preserves repeated query parameters", async () => {
  const body = '{ "message": "Bonjour 👋" }';
  let saved;
  const response = await receiveWebhook(
    request(body, {
      "Content-Type": "application/json",
      Authorization: "Bearer private",
      Cookie: "session=private",
      "X-Api-Key": "private",
      "X-Event": "ticket.created",
    }),
    token,
    async (delivery) => {
      saved = delivery;
      return receipt;
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, ...receipt });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(saved.p_body, body);
  assert.equal(saved.p_token, token);
  assert.equal(saved.p_headers.authorization, "[masqué]");
  assert.equal(saved.p_headers.cookie, "[masqué]");
  assert.equal(saved.p_headers["x-api-key"], "[masqué]");
  assert.equal(saved.p_headers["x-event"], "ticket.created");
  assert.deepEqual(saved.p_query_params, { tag: ["a", "b"], api_key: ["[masqué]"] });
});

test("accepts plain text, malformed JSON, forms and empty bodies without alteration", async () => {
  for (const body of ["texte libre", "{invalid", "name=Jean&city=Paris", ""]) {
    const response = await receiveWebhook(request(body), token, async (delivery) => {
      assert.equal(delivery.p_body, body);
      return receipt;
    });
    assert.equal(response.status, 200);
  }
});

test("rejects invalid tokens and methods before saving", async () => {
  let calls = 0;
  const save = async () => {
    calls++;
    return receipt;
  };
  assert.equal((await receiveWebhook(request("test"), "guessable", save)).status, 404);
  const result = await receiveWebhook(new Request("https://example.com"), token, save);
  assert.equal(result.status, 405);
  assert.equal(result.headers.get("Allow"), "POST");
  assert.equal(calls, 0);
});

test("rejects oversized bodies without a Content-Length header", async () => {
  let saved = false;
  const result = await receiveWebhook(
    request("a".repeat(MAX_WEBHOOK_BYTES + 1)),
    token,
    async () => {
      saved = true;
      return receipt;
    },
  );
  assert.equal(result.status, 413);
  assert.equal(saved, false);
});

test("accepts exactly the maximum body size", async () => {
  const result = await receiveWebhook(
    request("a".repeat(MAX_WEBHOOK_BYTES)),
    token,
    async (delivery) => {
      assert.equal(delivery.p_body.length, MAX_WEBHOOK_BYTES);
      return receipt;
    },
  );
  assert.equal(result.status, 200);
});

test("limits bytes rather than character count", async () => {
  const result = await receiveWebhook(
    request("é".repeat(MAX_WEBHOOK_BYTES / 2 + 1)),
    token,
    async () => {
      assert.fail("Oversized UTF-8 must not be saved");
    },
  );
  assert.equal(result.status, 413);
});

test("rejects malformed UTF-8 and null bytes", async () => {
  for (const body of [new Uint8Array([0xff, 0xfe]), "hello\u0000world"]) {
    const result = await receiveWebhook(request(body), token, async () => {
      assert.fail("Invalid text must not be saved");
    });
    assert.equal(result.status, 400);
  }
});

test("rejects oversized metadata", async () => {
  const result = await receiveWebhook(
    request("ok", { "X-Large": "a".repeat(13 * 1024) }),
    token,
    async () => {
      assert.fail("Oversized metadata must not be saved");
    },
  );
  assert.equal(result.status, 413);
});

test("never acknowledges a failed save or leaks internal errors", async () => {
  const result = await receiveWebhook(request("test"), token, async () => {
    throw new Error("sensitive database details");
  });
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /sensitive database/);
});

test("returns unknown endpoint and rate limit errors from persistence", async () => {
  for (const status of [404, 429]) {
    const result = await receiveWebhook(request("test"), token, async () => {
      throw new WebhookError(status, "Rejected");
    });
    assert.equal(result.status, status);
    if (status === 429) assert.equal(result.headers.get("Retry-After"), "60");
  }
});
