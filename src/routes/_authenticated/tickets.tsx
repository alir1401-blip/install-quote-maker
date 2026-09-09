/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Plus,
  Search,
  ChevronRight,
  Wrench,
  Warehouse,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useList } from "@/lib/db-hooks";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/ticket-workflow";

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const qc = useQueryClient();
  const { data: tickets = [] } = useList<any>("tickets");
  const { data: clients = [] } = useList<any>("clients", { orderBy: "name", ascending: true });
  const { data: sites = [] } = useList<any>("sites", { orderBy: "name", ascending: true });
  const { data: installations = [] } = useList<any>("installations", {
    orderBy: "name",
    ascending: true,
  });

  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedInstallationIds, setSelectedInstallationIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createMode, setCreateMode] = useState<
    "ticket" | "maintenance" | "site_stock_order" | "reserve_lift"
  >("ticket");

  const siteChoices = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    return sites.filter((site: any) => {
      const client = clients.find((c: any) => c.id === site.client_id);
      const haystack = [
        site.site_number,
        site.name,
        site.address,
        site.contact_name,
        client?.client_number,
        client?.name,
        client?.address,
        client?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    });
  }, [clients, siteSearch, sites]);

  const selectedSite = sites.find((site: any) => site.id === selectedSiteId);
  const selectedClient = clients.find((client: any) => client.id === selectedSite?.client_id);
  const siteInstallations = installations.filter((i: any) => i.site_id === selectedSiteId);

  // Filter tickets based on search query
  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tickets;

    return tickets.filter((ticket: any) => {
      const site = sites.find((s: any) => s.id === ticket.site_id);
      const haystack = [ticket.ticket_number, ticket.title, site?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [tickets, searchQuery, sites]);

  const toggleSelectedInstallation = (installationId: string) => {
    setSelectedInstallationIds((current) =>
      current.includes(installationId)
        ? current.filter((id) => id !== installationId)
        : [...current, installationId],
    );
  };

  const chooseSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setSelectedInstallationIds([]);
  };

  const invalidate = () =>
    [
      "tickets",
      "interventions",
      "intervention_reports",
      "quotes",
      "purchase_orders",
      "part_orders",
      "history_events",
      "installation_parts",
      "ticket_groups",
      "ticket_group_tickets",
    ].forEach((t) => qc.invalidateQueries({ queryKey: [t] }));

  const createTicket = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const owner_id = await currentUserId();
      const site = sites.find((s: any) => s.id === selectedSiteId);
      if (!site) throw new Error("Sélectionnez d'abord un client ou un site");
      const mode = String(fd.get("mode") || "ticket");
      const isMaintenance = mode === "maintenance";
      const isSiteStockOrder = mode === "site_stock_order";
      const isReserveLift = mode === "reserve_lift";
      const installationIdsToCreate =
        isMaintenance || isReserveLift
          ? siteInstallations.map((installation: any) => installation.id)
          : isSiteStockOrder
            ? []
            : selectedInstallationIds;
      if (!isSiteStockOrder && installationIdsToCreate.length === 0) {
        throw new Error(
          isMaintenance || isReserveLift
            ? "Ce site ne contient aucune installation"
            : "Sélectionnez au moins une installation du site",
        );
      }

      const title =
        String(fd.get("title") || "").trim() ||
        (isMaintenance
          ? `Maintenance ${site.name}`
          : isSiteStockOrder
            ? `Commande stock site · ${site.name}`
            : isReserveLift
              ? `Levée de réserve · ${site.name}`
              : "Ticket");
      const description = String(fd.get("description") || "").trim();
      let group: any = null;

      if (!isSiteStockOrder && installationIdsToCreate.length > 1) {
        const { data, error } = await (supabase.from("ticket_groups" as any) as any)
          .insert({
            owner_id,
            client_id: site.client_id,
            site_id: site.id,
            title: isMaintenance ? `Dossier maintenance · ${title}` : title,
            status: isMaintenance
              ? "maintenance"
              : isSiteStockOrder
                ? "stock_site"
                : isReserveLift
                  ? "levee_reserve"
                  : "ouvert",
          })
          .select()
          .single();
        if (error) throw error;
        group = data;
      }

      if (isSiteStockOrder) {
        const { data: storageLocationId, error: storageError } = await (supabase.rpc as any)(
          "ensure_site_storage_location",
          {
            p_site_id: site.id,
            p_owner_id: owner_id,
          },
        );
        if (storageError) throw storageError;

        const { data: ticket, error } = await (supabase.from("tickets" as any) as any)
          .insert({
            owner_id,
            client_id: site.client_id,
            site_id: site.id,
            installation_id: null,
            title,
            description: [
              "Ticket pour devis/commande de pièces destinées au stock sur site",
              description,
            ]
              .filter(Boolean)
              .join("\n"),
            status: "devis_a_creer",
            ticket_type: "site_stock_order",
            storage_location_id: storageLocationId,
          })
          .select()
          .single();
        if (error) throw error;
        if (!ticket) throw new Error("Le ticket n'a pas pu être créé");

        await (supabase.from("history_events" as any) as any).insert({
          owner_id,
          ticket_id: ticket.id,
          site_id: site.id,
          installation_id: null,
          event_type: "site_stock_ticket_created",
          title: "Ticket stock site créé",
          description: title,
          metadata: { storage_location_id: storageLocationId },
          actor_id: owner_id,
        });
      }

      for (const installationId of installationIdsToCreate) {
        const installation = installations.find((i: any) => i.id === installationId);
        if (!installation || installation.site_id !== site.id) continue;
        const { data: ticket, error } = await (supabase.rpc as any)(
          "create_ticket_with_diagnostic",
          {
            p_client_id: site.client_id,
            p_site_id: site.id,
            p_installation_id: installation.id,
            p_ticket_number: null,
            p_title: isMaintenance
              ? `Maintenance · ${installation.name}`
              : isSiteStockOrder
                ? `Commande stock site · ${installation.name}`
                : isReserveLift
                  ? `Levée de réserve · ${installation.name}`
                  : title,
            p_description: isMaintenance
              ? ["Ticket créé depuis un dossier de maintenance site", description]
                  .filter(Boolean)
                  .join("\n")
              : isSiteStockOrder
                ? ["Ticket pour devis/commande de pièces destinées au stock sur site", description]
                    .filter(Boolean)
                    .join("\n")
                : isReserveLift
                  ? [
                      "Ticket de levée de réserve / contrôle du stock sur site (prix négociable au contrat)",
                      description,
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : description || null,
            p_ticket_group_id: group?.id ?? null,
          },
        );
        if (error) throw error;
        if (!ticket) throw new Error("Le ticket n'a pas pu être créé");
        if (isMaintenance || isSiteStockOrder || isReserveLift) {
          const storageLocationId =
            isSiteStockOrder || isReserveLift
              ? (
                  await (supabase.rpc as any)("ensure_site_storage_location", {
                    p_site_id: site.id,
                    p_owner_id: owner_id,
                  })
                ).data
              : null;
          const { error: updateTicketError } = await (supabase.from("tickets" as any) as any)
            .update({
              ticket_type: isMaintenance
                ? "maintenance"
                : isSiteStockOrder
                  ? "site_stock_order"
                  : "reserve_lift",
              storage_location_id: storageLocationId,
            })
            .eq("id", ticket.id);
          if (updateTicketError) throw updateTicketError;
        }
      }
      const ticketCount = isSiteStockOrder ? 1 : installationIdsToCreate.length;
      form.reset();
      setSelectedInstallationIds([]);
      setShowCreateForm(false);
      return ticketCount;
    },
    onSuccess: (ticketCount) => {
      invalidate();
      toast.success(ticketCount > 1 ? "Dossier créé avec tickets liés" : "Ticket créé");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Status label colors
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      en_attente_assignation: "bg-gray-100 text-gray-800",
      diagnostic_en_cours: "bg-blue-100 text-blue-800",
      diagnostic_termine: "bg-blue-200 text-blue-900",
      rapport_a_rediger: "bg-yellow-100 text-yellow-800",
      devis_a_creer: "bg-orange-100 text-orange-800",
      en_attente_pieces: "bg-orange-100 text-orange-800",
      pieces_recues: "bg-green-100 text-green-800",
      reparation_a_planifier: "bg-purple-100 text-purple-800",
      reparation_en_cours: "bg-purple-200 text-purple-900",
      bon_de_commande_recu: "bg-green-200 text-green-900",
      probleme_persistant: "bg-red-100 text-red-800",
      termine: "bg-green-300 text-green-900",
      cloture: "bg-gray-300 text-gray-900",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Gestion des tickets de diagnostic, devis, pièces et réparations"
      />

      {/* Create Ticket Button */}
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setShowCreateForm(!showCreateForm)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {showCreateForm ? "Fermer" : "Créer un ticket / dossier"}
        </Button>
      </div>

      {/* Create Ticket Form */}
      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              Créer un ticket ou un dossier de maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTicket.mutate(e.currentTarget);
              }}
              className="grid gap-4"
            >
              <input type="hidden" name="mode" value={createMode} />
              <div className="grid gap-2 md:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setCreateMode("ticket")}
                  className={`rounded-md border p-3 text-left text-sm ${createMode === "ticket" ? "border-primary bg-muted" : ""}`}
                >
                  <ClipboardList className="mb-2 h-4 w-4" />
                  <b>Ticket classique</b>
                  <p className="text-muted-foreground">
                    Créer un ou plusieurs tickets sur les installations sélectionnées.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("maintenance")}
                  className={`rounded-md border p-3 text-left text-sm ${createMode === "maintenance" ? "border-primary bg-muted" : ""}`}
                >
                  <Wrench className="mb-2 h-4 w-4" />
                  <b>Dossier de maintenance site</b>
                  <p className="text-muted-foreground">
                    Créer automatiquement un ticket de contrôle sur toutes les installations du
                    site.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("site_stock_order")}
                  className={`rounded-md border p-3 text-left text-sm ${createMode === "site_stock_order" ? "border-primary bg-muted" : ""}`}
                >
                  <Warehouse className="mb-2 h-4 w-4" />
                  <b>Commande stock site</b>
                  <p className="text-muted-foreground">
                    Créer les tickets/devis de pièces à stocker sur site.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("reserve_lift")}
                  className={`rounded-md border p-3 text-left text-sm ${createMode === "reserve_lift" ? "border-primary bg-muted" : ""}`}
                >
                  <ClipboardCheck className="mb-2 h-4 w-4" />
                  <b>Levée de réserve</b>
                  <p className="text-muted-foreground">
                    Contrôler les réserves et le stock sur site, prix au contrat.
                  </p>
                </button>
              </div>

              <div className="grid gap-2">
                <Label>1. Rechercher puis choisir le client ou le site</Label>
                <Input
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  placeholder="Nom, numéro client/site, adresse..."
                />
                <div className="grid max-h-56 gap-2 overflow-auto rounded-md border p-2">
                  {siteChoices.map((site: any) => {
                    const client = clients.find((c: any) => c.id === site.client_id);
                    return (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => chooseSite(site.id)}
                        className={`rounded-md border p-3 text-left text-sm transition hover:bg-muted ${
                          selectedSiteId === site.id ? "border-primary bg-muted" : ""
                        }`}
                      >
                        <b>{client?.name ?? "Client"}</b>
                        <span className="text-muted-foreground">
                          {client?.client_number ? ` · ${client.client_number}` : ""}
                        </span>
                        <div>
                          {site.name}
                          {site.site_number ? ` · ${site.site_number}` : ""}
                        </div>
                        {site.address ? (
                          <div className="text-xs text-muted-foreground">{site.address}</div>
                        ) : null}
                      </button>
                    );
                  })}
                  {siteChoices.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">Aucun client/site trouvé.</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>
                  {createMode === "site_stock_order"
                    ? "2. Stock sur site (aucune installation liée)"
                    : createMode !== "ticket"
                      ? "2. Installations incluses dans le dossier site"
                      : "2. Sélectionner les installations du site concerné"}
                </Label>
                {selectedSite ? (
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-sm text-muted-foreground">
                      {selectedClient?.name} · {selectedSite.name}
                    </p>
                    {createMode === "site_stock_order" ? (
                      <p className="text-sm text-muted-foreground">
                        Le ticket sera lié uniquement au site et au stock sur site, sans diagnostic
                        ni installation.
                      </p>
                    ) : (
                      <>
                        <div className="grid gap-2 md:grid-cols-2">
                          {siteInstallations.map((installation: any) => (
                            <label
                              key={installation.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  createMode !== "ticket" ||
                                  selectedInstallationIds.includes(installation.id)
                                }
                                disabled={createMode !== "ticket"}
                                onChange={() => toggleSelectedInstallation(installation.id)}
                              />
                              {installation.name}
                            </label>
                          ))}
                        </div>
                        {siteInstallations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Aucune installation n'est rattachée à ce site.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    Choisissez d'abord un client ou un site dans la liste ci-dessus.
                  </p>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Titre</Label>
                  <Input
                    name="title"
                    placeholder={
                      createMode === "maintenance"
                        ? "Maintenance périodique"
                        : createMode === "site_stock_order"
                          ? "Commande stock site"
                          : createMode === "reserve_lift"
                            ? "Levée de réserve"
                            : "Titre du ticket"
                    }
                    required={createMode === "ticket"}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Input name="description" />
                </div>
              </div>
              <Button
                disabled={
                  !selectedSiteId ||
                  (createMode === "ticket" && selectedInstallationIds.length === 0) ||
                  ((createMode === "maintenance" || createMode === "reserve_lift") &&
                    siteInstallations.length === 0)
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {createMode === "maintenance"
                  ? `Créer le dossier maintenance (${siteInstallations.length} installations)`
                  : createMode === "site_stock_order"
                    ? "Créer le ticket stock site"
                    : createMode === "reserve_lift"
                      ? `Créer la levée de réserve (${siteInstallations.length} installations)`
                      : selectedInstallationIds.length > 1
                        ? `Créer ${selectedInstallationIds.length} tickets liés + diagnostics`
                        : "Créer + diagnostic"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par numéro, titre ou site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      {filteredTickets.length === 0 ? (
        <EmptyState
          title="Aucun ticket"
          description={
            searchQuery
              ? "Aucun ticket ne correspond à votre recherche."
              : "Créez votre premier ticket pour commencer."
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket: any) => {
            const site = sites.find((s: any) => s.id === ticket.site_id);
            const installation = installations.find((i: any) => i.id === ticket.installation_id);

            return (
              <Link
                key={ticket.id}
                to="/ticket/$ticketSlug"
                params={{ ticketSlug: ticket.ticket_number ?? ticket.id }}
              >
                <Card className="transition-colors hover:bg-accent/50 cursor-pointer">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex flex-1 items-center gap-4 min-w-0">
                      <ClipboardList className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{ticket.ticket_number}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {site?.name ? `${site.name}` : "Site"}
                          {installation?.name && ` · ${installation.name}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {ticket.installation_stopped && (
                        <Badge variant="destructive">⚠ À l’arrêt</Badge>
                      )}
                      <Badge className={getStatusColor(ticket.status)}>{ticket.status}</Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
