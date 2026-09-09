import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function QuoteWebhookButton({ quoteId, disabled }: { quoteId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("Connectez-vous pour envoyer le devis.");
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/webhook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.delivered)
        throw new Error(
          result?.error || "Envoi non confirmé. Vérifiez l’historique avant de réessayer.",
        );
      return result;
    },
    onSuccess: (result) => {
      toast.success("Devis envoyé au webhook.");
      if (result.warning) toast.warning(result.warning);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["quote-webhook-history"] });
    },
    retry: false,
  });
  return (
    <Button
      variant="outline"
      onClick={() => send.mutate()}
      disabled={disabled || send.isPending}
      title={
        disabled
          ? "Enregistrez ou annulez les modifications avant l’envoi."
          : "Envoyer la version enregistrée à l’URL configurée dans Webhooks"
      }
    >
      {send.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Webhook className="mr-2 h-4 w-4" />
      )}
      {send.isPending ? "Envoi…" : "Envoyer au webhook"}
    </Button>
  );
}
