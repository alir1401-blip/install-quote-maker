import { z } from "zod";
import { WebhookError } from "./webhook-receiver.ts";

const text = z.string().max(10000).nullable().optional();
const shortText = z.string().max(200).nullable().optional();

export const quoteTicketImportSchema = z
  .object({
    event: z.literal("status_en_attente_devis"),
    ticket: z
      .object({
        id: z.string().min(1).max(200),
        number: shortText,
        title: shortText,
        description: text,
        type: shortText,
        priority: shortText,
        status: shortText,
        full_site_visit: z.boolean().nullable().optional(),
        requested_date: shortText,
        planned_date: shortText,
      })
      .passthrough(),
    problem: z
      .object({
        panne_description: text,
        actions_done: text,
        recommendation: text,
      })
      .passthrough()
      .nullable()
      .optional(),
    client: z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).max(200).nullable().optional(),
        contact_name: shortText,
        contact_email: shortText,
        contact_phone: shortText,
      })
      .passthrough()
      .refine((value) => !!(value.id || value.name), {
        message: "Indiquez client.id ou client.name.",
      }),
    site: z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).max(200).nullable().optional(),
        address: text,
        postal_code: shortText,
        city: shortText,
        region: shortText,
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        contact_name: shortText,
        contact_phone: shortText,
        access_notes: text,
      })
      .passthrough()
      .refine((value) => !!(value.id || value.name), {
        message: "Indiquez site.id ou site.name.",
      }),
    equipment: z
      .object({
        id: z.string().uuid().nullable().optional(),
        code: shortText,
        equipment_type: shortText,
        brand: shortText,
        model: shortText,
        serial_number: shortText,
        year: z.number().int().min(1800).max(2200).nullable().optional(),
        state: shortText,
        stopped: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    equipment_checks: z.array(z.unknown()).nullable().optional(),
    work_type: z
      .object({ id: z.string().nullable().optional(), name: shortText })
      .passthrough()
      .nullable()
      .optional(),
    technician: z
      .object({
        id: z.string().nullable().optional(),
        full_name: shortText,
        phone: shortText,
        email: shortText,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type QuoteTicketImportPayload = z.infer<typeof quoteTicketImportSchema>;
export type ImportedEntity = { id: string; number: string; created: boolean };
export type QuoteTicketImportReceipt = {
  id: string;
  received_at: string;
  client: ImportedEntity;
  site: ImportedEntity;
  installation: ImportedEntity | null;
  ticket: ImportedEntity;
};

export function parseQuoteTicketImport(
  body: string,
  contentType: string,
): QuoteTicketImportPayload {
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
  const parsed = quoteTicketImportSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new WebhookError(400, `${issue.path.join(".") || "Requête"} : ${issue.message}`);
  }
  return parsed.data;
}
