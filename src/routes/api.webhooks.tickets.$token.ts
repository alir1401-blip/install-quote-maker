import { createFileRoute } from "@tanstack/react-router";

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/webhooks/tickets/$token")({
  server: {
    handlers: {
      GET: methodNotAllowed,
      HEAD: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      OPTIONS: methodNotAllowed,
      POST: async ({ request, params }) => {
        const { receiveWebhook } = await import("@/lib/webhook-receiver");
        const { parseQuoteTicketImport } = await import("@/lib/quote-ticket-import");
        const { importQuoteTicket } = await import("@/lib/quote-ticket-import.server");
        return receiveWebhook(request, params.token, async (delivery) =>
          importQuoteTicket(
            params.token,
            parseQuoteTicketImport(delivery.p_body, delivery.p_content_type),
          ),
        );
      },
    },
  },
});
