import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/quotes/$quoteId/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { sendSavedQuoteWebhook } = await import("@/lib/quote-webhook.server");
        return sendSavedQuoteWebhook(request, params.quoteId);
      },
    },
  },
});
