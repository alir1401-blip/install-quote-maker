/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  FileText,
  PackageCheck,
  CheckCircle2,
  UserCheck,
  History,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useList, useOneByRouteParam } from "@/lib/db-hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { canCloseTicket, currentUserId, setTicketStatus } from "@/lib/ticket-workflow";
import { refreshCommandTicketReadiness, suggestStorageLocation } from "@/lib/stock-workflow";
import { DEFAULT_COST_SETTINGS, computeInterventionRealCost } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/ticket/$ticketSlug")({
  component: TicketDetail,
});

function num(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(value));
}

function getStatusColor(status: string) {
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
}

function TicketDetail() {
  const { ticketSlug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: ticket } = useOneByRouteParam<any>("tickets", ticketSlug, "ticket_number");
  const ticketId = ticket?.id;
  const { data: clients = [] } = useList<any>("clients");
  const { data: sites = [] } = useList<any>("sites");
  const { data: installations = [] } = useList<any>("installations");
  const { data: interventions = [] } = useList<any>("interventions");
  const { data: reports = [] } = useList<any>("intervention_reports");
  const { data: quotes = [] } = useList<any>("quotes");
  const { data: quoteTickets = [] } = useList<any>("quote_tickets");
  const { data: allTickets = [] } = useList<any>("tickets");
  const { data: groupTickets = [] } = useList<any>("ticket_group_tickets");
  const { data: purchaseOrders = [] } = useList<any>("purchase_orders");
  const { data: partOrders = [] } = useList<any>("part_orders");
  const { data: partOrderItems = [] } = useList<any>("part_order_items");
  const { data: storageLocations = [] } = useList<any>("storage_locations");
  const { data: storageStocks = [] } = useList<any>("storage_location_stocks", {
    orderBy: "updated_at",
  });
  const { data: stockMovements = [] } = useList<any>("stock_movements");
  const { data: invoices = [] } = useList<any>("invoices");
  const { data: invoiceItems = [] } = useList<any>("invoice_items");
  const { data: history = [] } = useList<any>("history_events");
  const { data: suppliers = [] } = useList<any>("suppliers");
  const { data: parts = [] } = useList<any>("parts");
  const { data: types = [] } = useList<any>("installation_types");
  const { data: models = [] } = useList<any>("models");
  const { data: installationParts = [] } = useList<any>("installation_parts");
  const { data: modelCompat = [] } = useList<any>("part_model_compat");
  const { data: partCategories = [] } = useList<any>("part_categories", {
    orderBy: "name",
    ascending: true,
  });
  const { data: costSettingsRows = [] } = useList<any>("cost_settings");
  const { data: technicianProfiles = [] } = useList<any>("technician_cost_profiles");
  const { data: vehicles = [] } = useList<any>("vehicles");
  const { data: interventionTechnicianTimes = [] } = useList<any>("intervention_technician_times");
  const { data: interventionPartsCosts = [] } = useList<any>("intervention_parts_costs");
  const { data: interventionShipments = [] } = useList<any>("intervention_shipments");
  const { data: interventionSubcontractors = [] } = useList<any>("intervention_subcontractors");
  const { data: interventionEquipments = [] } = useList<any>("intervention_equipments");
  const { data: adminSettings = [] } = useList<any>("intervention_type_admin_settings");

  const [expandedIntervention, setExpandedIntervention] = useState<string | null>(null);
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);

  const invalidate = () =>
    [
      "tickets",
      "interventions",
      "intervention_reports",
      "quotes",
      "purchase_orders",
      "part_orders",
      "part_order_items",
      "storage_location_stocks",
      "stock_movements",
      "invoices",
      "invoice_items",
      "history_events",
      "quote_tickets",
      "ticket_group_tickets",
      "intervention_technician_times",
      "intervention_parts_costs",
      "intervention_shipments",
      "intervention_subcontractors",
      "intervention_equipments",
      "installation_parts",
      "part_model_compat",
    ].forEach((t) => qc.invalidateQueries({ queryKey: [t] }));

  if (!ticket) return <p className="text-muted-foreground">Chargement...</p>;

  const site = sites.find((s: any) => s.id === ticket.site_id);
  const client = clients.find((c: any) => c.id === ticket.client_id);
  const installation = installations.find((i: any) => i.id === ticket.installation_id);
  const isSiteStockTicket = ticket.ticket_type === "site_stock_order";
  // Diagnostic already done in the field-service tool: no local intervention required.
  const isImportedTicket = ticket.external_source === "field_service";
  const currentGroupIds = new Set(
    groupTickets.filter((row: any) => row.ticket_id === ticketId).map((row: any) => row.group_id),
  );
  const linkedTicketIds = new Set<string>([ticketId]);
  groupTickets
    .filter((row: any) => currentGroupIds.has(row.group_id))
    .forEach((row: any) => linkedTicketIds.add(row.ticket_id));
  const relatedTickets = Array.from(linkedTicketIds)
    .map((id) => (id === ticketId ? ticket : allTickets.find((item: any) => item.id === id)))
    .filter(Boolean);
  const hasRelatedTickets = relatedTickets.length > 1;
  const currentRelatedIndex = relatedTickets.findIndex((item: any) => item.id === ticketId);
  const previousRelatedTicket =
    currentRelatedIndex > 0 ? relatedTickets[currentRelatedIndex - 1] : null;
  const nextRelatedTicket =
    currentRelatedIndex >= 0 && currentRelatedIndex < relatedTickets.length - 1
      ? relatedTickets[currentRelatedIndex + 1]
      : null;

  // Get related data
  const ticketInterventions = interventions.filter((i: any) => i.ticket_id === ticketId);
  const ticketReports = reports.filter((r: any) => r.ticket_id === ticketId);
  const relatedInterventions = interventions.filter((i: any) => linkedTicketIds.has(i.ticket_id));
  const relatedReports = reports.filter((r: any) => linkedTicketIds.has(r.ticket_id));
  const ticketQuotes = quotes.filter((q: any) => q.ticket_id === ticketId);
  const ticketPOs = purchaseOrders.filter((p: any) => p.ticket_id === ticketId);
  const ticketPartOrders = partOrders.filter((p: any) => p.ticket_id === ticketId);
  const ticketPartOrderIds = new Set(ticketPartOrders.map((order: any) => order.id));
  const ticketPartOrderItems = partOrderItems.filter((item: any) =>
    ticketPartOrderIds.has(item.part_order_id),
  );
  const ticketStockMovements = stockMovements.filter(
    (movement: any) =>
      ticketPartOrderIds.has(movement.command_ticket_id) ||
      movement.reason?.includes(ticket.ticket_number),
  );
  const ticketInvoices = invoices.filter((invoice: any) => invoice.ticket_id === ticketId);
  const ticketInvoiceIds = new Set(ticketInvoices.map((invoice: any) => invoice.id));
  const ticketInvoiceItems = invoiceItems.filter((item: any) =>
    ticketInvoiceIds.has(item.invoice_id),
  );
  const siteStorageLocation = storageLocations.find(
    (location: any) =>
      location.id === ticket.storage_location_id ||
      (location.type === "site" &&
        location.site_id === ticket.site_id &&
        location.is_active !== false),
  );
  const replacementStockChoices = storageStocks
    .map((stock: any) => {
      const part = parts.find((p: any) => p.id === stock.part_id);
      const location = storageLocations.find((loc: any) => loc.id === stock.storage_location_id);
      const available =
        Number(stock.quantity_available || 0) - Number(stock.quantity_reserved || 0);
      return { stock, part, location, available };
    })
    .filter(
      (choice: any) =>
        choice.part &&
        choice.location &&
        choice.available > 0 &&
        ["vehicule_technicien", "site"].includes(choice.location.type) &&
        (choice.location.type !== "site" || choice.location.id === siteStorageLocation?.id),
    );
  const stockReference = {
    latitude: ticket.latitude ?? site?.latitude,
    longitude: ticket.longitude ?? site?.longitude,
  };
  const ticketHistory = history.filter((h: any) => h.ticket_id === ticketId);

  // Get quotes linked to this ticket via quote_tickets
  const linkedQuoteIds = new Set(
    quoteTickets.filter((qt: any) => qt.ticket_id === ticketId).map((qt: any) => qt.quote_id),
  );
  const linkedQuotes = quotes.filter((q: any) => linkedQuoteIds.has(q.id));

  // Get part types for this installation
  const installationModel = models.find((m: any) => m.id === installation?.model_id);
  const effectiveTypeId = installation?.type_id || installationModel?.type_id;
  const installationType = types.find((t: any) => t.id === effectiveTypeId);
  const componentTypes = Array.isArray(installationType?.component_types)
    ? installationType.component_types
    : [];
  const availablePartTypes: string[] = [
    ...new Set(
      (componentTypes.length
        ? componentTypes.map((name: unknown) => String(name))
        : partCategories.map((category: any) => String(category.name))
      ).filter(Boolean) as string[],
    ),
  ];

  const formatPartTypeList = (value: unknown) => {
    const values = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
    return values
      .map((item) => String(item))
      .filter(Boolean)
      .join(", ");
  };

  const maintenanceRowsForReport = (report: any) => {
    const hsTypes = new Set(
      (Array.isArray(report?.pieces_defectueuses) ? report.pieces_defectueuses : [])
        .map((piece: any) => String(piece?.type ?? ""))
        .filter(Boolean),
    );
    return availablePartTypes.map((type) => ({ type, status: hsTypes.has(type) ? "HS" : "OK" }));
  };

  const geocodeAddress = async (address: string) => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    );
    const [match] = await response.json();
    if (!match) throw new Error(`Adresse introuvable : ${address}`);
    return { lat: Number(match.lat), lon: Number(match.lon) };
  };

  const calculateOsmRoute = async (intervention: any) => {
    try {
      const settings = { ...DEFAULT_COST_SETTINGS, ...costSettingsRows[0] };
      const site = sites.find((row: any) => row.id === ticket?.site_id);
      const sourceAddress = intervention.route_source_address || settings.agency_address;
      const clientAddress =
        intervention.route_client_address ||
        site?.address ||
        [site?.street, site?.postal_code, site?.city].filter(Boolean).join(" ");
      if (!sourceAddress || !clientAddress) {
        toast.error("Adresse agence/source ou adresse client manquante");
        return;
      }
      const [source, client] = await Promise.all([
        geocodeAddress(sourceAddress),
        geocodeAddress(clientAddress),
      ]);
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${source.lon},${source.lat};${client.lon},${client.lat};${source.lon},${source.lat}?overview=false`,
      );
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route) throw new Error("Aucun itinéraire OSRM trouvé");
      const totalKm = Number(route.distance || 0) / 1000;
      const totalMinutes = Number(route.duration || 0) / 60;
      const { error } = await (supabase.from("interventions" as any) as any)
        .update({
          route_source_address: sourceAddress,
          route_client_address: clientAddress,
          outbound_distance_km: totalKm / 2,
          return_distance_km: totalKm / 2,
          outbound_travel_minutes: totalMinutes / 2,
          return_travel_minutes: totalMinutes / 2,
          distance_km: totalKm,
          travel_minutes: totalMinutes,
          calculation_status: "partial",
        })
        .eq("id", intervention.id);
      if (error) throw error;
      invalidate();
      toast.success("Distance et temps de trajet calculés avec OpenStreetMap / OSRM");
    } catch (error: any) {
      toast.error(error.message ?? "Calcul d’itinéraire impossible");
    }
  };

  const saveInterventionCostBasics = async (e: any, intervention: any) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      billed_revenue: Number(fd.get("billed_revenue") || 0),
      technician_count: Number(fd.get("technician_count") || 1),
      onsite_minutes: Number(fd.get("onsite_minutes") || 0),
      travel_minutes: Number(fd.get("travel_minutes") || 0),
      distance_km: Number(fd.get("distance_km") || 0),
      manual_labor_cost: fd.get("manual_labor_cost") ? Number(fd.get("manual_labor_cost")) : null,
      manual_vehicle_cost: fd.get("manual_vehicle_cost")
        ? Number(fd.get("manual_vehicle_cost"))
        : null,
      manual_overhead_cost: fd.get("manual_overhead_cost")
        ? Number(fd.get("manual_overhead_cost"))
        : null,
      calculation_status: fd.get("calculation_status") || "estimated",
    };
    const { error } = await (supabase.from("interventions" as any) as any)
      .update(payload)
      .eq("id", intervention.id);
    if (error) return toast.error(error.message);
    invalidate();
    toast.success("Coûts d'intervention enregistrés");
  };

  const fmtEur = (value: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value || 0);

  const renderRealCostCard = (intervention: any) => {
    const settings = { ...DEFAULT_COST_SETTINGS, ...costSettingsRows[0] };
    const quoteRevenue = ticketQuotes.reduce(
      (sum: number, quote: any) => sum + Number(quote.total_ttc ?? quote.total_ht ?? 0),
      0,
    );
    const cost = computeInterventionRealCost(intervention, settings, {
      technicianTimes: interventionTechnicianTimes.filter(
        (row: any) => row.intervention_id === intervention.id,
      ),
      technicianProfiles,
      vehicle: vehicles.find((vehicle: any) => vehicle.id === intervention.vehicle_id),
      parts: interventionPartsCosts.filter((row: any) => row.intervention_id === intervention.id),
      shipments: interventionShipments.filter(
        (row: any) => row.intervention_id === intervention.id,
      ),
      subcontractors: interventionSubcontractors.filter(
        (row: any) => row.intervention_id === intervention.id,
      ),
      equipments: interventionEquipments.filter(
        (row: any) => row.intervention_id === intervention.id,
      ),
      adminSetting: adminSettings.find((row: any) => row.intervention_type === intervention.type),
      revenue: Number(intervention.billed_revenue || quoteRevenue),
    });
    return (
      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader>
          <CardTitle className="text-base">Coût réel & marge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <b>CA facturé</b>
              <br />
              {fmtEur(cost.revenue)}
            </div>
            <div>
              <b>Coût réel</b>
              <br />
              {fmtEur(cost.total)}
            </div>
            <div>
              <b>Marge nette</b>
              <br />
              <span className={cost.netMargin >= 0 ? "text-green-700" : "text-red-700"}>
                {fmtEur(cost.netMargin)}
              </span>
            </div>
            <div>Main-d'œuvre : {fmtEur(cost.labor)}</div>
            <div>Véhicule : {fmtEur(cost.vehicle)}</div>
            <div>Temps trajet : {fmtEur(cost.travelLabor)}</div>
            <div>Pièces : {fmtEur(cost.parts)}</div>
            <div>Expédition : {fmtEur(cost.shipping)}</div>
            <div>Sous-traitance : {fmtEur(cost.subcontractor)}</div>
            <div>Administratif : {fmtEur(cost.admin)}</div>
            <div>Équipements : {fmtEur(cost.equipment)}</div>
            <div>Frais généraux : {fmtEur(cost.overhead)}</div>
            <div>Taux de marge : {cost.marginPct.toFixed(1)}%</div>
            <div>Rentabilité : {cost.profitabilityPct.toFixed(1)}%</div>
            <div>{cost.profitable ? "Intervention rentable" : "Intervention non rentable"}</div>
          </div>
          <Badge variant={cost.status === "complete" ? "default" : "secondary"}>
            Calcul {cost.status}
          </Badge>
          {cost.warnings.length > 0 && (
            <p className="text-xs text-orange-700">⚠️ {cost.warnings.join(" · ")}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => calculateOsmRoute(intervention)}
          >
            Calculer distance / trajet via OSM
          </Button>
          <form
            onSubmit={(e) => saveInterventionCostBasics(e, intervention)}
            className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-4"
          >
            <Input
              name="billed_revenue"
              type="number"
              step="0.01"
              defaultValue={intervention.billed_revenue ?? quoteRevenue}
              placeholder="CA facturé"
            />
            <Input
              name="technician_count"
              type="number"
              step="1"
              defaultValue={intervention.technician_count ?? 1}
              placeholder="Techniciens"
            />
            <Input
              name="onsite_minutes"
              type="number"
              step="1"
              defaultValue={intervention.onsite_minutes ?? ""}
              placeholder="Temps site min"
            />
            <Input
              name="travel_minutes"
              type="number"
              step="1"
              defaultValue={intervention.travel_minutes ?? ""}
              placeholder="Trajet min"
            />
            <Input
              name="distance_km"
              type="number"
              step="0.1"
              defaultValue={intervention.distance_km ?? ""}
              placeholder="Distance km"
            />
            <Input
              name="manual_labor_cost"
              type="number"
              step="0.01"
              defaultValue={intervention.manual_labor_cost ?? ""}
              placeholder="MO manuelle"
            />
            <Input
              name="manual_vehicle_cost"
              type="number"
              step="0.01"
              defaultValue={intervention.manual_vehicle_cost ?? ""}
              placeholder="Véhicule manuel"
            />
            <Input
              name="manual_overhead_cost"
              type="number"
              step="0.01"
              defaultValue={intervention.manual_overhead_cost ?? ""}
              placeholder="FG manuels"
            />
            <Select
              name="calculation_status"
              defaultValue={intervention.calculation_status ?? "estimated"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complete">Complet</SelectItem>
                <SelectItem value="partial">Partiel</SelectItem>
                <SelectItem value="estimated">Estimé</SelectItem>
                <SelectItem value="manual">Manuel</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">
              Enregistrer coûts
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  };

  const assign = async (intervention: any) => {
    const user = await currentUserId();
    const { error } = await (supabase.from("interventions" as any) as any)
      .update({ status: "assignee", technician_id: user })
      .eq("id", intervention.id);
    if (error) return toast.error(error.message);
    invalidate();
    toast.success("Intervention assignée");
  };

  const updateIntervention = async (intervention: any, status: string) => {
    const patch: any = { status };
    if (status === "en_cours") patch.started_at = new Date().toISOString();
    if (["terminee", "echec"].includes(status)) patch.completed_at = new Date().toISOString();
    const { error } = await (supabase.from("interventions" as any) as any)
      .update(patch)
      .eq("id", intervention.id);
    if (error) return toast.error(error.message);
    await setTicketStatus(
      ticket,
      status === "en_cours"
        ? intervention.type === "reparation"
          ? "reparation_en_cours"
          : "diagnostic_en_cours"
        : status === "rapport_a_rediger"
          ? "rapport_a_rediger"
          : ticket.status,
      `intervention_${status}`,
      `Intervention ${status}`,
    );
    invalidate();
  };

  const createReport = async (e: any, intervention: any) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const owner_id = await currentUserId();
    const ok = fd.get("reparation_reussie") === "true";
    const partId = fd.get("part_id");
    const problemPartTypes = fd.getAll("problem_part_types").map((value) => String(value));
    const maintenanceComment = String(fd.get("maintenance_comment") || "").trim();
    const successParts = partId
      ? [{ part_id: partId, quantity: Number(fd.get("quantity") || 1) }]
      : [];
    const report = {
      owner_id,
      ticket_id: ticketId,
      intervention_id: intervention.id,
      site_id: ticket.site_id,
      installation_id: ticket.installation_id,
      technician_id: intervention.technician_id,
      constat: fd.get("constat"),
      actions_realisees: fd.get("actions"),
      conclusion: [
        fd.get("conclusion"),
        maintenanceComment ? `Commentaire maintenance / pièces HS : ${maintenanceComment}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      reparation_reussie: fd.get("reparation_reussie") ? ok : null,
      besoin_devis: fd.get("besoin_devis") === "on",
      besoin_commande_pieces: fd.get("besoin_commande_pieces") === "on",
      installation_stopped: fd.get("installation_stopped") === "on",
      pieces_defectueuses: problemPartTypes.map((type) => ({
        type,
        status: "HS",
        comment: maintenanceComment || null,
      })),
      pieces_remplacees: problemPartTypes.map((type) => ({ type, quantity: 1 })),
      pieces_remplacees_succes: successParts,
      problem_part_type: problemPartTypes[0] ?? null,
    };
    const { error } = await (supabase.from("intervention_reports" as any) as any).insert(report);
    if (error) return toast.error(error.message);

    const nextStatus = report.besoin_devis
      ? "devis_a_creer"
      : report.besoin_commande_pieces
        ? "en_attente_pieces"
        : ok
          ? "termine"
          : "probleme_persistant";
    await Promise.all(
      relatedTickets.map((relatedTicket: any) =>
        setTicketStatus(
          relatedTicket,
          nextStatus,
          ok ? "repair_success" : "repair_failed",
          ok ? "Réparation réussie" : "Rapport traité",
          hasRelatedTickets
            ? `Statut synchronisé depuis le rapport du ticket ${ticket.ticket_number}`
            : undefined,
        ),
      ),
    );
    e.currentTarget.reset();
    setSelectedPartTypes([]);
    invalidate();
    toast.success("Rapport créé");
  };

  const createQuoteFromTicket = async () => {
    if (!ticket || (!installation && !isSiteStockTicket && !isImportedTicket))
      return toast.error("Données manquantes");
    const owner_id = await currentUserId();
    try {
      const number = `DEV-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;

      const ticketsWithQuoteRequest = relatedTickets.filter((item: any) =>
        relatedReports.some((report: any) => report.ticket_id === item.id && report.besoin_devis),
      );
      const quoteTicketsToLink =
        ticketsWithQuoteRequest.length > 0
          ? ticketsWithQuoteRequest
          : relatedTickets.length > 0
            ? relatedTickets
            : [ticket];
      const quoteInstallationIds = [
        ...new Set(quoteTicketsToLink.map((item: any) => item.installation_id).filter(Boolean)),
      ];

      const diagnosticReports = relatedReports.filter((report: any) => {
        const intervention = relatedInterventions.find(
          (item: any) => item.id === report.intervention_id,
        );
        return intervention?.type === "diagnostic" || report.besoin_devis;
      });
      const reportPartTypesByInstallation = new Map<string, Set<string>>();
      diagnosticReports.forEach((report: any) => {
        const values = [
          ...(Array.isArray(report?.pieces_defectueuses)
            ? report.pieces_defectueuses.map((piece: any) => piece?.type)
            : []),
          ...(Array.isArray(report?.pieces_remplacees)
            ? report.pieces_remplacees.map((piece: any) => piece?.type)
            : []),
          report?.problem_part_type,
        ]
          .map((value) => String(value ?? ""))
          .filter(Boolean);
        if (!report.installation_id || values.length === 0) return;
        const current =
          reportPartTypesByInstallation.get(report.installation_id) ?? new Set<string>();
        values.forEach((value) => current.add(value));
        reportPartTypesByInstallation.set(report.installation_id, current);
      });
      const reportedPartTypes = new Set(
        Array.from(reportPartTypesByInstallation.values()).flatMap((values) => Array.from(values)),
      );

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          owner_id,
          quote_number: number,
          client_id: ticket.client_id,
          site_id: ticket.site_id,
          installation_id: isSiteStockTicket ? null : ticket.installation_id,
          vat_rate: 20,
          notes: [
            isSiteStockTicket
              ? `Devis stock sur site créé depuis le ticket ${ticket.ticket_number}`
              : hasRelatedTickets
                ? `Devis global créé depuis les tickets ${quoteTicketsToLink
                    .map((item: any) => item.ticket_number)
                    .join(", ")}`
                : `Devis créé depuis le ticket ${ticket.ticket_number}`,
            diagnosticReports.length > 0
              ? `Problèmes signalés : ${diagnosticReports
                  .map((report: any) => report.constat)
                  .filter(Boolean)
                  .join(" | ")}`
              : null,
            // The imported ticket carries the external diagnostic instead of a local report.
            isImportedTicket && diagnosticReports.length === 0 ? ticket.description : null,
            reportedPartTypes.size > 0
              ? `Pièces à remplacer : ${Array.from(reportedPartTypes).join(", ")}`
              : null,
            diagnosticReports.some((report: any) => report.installation_stopped) ||
            quoteTicketsToLink.some((item: any) => item.installation_stopped)
              ? "⚠ Installation à l’arrêt"
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Add linked ticket installations to quote when the workflow targets installations.
      if (quoteInstallationIds.length > 0) {
        const { error: qiError } = await (
          supabase.from("quote_installations" as any) as any
        ).insert(
          quoteInstallationIds.map((installationId, position) => ({
            owner_id,
            quote_id: quote.id,
            installation_id: installationId,
            position,
          })),
        );
        if (qiError) throw qiError;
      }

      // Link quote to ticket
      const { error: qtError } = await (supabase.from("quote_tickets" as any) as any).insert(
        quoteTicketsToLink.map((linkedTicket: any) => ({
          owner_id,
          quote_id: quote.id,
          ticket_id: linkedTicket.id,
        })),
      );
      if (qtError) throw qtError;

      // Add pre-filled parts from technician reports, installation by installation
      if (reportedPartTypes.size > 0) {
        const quoteItems = quoteInstallationIds.flatMap(
          (linkedInstallationId, installationPosition) => {
            const installationPartTypes = reportPartTypesByInstallation.get(linkedInstallationId);
            if (!installationPartTypes?.size) return [];
            return installationParts
              .filter((p: any) => p.installation_id === linkedInstallationId)
              .map((ip: any, partPosition: number) => {
                const part = parts.find((p: any) => p.id === ip.part_id);
                if (!part || !installationPartTypes.has(String(part.category))) return null;

                return {
                  owner_id,
                  quote_id: quote.id,
                  part_id: part.id,
                  installation_id: linkedInstallationId,
                  description: part.name,
                  quantity: 1,
                  unit_price:
                    Number(ip.configuration?.unitPriceOverride) > 0
                      ? Number(ip.configuration.unitPriceOverride)
                      : Number(part.sale_price || 0),
                  length_meters:
                    part.pricing_unit === "linear_meter" ||
                    Number(ip.configuration?.unitPriceOverride) > 0
                      ? (ip.length_meters ?? null)
                      : null,
                  unit_cost: 0,
                  position: installationPosition * 100 + partPosition,
                };
              })
              .filter(Boolean);
          },
        );

        if (quoteItems.length > 0) {
          const { error: itemsError } = await (supabase.from("quote_items") as any).insert(
            quoteItems,
          );
          if (itemsError) throw itemsError;
        }
      }

      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote_tickets"] });

      toast.success(hasRelatedTickets ? "Devis global créé avec succès" : "Devis créé avec succès");
      navigate({ to: "/quotes/$quoteId", params: { quoteId: quote.id } });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const createPO = async (quote: any) => {
    const owner_id = await currentUserId();
    const { error } = await (supabase.from("purchase_orders" as any) as any).insert({
      owner_id,
      ticket_id: ticketId,
      quote_id: quote.id,
      order_number: num("BC"),
    });
    if (error) return toast.error(error.message);
    await (supabase.from("quotes" as any) as any)
      .update({ status: "converti_en_bon_de_commande" })
      .eq("id", quote.id);
    await setTicketStatus(
      ticket,
      "bon_de_commande_recu",
      "purchase_order_created",
      "Bon de commande créé",
    );
    invalidate();
    toast.success("Bon de commande créé");
  };

  const createPartOrder = async (e: any) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const owner_id = await currentUserId();
    const { data: po, error } = await (supabase.from("part_orders" as any) as any)
      .insert({
        owner_id,
        ticket_id: ticketId,
        installation_id: ticket.installation_id,
        supplier_id: fd.get("supplier_id") || null,
        status: "analyse_stock",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const part = parts.find((p: any) => p.id === fd.get("part_id"));
    const requested = Number(fd.get("quantity") || 1);
    const draftItem = { part_id: part?.id, quantity_requested: requested, quantity: requested };
    const suggestion = suggestStorageLocation(
      draftItem,
      storageStocks,
      storageLocations,
      stockReference,
    );
    await (supabase.from("part_order_items" as any) as any).insert({
      owner_id,
      part_order_id: po.id,
      part_id: part?.id,
      designation: part?.name ?? "Pièce",
      reference: part?.reference,
      quantity: requested,
      quantity_requested: requested,
      quantity_from_stock: suggestion ? Math.min(suggestion.available, requested) : 0,
      quantity_to_order: suggestion ? suggestion.missing : requested,
      storage_location_id: suggestion?.location?.id ?? null,
      source_type: suggestion?.hasEnough ? "stock" : "fournisseur",
      status: suggestion?.hasEnough
        ? "disponible_en_stock"
        : suggestion
          ? "partiellement_disponible"
          : "a_commander",
      suggestion: suggestion
        ? {
            storage_location_id: suggestion.location.id,
            available: suggestion.available,
            missing: suggestion.missing,
            distance_km: suggestion.distance,
          }
        : {},
    });
    await (supabase.rpc as any)("refresh_part_order_status", { p_part_order_id: po.id });
    await setTicketStatus(
      ticket,
      "en_attente_pieces",
      "part_order_created",
      "Commande de pièces créée",
    );
    e.currentTarget.reset();
    invalidate();
    toast.success("Commande de pièces créée");
  };

  const createOnsiteInvoice = async (e: any) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("client_accepted") !== "on") {
      return toast.error("Validation client obligatoire avant facturation");
    }
    const partId = String(fd.get("part_id") || "");
    const sourceType = String(fd.get("source_type") || "technician_stock");
    const qty = Number(fd.get("quantity") || 1);
    const unitPrice = sourceType === "site_stock" ? 0 : Number(fd.get("unit_price") || 0);
    const part = parts.find((p: any) => p.id === partId);
    const locationId = String(fd.get("storage_location_id") || "");
    const location = storageLocations.find((loc: any) => loc.id === locationId);
    if (!part || !location) return toast.error("Sélectionnez une pièce disponible en stock");
    const stock = storageStocks.find(
      (item: any) => item.part_id === partId && item.storage_location_id === locationId,
    );
    const totalInStock = Number(stock?.quantity_available ?? 0);
    const reserved = Number(stock?.quantity_reserved ?? 0);
    const available = totalInStock - reserved;
    if (qty <= 0 || qty > available)
      return toast.error(`Stock insuffisant (${available} disponible)`);

    try {
      const owner_id = await currentUserId();
      const subtotal = qty * unitPrice;
      const invoiceNumber = num("FAC");
      const { data: invoice, error: invoiceError } = await (supabase.from("invoices" as any) as any)
        .insert({
          owner_id,
          invoice_number: invoiceNumber,
          ticket_id: ticketId,
          client_id: ticket.client_id,
          site_id: ticket.site_id,
          installation_id: ticket.installation_id,
          status: sourceType === "site_stock" ? "emise" : "brouillon",
          subtotal,
          vat_rate: 20,
          total: subtotal * 1.2,
          client_accepted_at: new Date().toISOString(),
          notes:
            sourceType === "site_stock"
              ? "Remplacement consommé depuis le stock site : aucune facturation de pièce."
              : "Remplacement sur place validé par le client avant facturation.",
        })
        .select()
        .single();
      if (invoiceError) throw invoiceError;
      const { error: itemError } = await (supabase.from("invoice_items" as any) as any).insert({
        owner_id,
        invoice_id: invoice.id,
        part_id: part.id,
        storage_location_id: location.id,
        source_type: sourceType,
        description: `${part.name} · ${location.name}`,
        quantity: qty,
        unit_price: unitPrice,
        total: subtotal,
      });
      if (itemError) throw itemError;
      const { error: stockError } = await (supabase.from("storage_location_stocks" as any) as any)
        // quantity_available is the physical total. Do not write the already
        // reservation-adjusted availability here, otherwise reservations are
        // subtracted a second time and site stock can incorrectly reach zero.
        .update({ quantity_available: totalInStock - qty })
        .eq("id", stock?.id);
      if (stockError) throw stockError;
      await (supabase.from("stock_movements" as any) as any).insert({
        owner_id,
        storage_location_id: location.id,
        part_id: part.id,
        movement_type: "sortie_stock",
        quantity: qty,
        reason: `${sourceType === "site_stock" ? "Utilisation stock site" : "Remplacement facturé"} · ${ticket.ticket_number}`,
        created_by: owner_id,
      });
      await (supabase.from("history_events" as any) as any).insert({
        owner_id,
        ticket_id: ticketId,
        site_id: ticket.site_id,
        installation_id: ticket.installation_id,
        event_type: "onsite_replacement_invoiced",
        title:
          sourceType === "site_stock"
            ? "Pièce utilisée depuis stock site"
            : "Facture de remplacement créée",
        description: `${qty} × ${part.name} depuis ${location.name}`,
        metadata: { invoice_id: invoice.id, source_type: sourceType },
        actor_id: owner_id,
      });
      e.currentTarget.reset();
      invalidate();
      toast.success(sourceType === "site_stock" ? "Stock site consommé" : "Facture créée");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const markReceived = async (order: any) => {
    const { error } = await (supabase.from("part_orders" as any) as any)
      .update({ status: "recue", received_at: new Date().toISOString().slice(0, 10) })
      .eq("id", order.id);
    if (error) return toast.error(error.message);
    await setTicketStatus(ticket, "pieces_recues", "parts_received", "Pièces reçues");
    invalidate();
    toast.success("Pièces marquées comme reçues");
  };

  const validateStockRecovery = async (item: any) => {
    const locationId = item.storage_location_id || item.suggestion?.storage_location_id;
    if (!locationId) return toast.error("Aucun lieu de stockage suggéré");
    const qty = Number(item.quantity_from_stock || item.quantity_requested || item.quantity || 1);
    const { error } = await (supabase.rpc as any)("reserve_stock_for_part_order_item", {
      p_item_id: item.id,
      p_storage_location_id: locationId,
      p_quantity: qty,
    });
    if (error) return toast.error(error.message);
    invalidate();
    toast.success("Stock réservé pour cette commande");
  };

  const markItemRecovered = async (item: any) => {
    const qty =
      Number(item.quantity_from_stock || item.quantity_requested || item.quantity || 1) -
      Number(item.quantity_recovered || 0);
    const { error } = await (supabase.rpc as any)("recover_stock_for_part_order_item", {
      p_item_id: item.id,
      p_quantity: qty,
    });
    if (error) return toast.error(error.message);
    const order = ticketPartOrders.find((o: any) => o.id === item.part_order_id);
    if (order) await refreshCommandTicketReadiness(order, ticket);
    invalidate();
    toast.success("Pièce marquée comme récupérée");
  };

  const orderItemFromSupplier = async (item: any) => {
    const { error } = await (supabase.from("part_order_items" as any) as any)
      .update({
        source_type: "fournisseur",
        status: "commandee_fournisseur",
        quantity_to_order: Number(
          item.quantity_to_order || item.quantity_requested || item.quantity || 1,
        ),
      })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    await (supabase.rpc as any)("refresh_part_order_status", {
      p_part_order_id: item.part_order_id,
    });
    invalidate();
    toast.success("Commande fournisseur enregistrée");
  };

  const markItemSupplierReceived = async (item: any) => {
    const qty = Number(item.quantity_to_order || item.quantity_requested || item.quantity || 1);
    const { error } = await (supabase.from("part_order_items" as any) as any)
      .update({ status: "recue_fournisseur", quantity_received: qty, received_quantity: qty })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    const order = ticketPartOrders.find((o: any) => o.id === item.part_order_id);
    if (order) await refreshCommandTicketReadiness(order, ticket);
    invalidate();
    toast.success("Réception fournisseur enregistrée");
  };

  const forceReadyForIntervention = async () => {
    const reason = window.prompt("Raison du forçage administrateur ?");
    if (!reason) return;
    const owner_id = await currentUserId();
    await (supabase.from("stock_movements" as any) as any).insert({
      owner_id,
      command_ticket_id: ticketPartOrders[0]?.id ?? null,
      movement_type: "forcage_intervention",
      quantity: 0,
      reason,
      created_by: owner_id,
    });
    await setTicketStatus(
      ticket,
      "reparation_a_planifier",
      "force_ready_for_intervention",
      "Forçage passage à intervention",
      reason,
    );
    invalidate();
  };

  const createRepair = async () => {
    const owner_id = await currentUserId();
    const { error } = await (supabase.from("interventions" as any) as any).insert({
      owner_id,
      ticket_id: ticketId,
      site_id: ticket.site_id,
      installation_id: ticket.installation_id,
      title: `Réparation ${ticket.ticket_number}`,
      type: "reparation",
      status: "non_assignee",
    });
    if (error) return toast.error(error.message);
    await setTicketStatus(
      ticket,
      "reparation_a_planifier",
      "repair_intervention_created",
      "Intervention de réparation créée",
    );
    invalidate();
    toast.success("Intervention de réparation créée");
  };

  const addReplacedPartsToInstallationCompatibility = async () => {
    if (!installation?.id) return;

    const owner_id = await currentUserId();
    const replacedPartIds = new Set<string>();

    ticketReports.forEach((report: any) => {
      if (!Array.isArray(report.pieces_remplacees_succes)) return;
      report.pieces_remplacees_succes.forEach((piece: any) => {
        if (piece?.part_id) replacedPartIds.add(String(piece.part_id));
      });
    });

    if (replacedPartIds.size === 0) return;

    const newInstallationParts = Array.from(replacedPartIds)
      .filter(
        (partId) =>
          !installationParts.some(
            (row: any) => row.installation_id === installation.id && row.part_id === partId,
          ),
      )
      .map((partId) => ({
        owner_id,
        installation_id: installation.id,
        part_id: partId,
        quantity: 1,
      }));

    if (newInstallationParts.length > 0) {
      const { error } = await (supabase.from("installation_parts" as any) as any).insert(
        newInstallationParts,
      );
      if (error) throw error;
    }

    if (!installation.model_id) return;

    const newModelCompat = Array.from(replacedPartIds)
      .filter(
        (partId) =>
          !modelCompat.some(
            (row: any) => row.model_id === installation.model_id && row.part_id === partId,
          ),
      )
      .map((partId) => ({
        owner_id,
        part_id: partId,
        model_id: installation.model_id,
      }));

    if (newModelCompat.length > 0) {
      const { error } = await supabase.from("part_model_compat").insert(newModelCompat);
      if (error) throw error;
    }
  };

  const close = async () => {
    const c = canCloseTicket(
      ticket,
      ticketInterventions,
      ticketReports,
      [...ticketQuotes, ...linkedQuotes],
      ticketPartOrders,
    );
    if (!c.allowed) return toast.error(`Clôture impossible : ${c.reasons.join(", ")}`);

    try {
      await addReplacedPartsToInstallationCompatibility();
      await setTicketStatus(ticket, "cloture", "ticket_closed", "Ticket clôturé");
      invalidate();
      toast.success("Ticket clôturé");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate({ to: "/tickets" })}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Retour aux tickets
      </button>

      <PageHeader
        title={`${ticket.ticket_number} · ${ticket.title}`}
        description={[client?.name, site?.name, installation?.name].filter(Boolean).join(" · ")}
      />

      {/* Ticket Info */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Informations du ticket</CardTitle>
            <div className="flex items-center gap-2">
              {ticket.installation_stopped && (
                <Badge variant="destructive">⚠ Installation à l’arrêt</Badge>
              )}
              <Badge className={getStatusColor(ticket.status)}>{ticket.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Numéro :</span> {ticket.ticket_number}
          </div>
          <div>
            <span className="text-muted-foreground">Client :</span> {client?.name || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Site :</span> {site?.name || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Installation :</span>{" "}
            {isSiteStockTicket ? "Aucune (stock sur site)" : installation?.name || "—"}
          </div>
          {isSiteStockTicket && (
            <div>
              <span className="text-muted-foreground">Stock sur site :</span>{" "}
              {storageLocations.find((location: any) => location.id === ticket.storage_location_id)
                ?.name || "—"}
            </div>
          )}
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Titre :</span> {ticket.title}
          </div>
          {ticket.description && (
            <div className="sm:col-span-2 whitespace-pre-line">
              <span className="text-muted-foreground">Description :</span> {ticket.description}
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Créé :</span> {formatDate(ticket.created_at)}
          </div>
        </CardContent>
      </Card>

      {hasRelatedTickets && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Tickets liés ({relatedTickets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {previousRelatedTicket && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/ticket/$ticketSlug"
                    params={{ ticketSlug: previousRelatedTicket.ticket_number }}
                  >
                    ← {previousRelatedTicket.ticket_number}
                  </Link>
                </Button>
              )}
              {nextRelatedTicket && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/ticket/$ticketSlug"
                    params={{ ticketSlug: nextRelatedTicket.ticket_number }}
                  >
                    {nextRelatedTicket.ticket_number} →
                  </Link>
                </Button>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {relatedTickets.map((relatedTicket: any) => (
                <Link
                  key={relatedTicket.id}
                  to="/ticket/$ticketSlug"
                  params={{ ticketSlug: relatedTicket.ticket_number }}
                  className={`rounded-md border p-3 text-sm transition-colors hover:bg-accent/50 ${
                    relatedTicket.id === ticketId ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <b>{relatedTicket.ticket_number}</b> · {relatedTicket.title}
                      <div className="text-xs text-muted-foreground">
                        {
                          installations.find(
                            (item: any) => item.id === relatedTicket.installation_id,
                          )?.name
                        }
                      </div>
                    </div>
                    <Badge variant="secondary">{relatedTicket.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow */}
      <div className="space-y-6">
        {isImportedTicket && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📋 Diagnostic réalisé sur le terrain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Ce ticket vient de l’outil terrain : le diagnostic est déjà fait, aucune
                intervention n’est à planifier ici. Créez directement le devis, puis la commande de
                pièces depuis le devis.
              </p>
              {ticket.description && <p className="whitespace-pre-line">{ticket.description}</p>}
            </CardContent>
          </Card>
        )}

        {/* Diagnostic */}
        {ticketInterventions
          .filter((i: any) => i.type === "diagnostic")
          .map((intervention: any) => {
            const report = ticketReports.find((r: any) => r.intervention_id === intervention.id);
            const isExpanded = expandedIntervention === intervention.id;
            return (
              <Card key={intervention.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedIntervention(isExpanded ? null : intervention.id)}
                      className="flex flex-1 items-center justify-between text-left"
                    >
                      <CardTitle className="text-base">📋 Diagnostic</CardTitle>
                      <ChevronLeft
                        className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{intervention.status}</Badge>
                      {intervention.status === "non_assignee" && (
                        <Button size="sm" onClick={() => assign(intervention)}>
                          <UserCheck className="mr-2 h-4 w-4" />
                          M'assigner
                        </Button>
                      )}
                    </div>

                    {renderRealCostCard(intervention)}

                    {/* Status buttons */}
                    {renderRealCostCard(intervention)}
                    <div className="flex flex-wrap gap-2">
                      {["planifiee", "en_cours", "rapport_a_rediger", "terminee", "echec"].map(
                        (s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            onClick={() => updateIntervention(intervention, s)}
                          >
                            {s}
                          </Button>
                        ),
                      )}
                    </div>

                    {/* Report Form */}
                    {!report && intervention.status === "rapport_a_rediger" && (
                      <form onSubmit={(e) => createReport(e, intervention)} className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input name="constat" placeholder="Constat" required />
                          <Input name="actions" placeholder="Actions réalisées" />
                        </div>
                        <Input name="conclusion" placeholder="Conclusion" />

                        {/* Part Type Selection */}
                        {availablePartTypes.length > 0 && (
                          <div className="rounded-md border border-dashed border-orange-200 bg-orange-50 p-3">
                            <Label className="text-xs font-semibold text-orange-900">
                              ⚠️ Type de pièce défaillante (pour pré-remplir le devis)
                            </Label>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {availablePartTypes.map((type) => (
                                <label
                                  key={type}
                                  className="flex items-center gap-2 rounded border bg-background px-2 py-1 text-sm"
                                >
                                  <input
                                    name="problem_part_types"
                                    type="checkbox"
                                    value={type}
                                    checked={selectedPartTypes.includes(type)}
                                    onChange={(event) =>
                                      setSelectedPartTypes((current) =>
                                        event.target.checked
                                          ? [...current, type]
                                          : current.filter((item) => item !== type),
                                      )
                                    }
                                  />
                                  {type}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="rounded-md border bg-muted/30 p-3">
                          <Label className="text-xs font-semibold">
                            Rapport de maintenance complet
                          </Label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Les organes non cochés sont enregistrés comme OK ; les organes cochés
                            sont enregistrés comme HS/à risque.
                          </p>
                          <Textarea
                            name="maintenance_comment"
                            className="mt-2"
                            placeholder="Commentaire / pièces cochées HS / risque constaté..."
                          />
                        </div>

                        <div className="grid gap-2 md:grid-cols-3">
                          <Select name="reparation_reussie">
                            <SelectTrigger>
                              <SelectValue placeholder="Réparation réussie ?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Oui</SelectItem>
                              <SelectItem value="false">Non</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select name="part_id">
                            <SelectTrigger>
                              <SelectValue placeholder="Pièce remplacée" />
                            </SelectTrigger>
                            <SelectContent>
                              {parts.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input name="quantity" type="number" step="1" placeholder="Qté" />
                        </div>
                        <div className="flex gap-2">
                          <label className="text-sm">
                            <input name="besoin_devis" type="checkbox" /> Besoin devis
                          </label>
                          <label className="text-sm">
                            <input name="besoin_commande_pieces" type="checkbox" /> Besoin pièces
                          </label>
                          <label className="text-sm">
                            <input name="installation_stopped" type="checkbox" /> Installation à
                            l’arrêt
                          </label>
                        </div>
                        <Button size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          Créer rapport
                        </Button>
                      </form>
                    )}

                    {/* Report Display */}
                    {report && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3">
                        <p className="text-sm font-medium text-green-900">✓ Rapport créé</p>
                        <div className="mt-2 space-y-1 text-xs text-green-800">
                          <p>
                            <b>Constat :</b> {report.constat}
                          </p>
                          {report.installation_stopped && (
                            <p className="font-medium text-red-700">⚠ Installation à l’arrêt</p>
                          )}
                          <p>
                            <b>Actions :</b> {report.actions_realisees}
                          </p>
                          <p>
                            <b>Conclusion :</b> {report.conclusion}
                          </p>
                          {(report.problem_part_type ||
                            (Array.isArray(report.pieces_defectueuses) &&
                              report.pieces_defectueuses.length > 0)) && (
                            <p>
                              <b>Types de pièces défaillantes :</b>{" "}
                              {formatPartTypeList(
                                Array.isArray(report.pieces_defectueuses) &&
                                  report.pieces_defectueuses.length > 0
                                  ? report.pieces_defectueuses.map((piece: any) => piece?.type)
                                  : report.problem_part_type,
                              )}
                            </p>
                          )}
                          {maintenanceRowsForReport(report).length > 0 && (
                            <div className="mt-2 rounded border border-green-200 bg-white/70 p-2">
                              <b>Contrôle maintenance :</b>
                              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                                {maintenanceRowsForReport(report).map((row: any) => (
                                  <span
                                    key={row.type}
                                    className={
                                      row.status === "HS" ? "text-red-700" : "text-green-700"
                                    }
                                  >
                                    {row.type} : {row.status === "HS" ? "HS / risque" : "OK"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

        {/* Create Quote Button - appears when report is done */}
        {(ticketReports.length > 0 || isSiteStockTicket || isImportedTicket) &&
          ticketQuotes.length === 0 &&
          linkedQuotes.length === 0 && (
            <Button onClick={createQuoteFromTicket} className="w-full" size="lg">
              <Plus className="mr-2 h-5 w-5" />
              {isSiteStockTicket
                ? "Créer un devis pour le stock sur site"
                : "Créer un devis depuis ce ticket"}
            </Button>
          )}

        {/* Devis */}
        {(ticketQuotes.length > 0 || linkedQuotes.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                📄 Devis ({ticketQuotes.length + linkedQuotes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...ticketQuotes, ...linkedQuotes].map((quote: any) => (
                <Link
                  key={quote.id}
                  to="/quotes/$quoteId"
                  params={{ quoteId: quote.id }}
                  className="block"
                >
                  <div className="rounded-md border p-3 transition-colors hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <b>{quote.quote_number}</b>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(quote.issued_at)}
                        </div>
                      </div>
                      <Badge variant="secondary">{quote.status || "brouillon"}</Badge>
                    </div>
                  </div>
                </Link>
              ))}

              {/* Create PO from accepted quotes */}
              {ticketQuotes
                .filter((q: any) => q.status === "accepte")
                .map((quote: any) => (
                  <Button
                    key={quote.id}
                    size="sm"
                    onClick={() => createPO(quote)}
                    className="w-full"
                  >
                    Créer bon de commande pour {quote.quote_number}
                  </Button>
                ))}
            </CardContent>
          </Card>
        )}

        {/* Purchase Orders */}
        {ticketPOs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                📋 Bons de Commande ({ticketPOs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ticketPOs.map((po: any) => (
                <div key={po.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <b>{po.order_number}</b>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(po.created_at)}
                      </div>
                    </div>
                    <Badge variant="secondary">Créé</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Part Orders */}
        {ticketPartOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                📦 Commandes de Pièces ({ticketPartOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-3">
                <div>
                  Pièces totales demandées :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) =>
                        sum + Number(item.quantity_requested || item.quantity || 0),
                      0,
                    )}
                  </b>
                </div>
                <div>
                  Disponibles en stock :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) => sum + Number(item.quantity_from_stock || 0),
                      0,
                    )}
                  </b>
                </div>
                <div>
                  À commander :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) => sum + Number(item.quantity_to_order || 0),
                      0,
                    )}
                  </b>
                </div>
                <div>
                  Déjà récupérées :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) => sum + Number(item.quantity_recovered || 0),
                      0,
                    )}
                  </b>
                </div>
                <div>
                  Déjà reçues fournisseur :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) => sum + Number(item.quantity_received || 0),
                      0,
                    )}
                  </b>
                </div>
                <div>
                  Encore manquantes :{" "}
                  <b>
                    {ticketPartOrderItems.reduce(
                      (sum: number, item: any) =>
                        sum +
                        Math.max(
                          Number(item.quantity_requested || item.quantity || 0) -
                            Number(item.quantity_recovered || 0) -
                            Number(item.quantity_received || 0),
                          0,
                        ),
                      0,
                    )}
                  </b>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={forceReadyForIntervention}>
                Forcer passage à intervention
              </Button>
              {ticketPartOrders.map((order: any) => (
                <div key={order.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">Commande #{order.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(order.created_at)}
                      </div>
                    </div>
                    <Badge variant="secondary">{order.status}</Badge>
                  </div>
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {partOrderItems
                      .filter((item: any) => item.part_order_id === order.id)
                      .map((item: any) => {
                        const part = parts.find((p: any) => p.id === item.part_id);
                        const location = storageLocations.find(
                          (loc: any) =>
                            loc.id ===
                            (item.storage_location_id || item.suggestion?.storage_location_id),
                        );
                        const suggestion = item.suggestion?.storage_location_id
                          ? item.suggestion
                          : suggestStorageLocation(
                              item,
                              storageStocks,
                              storageLocations,
                              stockReference,
                            );
                        const available = Number(suggestion?.available ?? 0);
                        const requested = Number(item.quantity_requested || item.quantity || 1);
                        const missing = Math.max(requested - available, 0);
                        return (
                          <div key={item.id} className="rounded-md bg-muted/40 p-3 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <b>{item.designation || part?.name || "Pièce"}</b>
                                <div className="text-xs text-muted-foreground">
                                  Demandé : {requested} · Stock disponible : {available} · Lieu
                                  suggéré : {location?.name ?? "—"}
                                  {suggestion?.distance_km != null
                                    ? ` · Distance : ${Number(suggestion.distance_km).toFixed(1)} km`
                                    : ""}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  À récupérer :{" "}
                                  {item.quantity_from_stock || Math.min(available, requested)} · À
                                  commander : {item.quantity_to_order || missing}
                                  {missing > 0 ? ` · Manque : ${missing}` : ""}
                                </div>
                              </div>
                              <Badge variant="secondary">{item.status}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => validateStockRecovery(item)}
                              >
                                Valider récupération depuis ce lieu
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => orderItemFromSupplier(item)}
                              >
                                Commander chez fournisseur
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markItemRecovered(item)}
                              >
                                Marquer comme récupérée
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markItemSupplierReceived(item)}
                              >
                                Marquer comme reçue fournisseur
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {order.status !== "recue" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markReceived(order)}
                      className="mt-2 w-full"
                    >
                      Marquer commande complète reçue
                    </Button>
                  )}
                </div>
              ))}

              {/* Create Part Order Form */}
              <form onSubmit={createPartOrder} className="space-y-3 border-t pt-3">
                <div className="text-sm font-medium">Ajouter une commande de pièces</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Select name="supplier_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Fournisseur" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select name="part_id" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pièce" />
                    </SelectTrigger>
                    <SelectContent>
                      {parts.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input name="quantity" type="number" defaultValue="1" placeholder="Qté" />
                </div>
                <Button size="sm" className="w-full" variant="outline">
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Commander
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Facturation remplacement sur place
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Le technicien peut sélectionner une pièce disponible dans son véhicule (facturable
              après accord client) ou consommer le stock sur site (non facturé, traçabilité stock).
            </div>
            {ticketInvoices.length > 0 && (
              <div className="space-y-2">
                {ticketInvoices.map((invoice: any) => (
                  <div key={invoice.id} className="rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <b>{invoice.invoice_number}</b>
                      <Badge variant="secondary">{invoice.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total TTC : {Number(invoice.total || 0).toFixed(2)} € · Accord client :{" "}
                      {formatDate(invoice.client_accepted_at)}
                    </div>
                    {ticketInvoiceItems
                      .filter((item: any) => item.invoice_id === invoice.id)
                      .map((item: any) => (
                        <div key={item.id} className="mt-1 text-xs">
                          {item.quantity} × {item.description} ·{" "}
                          {item.source_type === "site_stock" ? "stock site" : "facturé"}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={createOnsiteInvoice} className="space-y-3 border-t pt-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Select name="source_type" defaultValue="technician_stock">
                  <SelectTrigger>
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technician_stock">Stock technicien · facturer</SelectItem>
                    <SelectItem value="site_stock">Stock site · ne pas facturer</SelectItem>
                  </SelectContent>
                </Select>
                <Select name="part_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Pièce disponible" />
                  </SelectTrigger>
                  <SelectContent>
                    {replacementStockChoices.map((choice: any) => (
                      <SelectItem
                        key={`${choice.location.id}-${choice.part.id}`}
                        value={choice.part.id}
                      >
                        {choice.part.name} · {choice.location.name} ({choice.available})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select name="storage_location_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {replacementStockChoices.map((choice: any) => (
                      <SelectItem
                        key={`${choice.location.id}-${choice.part.id}-loc`}
                        value={choice.location.id}
                      >
                        {choice.location.name} · {choice.part.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input name="quantity" type="number" min="1" step="1" defaultValue="1" />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  placeholder="Prix unitaire HT si facturé"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input name="client_accepted" type="checkbox" required /> Accord client obtenu
                  avant remplacement/facturation
                </label>
              </div>
              <Button size="sm" disabled={replacementStockChoices.length === 0}>
                Créer facture / tracer stock
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">Commandes / Stocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ticketPartOrderItems.length === 0 ? (
              <p className="text-muted-foreground">Aucune commande de pièces liée.</p>
            ) : (
              ticketPartOrderItems.map((item: any) => {
                const order = ticketPartOrders.find((o: any) => o.id === item.part_order_id);
                const location = storageLocations.find(
                  (loc: any) => loc.id === item.storage_location_id,
                );
                const supplier = suppliers.find(
                  (s: any) => s.id === (item.supplier_id || order?.supplier_id),
                );
                return (
                  <div key={item.id} className="rounded-md border p-2">
                    <b>{item.designation}</b> : {item.status}
                    <div className="text-xs text-muted-foreground">
                      {location ? `Récupération depuis ${location.name}` : null}
                      {supplier ? ` · Commandée fournisseur ${supplier.name}` : null}
                    </div>
                  </div>
                );
              })
            )}
            {ticketPartOrders.some((order: any) => order.status === "pieces_pretes") && (
              <Badge>Pièces disponibles</Badge>
            )}
            {ticketStockMovements.length > 0 && (
              <div className="pt-2 text-xs text-muted-foreground">
                {ticketStockMovements.length} mouvement(s) de stock enregistrés
              </div>
            )}
          </CardContent>
        </Card>

        {/* Repair */}
        {ticketInterventions
          .filter((i: any) => i.type === "reparation")
          .map((intervention: any) => {
            const report = ticketReports.find((r: any) => r.intervention_id === intervention.id);
            const isExpanded = expandedIntervention === intervention.id;
            return (
              <Card key={intervention.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedIntervention(isExpanded ? null : intervention.id)}
                      className="flex flex-1 items-center justify-between text-left"
                    >
                      <CardTitle className="text-base">🔧 Réparation</CardTitle>
                      <ChevronLeft
                        className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="space-y-4 border-t pt-4">
                    <Badge variant="outline">{intervention.status}</Badge>
                    {intervention.status === "non_assignee" && (
                      <Button size="sm" onClick={() => assign(intervention)}>
                        <UserCheck className="mr-2 h-4 w-4" />
                        M'assigner
                      </Button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {["planifiee", "en_cours", "rapport_a_rediger", "terminee", "echec"].map(
                        (s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            onClick={() => updateIntervention(intervention, s)}
                          >
                            {s}
                          </Button>
                        ),
                      )}
                    </div>
                    {!report && intervention.status === "rapport_a_rediger" && (
                      <form onSubmit={(e) => createReport(e, intervention)} className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input name="constat" placeholder="Constat après réparation" required />
                          <Input name="actions" placeholder="Actions réalisées" />
                        </div>
                        <Input name="conclusion" placeholder="Conclusion" />

                        <div className="grid gap-2 md:grid-cols-3">
                          <Select name="reparation_reussie" required>
                            <SelectTrigger>
                              <SelectValue placeholder="Réparation réussie ?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Oui</SelectItem>
                              <SelectItem value="false">Non</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select name="part_id">
                            <SelectTrigger>
                              <SelectValue placeholder="Pièce remplacée" />
                            </SelectTrigger>
                            <SelectContent>
                              {parts.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input name="quantity" type="number" step="1" placeholder="Qté" />
                        </div>
                        <div className="flex gap-2">
                          <label className="text-sm">
                            <input name="besoin_devis" type="checkbox" /> Besoin devis
                          </label>
                          <label className="text-sm">
                            <input name="besoin_commande_pieces" type="checkbox" /> Besoin pièces
                          </label>
                          <label className="text-sm">
                            <input name="installation_stopped" type="checkbox" /> Installation à
                            l’arrêt
                          </label>
                        </div>
                        <Button size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          Créer rapport de réparation
                        </Button>
                      </form>
                    )}
                    {report && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3">
                        <p className="text-sm font-medium text-green-900">✓ Rapport créé</p>
                        <div className="mt-2 space-y-1 text-xs text-green-800">
                          <p>
                            <b>Constat :</b> {report.constat}
                          </p>
                          {report.installation_stopped && (
                            <p className="font-medium text-red-700">⚠ Installation à l’arrêt</p>
                          )}
                          <p>
                            <b>Actions :</b> {report.actions_realisees}
                          </p>
                          <p>
                            <b>Conclusion :</b> {report.conclusion}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

        {/* Create Repair Button */}
        {!isImportedTicket &&
          !ticketInterventions.find((i: any) => i.type === "reparation") &&
          ticketReports.length > 0 && (
            <Button onClick={createRepair} variant="outline" className="w-full">
              Créer intervention de réparation
            </Button>
          )}

        {/* Close Button */}
        <Button onClick={close} className="w-full" disabled={ticket.status === "cloture"}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {ticket.status === "cloture" ? "Ticket clôturé" : "Clôturer le ticket"}
        </Button>
      </div>

      {/* History */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Historique
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticketHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun historique</p>
          ) : (
            <div className="space-y-2">
              {ticketHistory.map((h: any) => (
                <div key={h.id} className="text-xs">
                  <span className="font-medium">{h.title}</span>
                  <div className="text-muted-foreground">{formatDate(h.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
