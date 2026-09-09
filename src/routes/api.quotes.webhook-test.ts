import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/quotes/webhook-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sendQuoteWebhookTest } = await import("@/lib/quote-webhook.server");
        return sendQuoteWebhookTest(request);
      },
    },
  },
});
