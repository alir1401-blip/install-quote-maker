export const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_METADATA_BYTES = 12 * 1024;
const sensitiveName = /authorization|cookie|token|secret|api[-_]?key|password|signature/i;

export type WebhookDelivery = {
  p_token: string;
  p_body: string;
  p_content_type: string;
  p_headers: Record<string, string>;
  p_query_params: Record<string, string[]>;
};

export class WebhookError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function webhookResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES) {
    throw new WebhookError(413, "Le message dépasse 256 Ko.");
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new WebhookError(413, "Le message dépasse 256 Ko.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (body.includes("\u0000")) throw new Error("NUL");
    return body;
  } catch {
    throw new WebhookError(400, "Le message doit être un texte UTF-8 sans caractère nul.");
  }
}

export async function receiveWebhook(
  request: Request,
  token: string,
  save: (delivery: WebhookDelivery) => Promise<{ id: string; received_at: string }>,
) {
  try {
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    }
    if (!/^[a-f0-9]{64}$/.test(token)) throw new WebhookError(404, "URL de réception inconnue.");
    const body = await readBody(request);
    const headers = Object.fromEntries(
      [...request.headers].map(([key, value]) => [
        key,
        sensitiveName.test(key) ? "[masqué]" : value,
      ]),
    );
    const params = new URL(request.url).searchParams;
    const queryParams = Object.fromEntries(
      [...new Set(params.keys())].map((key) => [
        key,
        sensitiveName.test(key) ? ["[masqué]"] : params.getAll(key),
      ]),
    );
    const encoder = new TextEncoder();
    if (
      encoder.encode(JSON.stringify(headers)).byteLength > MAX_METADATA_BYTES ||
      encoder.encode(JSON.stringify(queryParams)).byteLength > MAX_METADATA_BYTES
    ) {
      throw new WebhookError(413, "Les en-têtes ou paramètres sont trop volumineux.");
    }
    const result = await save({
      p_token: token,
      p_body: body,
      p_content_type: request.headers.get("content-type") || "text/plain",
      p_headers: headers,
      p_query_params: queryParams,
    });
    return webhookResponse({ received: true, ...result });
  } catch (error) {
    if (error instanceof WebhookError) {
      return webhookResponse({ error: error.message }, error.status);
    }
    return webhookResponse(
      { error: "Impossible d’enregistrer le webhook. Réessayez plus tard." },
      503,
    );
  }
}
