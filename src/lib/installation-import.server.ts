import { WebhookError } from "./webhook-receiver";
import type { InstallationImportPayload, InstallationImportReceipt } from "./installation-import";

export async function importInstallation(
  token: string,
  payload: InstallationImportPayload,
): Promise<InstallationImportReceipt> {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new WebhookError(503, "La création automatique n’est pas configurée.");
  const response = await fetch(new URL("/rest/v1/rpc/import_installation_from_webhook", url), {
    method: "POST",
    headers: {
      apikey: key,
      ...(!key.startsWith("sb_publishable_") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: token, p_payload: payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (["PT400", "PT403", "PT404", "PT409", "PT413"].includes(data.code)) {
      throw new WebhookError(Number(data.code.slice(2)), data.message);
    }
    if (data.code === "P0001" && data.message === "Webhook rate limit exceeded")
      throw new WebhookError(429, "Limite de 60 requêtes par minute atteinte.");
    if (data.code === "23505" || data.code === "23503") {
      throw new WebhookError(
        409,
        "Conflit avec une modification simultanée. Vérifiez les identifiants et réessayez.",
      );
    }
    if (["22P02", "22P05", "22003", "23514"].includes(data.code)) {
      throw new WebhookError(400, "Un champ du JSON est invalide.");
    }
    throw new WebhookError(503, "Impossible de traiter la requête. Réessayez plus tard.");
  }
  if (
    !data?.id ||
    !data?.client?.id ||
    !data?.site?.id ||
    !data?.installation?.id ||
    !data?.received_at
  ) {
    throw new WebhookError(503, "Le serveur n’a pas confirmé la création.");
  }
  return data;
}
