import { createFileRoute } from "@tanstack/react-router";

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/webhooks/$token")({
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
        const { saveWebhook } = await import("@/lib/webhooks.server");
        return receiveWebhook(request, params.token, saveWebhook);
      },
    },
  },
});
