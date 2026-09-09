import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/quotes/$quoteId/field-service-quote")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { sendFieldServiceQuoteReturn } =
          await import("@/lib/field-service-quote-return.server");
        return sendFieldServiceQuoteReturn(request, params.quoteId);
      },
    },
  },
});
