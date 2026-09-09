import { useMutation } from "@tanstack/react-query";
import { Copy, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const example = {
  event: "status_en_attente_devis",
  ticket: {
    id: "b1f6b8b2-70f0-4a2b-9d9d-8f0b1c2d3e4f",
    number: "T-1042",
    title: "Porte sectionnelle bloquée",
    description: "Le client signale un blocage complet de la porte.",
    priority: "haute",
  },
  problem: {
    panne_description: "Ressort de torsion cassé",
    actions_done: "Mise en sécurité",
    recommendation: "Remplacement du jeu de ressorts",
  },
  client: { name: "Société Dupont" },
  site: { name: "Agence Paris", address: "10 rue de Paris", postal_code: "75001", city: "Paris" },
  equipment: { code: "P-03", equipment_type: "Porte sectionnelle", serial_number: "SN-12345" },
};

export function QuoteTicketImportCard({
  endpoint,
  onChange,
}: {
  endpoint: { id: string; token: string; ticket_import_enabled: boolean };
  onChange: () => Promise<unknown>;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/tickets/${endpoint.token}`
      : "";
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("webhook_endpoints")
        .update({ ticket_import_enabled: enabled })
        .eq("id", endpoint.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async (_, enabled) => {
      await onChange();
      toast.success(enabled ? "Réception de tickets activée." : "Réception de tickets désactivée.");
    },
    onError: () => toast.error("Impossible de modifier l’autorisation de création."),
  });
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié dans le presse-papiers.");
    } catch {
      toast.error("Copie impossible. Sélectionnez et copiez le texte manuellement.");
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-5 w-5 text-primary" /> Créer un ticket devis depuis un outil terrain
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Une requête POST avec l’évènement <code>status_en_attente_devis</code> retrouve ou crée le
          client, le site et l’installation concernés, puis crée un ticket local prêt pour la
          création du devis (visible dans Tickets, statut « Devis à créer »).
        </p>
        <div className="flex items-center gap-3">
          <Switch
            id="ticket-import-enabled"
            checked={endpoint.ticket_import_enabled ?? false}
            disabled={toggle.isPending}
            onCheckedChange={(enabled) => toggle.mutate(enabled)}
          />
          <Label htmlFor="ticket-import-enabled">Autoriser la création de tickets par POST</Label>
        </div>
        {endpoint.ticket_import_enabled ? (
          <>
            <Label htmlFor="ticket-import-url">URL de réception</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="ticket-import-url"
                readOnly
                value={url}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="outline" onClick={() => copy(url)}>
                <Copy className="mr-2 h-4 w-4" /> Copier l’URL
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Gardez cette URL privée : elle autorise la création de tickets dans votre compte.
              Envoyez du JSON avec Content-Type: application/json.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Activez cette option pour obtenir votre URL de réception.
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer">Format de la requête POST</summary>
          <div className="mt-3 space-y-3">
            <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(example, null, 2)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(JSON.stringify(example, null, 2))}
            >
              <Copy className="mr-2 h-4 w-4" /> Copier le JSON
            </Button>
            <p className="text-xs text-muted-foreground">
              client et site sont recherchés par id, sinon par nom (et pour le site, par adresse +
              code postal) dans votre compte ; sans correspondance, ils sont créés. L’équipement est
              recherché par id, numéro de série puis code au sein du site ; sans correspondance, une
              installation est créée. Un nom ambigu produit une erreur 409 : fournissez l’id voulu.
            </p>
            <p className="text-xs text-muted-foreground">
              La description du ticket reprend ticket.description ainsi que les champs de problem
              (panne, actions déjà réalisées, recommandation) pour préparer le devis. Rejouer la
              même requête (même ticket.id) réutilise le ticket déjà créé.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
