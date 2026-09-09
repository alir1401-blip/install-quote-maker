import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function FieldServiceQuoteButton({
  quoteId,
  disabled,
}: {
  quoteId: string;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("Connectez-vous pour envoyer le devis.");
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quoteId)}/field-service-quote`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.delivered)
        throw new Error(
          result?.error || "Envoi non confirmé. Vérifiez l’historique avant de réessayer.",
        );
      return result;
    },
    onSuccess: (result) => {
      toast.success("Devis envoyé au ticket d’origine.");
      if (result.warning) toast.warning(result.warning);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["field-service-quote-history"] });
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
          : "Envoyer la version enregistrée au ticket d’origine dans l’outil terrain"
      }
    >
      {send.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Wrench className="mr-2 h-4 w-4" />
      )}
      {send.isPending ? "Envoi…" : "Envoyer au ticket d’origine"}
    </Button>
  );
}
