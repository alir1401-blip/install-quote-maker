import { createFileRoute } from "@tanstack/react-router";

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/imports/installations/$token")({
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
        const { parseInstallationImport } = await import("@/lib/installation-import");
        const { importInstallation } = await import("@/lib/installation-import.server");
        return receiveWebhook(request, params.token, async (delivery) =>
          importInstallation(
            params.token,
            parseInstallationImport(delivery.p_body, delivery.p_content_type),
          ),
        );
      },
    },
  },
});
