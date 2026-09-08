import { useMutation } from "@tanstack/react-query";
import { Copy, Network } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const example = {
  client: { name: "Société Dupont", email: "contact@example.com" },
  site: { name: "Agence Paris", address: "10 rue de Paris, 75001 Paris" },
  installation: {
    name: "Porte entrée principale",
    serial_number: "PORTE-001",
    location: "Accueil",
  },
};

export function InstallationImportCard({
  endpoint,
  onChange,
}: {
  endpoint: { id: string; token: string; import_enabled: boolean };
  onChange: () => Promise<unknown>;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/imports/installations/${endpoint.token}`
      : "";
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("webhook_endpoints")
        .update({ import_enabled: enabled })
        .eq("id", endpoint.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async (_, enabled) => {
      await onChange();
      toast.success(enabled ? "Création automatique activée." : "Création automatique désactivée.");
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
          <Network className="h-5 w-5 text-primary" /> Créer un client, un site et une installation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Une seule requête POST crée les fiches manquantes et les relie entre elles. Les fiches
          existantes sont réutilisées sans modifier leurs informations.
        </p>
        <div className="flex items-center gap-3">
          <Switch
            id="installation-import-enabled"
            checked={endpoint.import_enabled ?? false}
            disabled={toggle.isPending}
            onCheckedChange={(enabled) => toggle.mutate(enabled)}
          />
          <Label htmlFor="installation-import-enabled">Autoriser la création par POST</Label>
        </div>
        {endpoint.import_enabled ? (
          <>
            <Label htmlFor="installation-import-url">URL de création</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="installation-import-url"
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
              Gardez cette URL privée : elle autorise la création de fiches dans votre compte.
              Envoyez du JSON avec Content-Type: application/json.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Activez cette option pour obtenir votre URL de création.
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
              Pour réutiliser une fiche précise, remplacez son objet par{" "}
              {'{ "id": "UUID de la fiche" }'}. Sinon, le nom est recherché dans votre compte, dans
              le client pour un site, puis dans le site pour une installation. Les majuscules et
              espaces superflus sont ignorés. Un nom ambigu nécessite un identifiant.
            </p>
            <p className="text-xs text-muted-foreground">
              La réponse contient client, site et installation avec id, number et created (true si
              créé). Les imports réussis apparaissent dans l’historique ci-dessous.
            </p>
            {endpoint.import_enabled && (
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {`curl -X POST "${url}" -H "Content-Type: application/json" --data-binary "@payload.json"`}
              </pre>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
