import { z } from "zod";
import { WebhookError } from "./webhook-receiver.ts";

const text = z.string().max(10000).nullable().optional();
const identity = {
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200).nullable().optional(),
};
const hasIdentity = (value: { id?: string | null; name?: string | null }) =>
  !!(value.id || value.name);
const identityMessage = { message: "Indiquez un nom ou un identifiant existant." };

export const installationImportSchema = z
  .object({
    client: z
      .object({
        ...identity,
        email: text,
        phone: text,
        address: text,
        contact_name: text,
        notes: text,
        siret: text,
      })
      .strict()
      .refine(hasIdentity, identityMessage),
    site: z
      .object({
        ...identity,
        email: text,
        address: text,
        contact_name: text,
        contact_phone: text,
        notes: text,
      })
      .strict()
      .refine(hasIdentity, identityMessage),
    installation: z
      .object({
        ...identity,
        serial_number: text,
        location: text,
        notes: text,
        year: z.number().int().min(1800).max(2200).nullable().optional(),
        characteristics: z.record(z.unknown()).optional(),
      })
      .strict()
      .refine(hasIdentity, identityMessage),
  })
  .strict();

export type InstallationImportPayload = z.infer<typeof installationImportSchema>;
export type ImportedEntity = { id: string; number: string; created: boolean };
export type InstallationImportReceipt = {
  id: string;
  received_at: string;
  client: ImportedEntity;
  site: ImportedEntity;
  installation: ImportedEntity;
};

export function parseInstallationImport(
  body: string,
  contentType: string,
): InstallationImportPayload {
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new WebhookError(415, "Utilisez Content-Type: application/json.");
  }
  if (new TextEncoder().encode(body).byteLength > 65536) {
    throw new WebhookError(413, "Le JSON dépasse 64 Ko.");
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new WebhookError(400, "Le corps doit être un JSON valide.");
  }
  const parsed = installationImportSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new WebhookError(400, `${issue.path.join(".") || "Requête"} : ${issue.message}`);
  }
  return parsed.data;
}
