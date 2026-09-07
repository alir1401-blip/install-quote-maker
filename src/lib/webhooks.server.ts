import { WebhookError, type WebhookDelivery } from "./webhook-receiver";

export async function saveWebhook(delivery: WebhookDelivery) {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new WebhookError(503, "La réception des webhooks n’est pas configurée.");

  // A public RPC accepts the secret delivery token and assigns ownership in PostgreSQL.
  // No service-role key or user session is needed to receive a third-party webhook.
  const response = await fetch(new URL("/rest/v1/rpc/receive_webhook", url), {
    method: "POST",
    headers: {
      apikey: key,
      ...(!key.startsWith("sb_publishable_") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(delivery),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.code === "P0002") throw new WebhookError(404, "URL de réception inconnue.");
    if (data.code === "P0001")
      throw new WebhookError(429, "Limite de 60 messages par minute atteinte.");
    if (data.code === "23514" || data.code === "22P05") {
      throw new WebhookError(400, "Le contenu du webhook est invalide ou trop volumineux.");
    }
    throw new WebhookError(503, "Impossible d’enregistrer le webhook. Réessayez plus tard.");
  }
  const event = data[0];
  if (!event?.id || !event?.received_at) throw new Error("Missing webhook receipt");
  return { id: String(event.id), received_at: String(event.received_at) };
}
