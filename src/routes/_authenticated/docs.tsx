/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useList } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/docs")({ component: DocumentsPage });

const categories: Record<string, string> = {
  general: "Général",
  door_type: "Type de porte",
  part_type: "Type de pièce",
  brand: "Marque",
};

function DocumentsPage() {
  const { data: documents = [], isLoading } = useList<any>("documents", {
    orderBy: "created_at",
    ascending: false,
  });
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () =>
      documents.filter((doc: any) => {
        const matchesCategory = category === "all" || doc.category === category;
        const haystack =
          `${doc.title} ${doc.description ?? ""} ${doc.reference_name ?? ""}`.toLowerCase();
        return matchesCategory && haystack.includes(search.toLowerCase());
      }),
    [documents, category, search],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File;
    const externalUrl = String(data.get("external_url") || "").trim();
    if ((!file || !file.size) && !externalUrl) {
      toast.error("Ajoutez un PDF ou un lien vers la documentation");
      setSaving(false);
      return;
    }
    if (file?.size && file.type !== "application/pdf") {
      toast.error("Seuls les fichiers PDF sont acceptés");
      setSaving(false);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;
    let filePath: string | null = null;
    if (file?.size) {
      filePath = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { contentType: "application/pdf" });
      if (error) {
        toast.error("Impossible d’envoyer le PDF");
        setSaving(false);
        return;
      }
    }
    const { error } = await (supabase.from("documents") as any).insert({
      owner_id: userId,
      title: data.get("title"),
      description: data.get("description") || null,
      category: data.get("category"),
      reference_name: data.get("reference_name") || null,
      external_url: externalUrl || null,
      file_path: filePath,
      file_name: file?.size ? file.name : null,
    });
    if (error) {
      if (filePath) await supabase.storage.from("documents").remove([filePath]);
      toast.error("Impossible d’ajouter la documentation");
    } else {
      toast.success("Documentation ajoutée");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setOpen(false);
      form.reset();
    }
    setSaving(false);
  };

  const openDocument = async (doc: any) => {
    if (doc.file_path) {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60);
      if (error) return toast.error("Impossible d’ouvrir le PDF");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } else if (doc.external_url) window.open(doc.external_url, "_blank", "noopener,noreferrer");
  };

  const remove = async (doc: any) => {
    if (!window.confirm(`Supprimer « ${doc.title} » ?`)) return;
    const { error } = await (supabase.from("documents") as any).delete().eq("id", doc.id);
    if (error) return toast.error("Impossible de supprimer la documentation");
    if (doc.file_path) await supabase.storage.from("documents").remove([doc.file_path]);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    toast.success("Documentation supprimée");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        description="Centralisez les notices PDF et les liens utiles par porte, pièce ou marque"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher une documentation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {Object.entries(categories).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!isLoading && filtered.length === 0 ? (
        <EmptyState
          title="Aucune documentation"
          description="Ajoutez un PDF ou un lien pour constituer votre bibliothèque technique."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une documentation
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc: any) => (
            <Card key={doc.id} className="flex flex-col">
              <CardHeader>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <Badge variant="secondary">{categories[doc.category] ?? doc.category}</Badge>
                  {doc.file_path ? (
                    <Badge variant="outline">PDF</Badge>
                  ) : (
                    <Badge variant="outline">Lien</Badge>
                  )}
                </div>
                <CardTitle className="text-base">{doc.title}</CardTitle>
                {doc.reference_name && (
                  <p className="text-sm font-medium text-primary">{doc.reference_name}</p>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {doc.description || doc.file_name || "Documentation technique"}
                </p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button className="flex-1" variant="outline" onClick={() => openDocument(doc)}>
                  {doc.file_path ? (
                    <FileText className="mr-2 h-4 w-4" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Consulter
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Supprimer ${doc.title}`}
                  onClick={() => remove(doc)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Ajouter une documentation</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              <div className="grid gap-2">
                <Label htmlFor="title">Titre *</Label>
                <Input id="title" name="title" required placeholder="Notice de pose…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Catégorie</Label>
                  <Select name="category" defaultValue="general">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categories).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reference_name">Référence associée</Label>
                  <Input
                    id="reference_name"
                    name="reference_name"
                    placeholder="Nom de marque, pièce…"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Informations utiles sur ce document"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="file">Fichier PDF</Label>
                <Input id="file" name="file" type="file" accept="application/pdf,.pdf" />
                <p className="text-xs text-muted-foreground">
                  Vous pouvez ajouter un PDF, un lien, ou les deux.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="external_url">Lien vers la documentation</Label>
                <Input
                  id="external_url"
                  name="external_url"
                  type="url"
                  placeholder="https://fabricant.fr/notice"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                <Upload className="mr-2 h-4 w-4" />
                {saving ? "Ajout…" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
