import { createFileRoute, Link } from "@tanstack/react-router";
import { useOne, useList, useRemove } from "@/lib/db-hooks";
import { PageHeader } from "@/components/page-header";
import { QuoteWebhookButton } from "@/components/quote-webhook-button";
import { FieldServiceQuoteButton } from "@/components/field-service-quote-button";
import { QuoteReminderNotice } from "@/components/quote-reminder-indicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  Printer,
  Send,
  ThumbsUp,
  PackageCheck,
  Boxes,
  Trash2,
  Pencil,
  Save,
  X,
  Plus,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addHistoryEvent, currentUserId } from "@/lib/ticket-workflow";

export const Route = createFileRoute("/_authenticated/quotes/$quoteId")({
  component: QuoteDetail,
});

const QUOTE_STATUSES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "envoye", label: "Envoyé" },
  { value: "accepte", label: "Accepté" },
  { value: "refuse", label: "Refusé" },
  { value: "pieces_commandees", label: "Pièces commandées" },
];

type EditableItem = {
  id?: string;
  key: string;
  description: string;
  quantity: number;
  length_meters?: number;
  unit_price: number;
  unit_cost: number;
  position: number;
  part_id?: string;
  installation_id?: string;
  reference?: string;
  category?: string;
  parent_part_id?: string;
  pricing_unit?: string;
  relation_kind?: string;
  stock_usage?: string;
  storage_location_id?: string;
  is_oversized?: boolean;
};

function QuoteDetail() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: quote } = useOne<any>("quotes", quoteId);
  const { data: items = [] } = useQuery({
    queryKey: ["quote_items", "byQuote", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: quoteInstallations = [] } = useList<any>("quote_installations", {
    filter: (q: any) => q.eq("quote_id", quoteId),
    orderBy: "position",
    ascending: true,
    key: ["quote_installations", quoteId],
  });
  const { data: settings = [] } = useList<any>("app_settings");
  const { data: clients = [] } = useList<any>("clients");
  const { data: sites = [] } = useList<any>("sites");
  const { data: installs = [] } = useList<any>("installations");
  const { data: contracts = [] } = useList<any>("contracts");
  const { data: parts = [] } = useList<any>("parts", { orderBy: "name", ascending: true });
  const { data: models = [] } = useList<any>("models");
  const { data: types = [] } = useList<any>("installation_types");
  const { data: modelCompat = [] } = useList<any>("part_model_compat");
  const { data: typeCompat = [] } = useList<any>("part_type_compat");
  const { data: installationParts = [] } = useList<any>("installation_parts");
  const { data: partComponents = [] } = useList<any>("part_components", {
    orderBy: "position",
    ascending: true,
  });
  const { data: partEquivalences = [] } = useList<any>("part_equivalences" as any);
  const { data: supplierParts = [] } = useList<any>("supplier_parts");
  const { data: contractKitPrices = [] } = useList<any>("contract_kit_prices");
  const { data: partCategories = [] } = useList<any>("part_categories", {
    orderBy: "name",
    ascending: true,
  });
  const { data: quoteTickets = [] } = useList<any>("quote_tickets", {
    filter: (q: any) => q.eq("quote_id", quoteId),
    key: ["quote_tickets", quoteId],
  });
  const { data: tickets = [] } = useList<any>("tickets");
  const { data: reports = [] } = useList<any>("intervention_reports");
  const { data: history = [] } = useList<any>("history_events");
  const { data: partOrders = [] } = useList<any>("part_orders");
  const { data: storageLocations = [] } = useList<any>("storage_locations", {
    orderBy: "name",
    ascending: true,
  });
  const remove = useRemove("quotes");
  const [isEditing, setIsEditing] = useState(false);
  const [editQuote, setEditQuote] = useState<any>({});
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [editInstallationIds, setEditInstallationIds] = useState<string[]>([]);
  const [editTargetInstallationId, setEditTargetInstallationId] = useState("");
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!quote || isEditing) return;
    setEditQuote({
      labor_hours: Number(quote.labor_hours ?? 0),
      labor_rate: Number(quote.labor_rate ?? 0),
      travel_count: Number(quote.travel_count ?? 1),
      travel_fee: Number(quote.travel_fee ?? 0),
      shipping_fee: Number(quote.shipping_fee ?? 0),
      waste_treatment_fee: Number(quote.waste_treatment_fee ?? 0),
      oversized_shipping_fee: Number(quote.oversized_shipping_fee ?? 0),
      dump_evacuation_fee: Number(quote.dump_evacuation_fee ?? 0),
      lifting_equipment_fee: Number(quote.lifting_equipment_fee ?? 0),
      vat_rate: Number(quote.vat_rate ?? 20),
      notes: quote.notes ?? "",
      client_id: quote.client_id ?? "",
      site_id: quote.site_id ?? "",
      contract_id: quote.contract_id ?? "",
      intervention_reason: quote.intervention_reason ?? "standard_repair",
      is_on_call: Boolean(quote.is_on_call),
    });
  }, [quote, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setEditItems(
      items.map((item: any, index: number) => ({
        id: item.id,
        key: item.id,
        description: item.description ?? "",
        part_id: item.part_id ?? undefined,
        installation_id: item.installation_id ?? undefined,
        reference: item.reference ?? "",
        category: item.category ?? "",
        quantity: Number(item.quantity ?? 1),
        length_meters: item.length_meters ? Number(item.length_meters) : undefined,
        pricing_unit: parts.find((part: any) => part.id === item.part_id)?.pricing_unit ?? "unit",
        unit_price: Number(item.unit_price ?? 0),
        unit_cost: Number(item.unit_cost ?? 0),
        position: Number(item.position ?? index),
        parent_part_id: item.parent_part_id ?? undefined,
        relation_kind: item.relation_kind ?? undefined,
        stock_usage: item.stock_usage ?? "billable_repair",
        storage_location_id: item.storage_location_id ?? undefined,
        is_oversized: Boolean(parts.find((part: any) => part.id === item.part_id)?.is_oversized),
      })),
    );
  }, [items, isEditing]);

  useEffect(() => {
    if (!quote || isEditing) return;
    const ids = quoteInstallations.length
      ? quoteInstallations.map((row: any) => row.installation_id)
      : quote.installation_id
        ? [quote.installation_id]
        : [];
    setEditInstallationIds(ids);
    setEditTargetInstallationId(ids[0] ?? "");
  }, [quote, quoteInstallations, isEditing]);

  if (!quote) return <p className="text-muted-foreground">Chargement...</p>;

  const client = clients.find((c: any) => c.id === quote.client_id);
  const site = sites.find((s: any) => s.id === quote.site_id);
  const linkedInstallations = quoteInstallations.length
    ? quoteInstallations
        .map((qi: any) => installs.find((i: any) => i.id === qi.installation_id))
        .filter(Boolean)
    : installs.filter((i: any) => i.id === quote.installation_id);
  const displayInstallations = linkedInstallations.length
    ? linkedInstallations
    : [{ id: "__general", name: "Chiffrage" }];
  const install = linkedInstallations[0];
  const contract = contracts.find((c: any) => c.id === quote.contract_id);
  const contractDiscountPct = Number(contract?.parts_discount_pct ?? 0);
  const contractTypeLabel = contract?.type ? String(contract.type) : contract?.name;
  const linkedTickets = quoteTickets
    .map((row: any) => tickets.find((ticket: any) => ticket.id === row.ticket_id))
    .filter(Boolean);
  const reportsByTicket = (ticketId: string) =>
    reports.filter((report: any) => report.ticket_id === ticketId);
  const formatReportPieces = (value: unknown) => {
    if (!Array.isArray(value)) return "";
    return value
      .map((piece: any) => piece?.type || piece?.name || piece?.designation || piece?.part_id)
      .filter(Boolean)
      .join(", ");
  };
  const eventsByTicket = history.filter((event: any) =>
    linkedTickets.some((ticket: any) => ticket.id === event.ticket_id),
  );
  const ticketNumbersForInstallation = (installationId: string) =>
    linkedTickets
      .filter((ticket: any) => ticket.installation_id === installationId)
      .map((ticket: any) => ticket.ticket_number);

  const editClientSites = sites.filter((siteRow: any) => siteRow.client_id === editQuote.client_id);
  const editSiteInstalls = installs.filter(
    (installRow: any) => installRow.site_id === editQuote.site_id,
  );
  const editSelectedInstallations = installs.filter((installRow: any) =>
    editInstallationIds.includes(installRow.id),
  );
  const editInstallationId = editInstallationIds[0] ?? "";
  const activeEditInstallationId = editTargetInstallationId || editInstallationId;
  const editInstallation =
    installs.find((installRow: any) => installRow.id === activeEditInstallationId) ??
    editSelectedInstallations[0];
  const editContract = contracts.find(
    (contractRow: any) => contractRow.id === editQuote.contract_id,
  );
  const editContractDiscountPct = Number(editContract?.parts_discount_pct ?? 0);
  const kits = parts.filter((part: any) => part.is_kit);
  const normalizeName = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const editPresentPartIds = new Set(
    installationParts
      .filter((row: any) => editInstallationIds.includes(row.installation_id))
      .map((row: any) => row.part_id),
  );
  const installationModel = models.find((model: any) => model.id === editInstallation?.model_id);
  const effectiveTypeId = editInstallation?.type_id || installationModel?.type_id;
  const installationType = types.find((type: any) => type.id === effectiveTypeId);
  const componentTypeNames = Array.isArray(installationType?.component_types)
    ? installationType.component_types.map((name: unknown) => String(name))
    : [];
  const availablePartTypes = [
    ...new Set(
      (componentTypeNames.length
        ? componentTypeNames
        : partCategories.map((category: any) => String(category.name))
      ).filter(Boolean),
    ),
  ] as string[];
  const compatibilityPartIds = new Set<string>();
  if (editInstallation?.model_id) {
    modelCompat
      .filter((row: any) => row.model_id === editInstallation.model_id)
      .forEach((row: any) => compatibilityPartIds.add(row.part_id));
  }
  if (effectiveTypeId) {
    typeCompat
      .filter((row: any) => row.type_id === effectiveTypeId)
      .forEach((row: any) => compatibilityPartIds.add(row.part_id));
  }
  if (editInstallation?.id) {
    installationParts
      .filter((row: any) => row.installation_id === editInstallation.id)
      .forEach((row: any) => compatibilityPartIds.add(row.part_id));
  }
  const componentTypes = new Set(componentTypeNames.map((name: string) => normalizeName(name)));
  const selectedTypes = new Set(selectedPartTypes.map((name) => normalizeName(name)));
  const compatibleParts = (
    !editInstallation?.model_id && !editInstallation?.type_id
      ? parts
      : parts.filter((part: any) => {
          const category = normalizeName(part.category);
          const matchesSelectedType = selectedTypes.size === 0 || selectedTypes.has(category);
          const matchesCompatibility =
            compatibilityPartIds.has(part.id) ||
            (Boolean(category) && componentTypes.has(category));
          return matchesSelectedType && matchesCompatibility;
        })
  ) as any[];
  const cheapestCost = (partId: string) => {
    const offers = supplierParts.filter((row: any) => row.part_id === partId);
    if (offers.length === 0) return 0;
    return Math.min(...offers.map((offer: any) => Number(offer.purchase_price)));
  };
  const buildEditPartItem = (
    partId: string,
    patch: Partial<EditableItem> = {},
    sourceInstallationId = activeEditInstallationId,
  ): EditableItem | null => {
    const part = parts.find((row: any) => row.id === partId);
    if (!part) return null;
    const installedPart = installationParts.find(
      (row: any) => row.installation_id === sourceInstallationId && row.part_id === partId,
    );
    const length = Number(installedPart?.length_meters ?? 0);
    const unitPriceOverride = Number(installedPart?.configuration?.unitPriceOverride);
    const useConfiguratorLinearPrice =
      Number.isFinite(unitPriceOverride) && unitPriceOverride > 0 && length > 0;
    const details = [
      part.pricing_unit === "linear_meter" && length > 0 ? `${length} ml` : null,
      installedPart?.dimensions,
      installedPart?.color,
      installedPart?.notes,
    ]
      .filter(Boolean)
      .join(" · ");
    const negotiatedKitPrice =
      part.is_kit && editQuote.contract_id
        ? contractKitPrices.find(
            (row: any) => row.contract_id === editQuote.contract_id && row.kit_part_id === part.id,
          )
        : null;
    const discount = editContract?.parts_discount_pct
      ? Number(editContract.parts_discount_pct) / 100
      : 0;
    const componentCost = part.is_kit
      ? partComponents
          .filter(
            (component: any) =>
              component.parent_part_id === part.id && component.relation_kind === "kit_component",
          )
          .reduce(
            (sum: number, component: any) =>
              sum + cheapestCost(component.component_part_id) * (Number(component.quantity) || 1),
            0,
          )
      : null;
    return {
      key: crypto.randomUUID(),
      part_id: part.id,
      installation_id: sourceInstallationId || undefined,
      description: details ? `${part.name} — ${details}` : part.name,
      reference: installedPart?.reference_override || part.reference || "",
      category: installedPart?.component_type || part.category || "",
      quantity: 1,
      length_meters:
        (part.pricing_unit === "linear_meter" || useConfiguratorLinearPrice) && length > 0
          ? length
          : Number(part.length_meters ?? 0) || undefined,
      unit_price: useConfiguratorLinearPrice
        ? unitPriceOverride
        : negotiatedKitPrice
          ? Number(negotiatedKitPrice.negotiated_price)
          : Number(part.sale_price) * (1 - discount),
      unit_cost: componentCost ?? cheapestCost(part.id),
      pricing_unit: useConfiguratorLinearPrice ? "linear_meter" : (part.pricing_unit ?? "unit"),
      is_oversized: Boolean(part.is_oversized),
      position: editItems.length,
      stock_usage: "billable_repair",
      ...patch,
    };
  };
  const getEditComponentPrice = (component: any) => {
    if (component.relation_kind === "kit_component") return 0;
    const componentPart = parts.find((part: any) => part.id === component.component_part_id);
    if (component.relation_kind === "negotiated_option") {
      return Number(component.negotiated_price ?? componentPart?.sale_price ?? 0);
    }
    return Number(componentPart?.sale_price ?? 0);
  };

  const buildEditComponentItem = (parentItem: EditableItem, component: any, label?: string) => {
    const componentItem = buildEditPartItem(
      component.component_part_id,
      {
        parent_part_id: parentItem.part_id,
        quantity: Number(component.quantity) || 1,
        unit_price: getEditComponentPrice(component),
        relation_kind: component.relation_kind ?? "accessory",
      },
      parentItem.installation_id ?? editInstallationId,
    );
    if (!componentItem) return null;
    const parentName = parts.find((part: any) => part.id === parentItem.part_id)?.name;
    const parentLength = Number(parentItem.length_meters ?? 0);
    return {
      ...componentItem,
      length_meters:
        componentItem.pricing_unit === "linear_meter" &&
        !componentItem.length_meters &&
        parentLength > 0
          ? parentLength
          : componentItem.length_meters,
      description: parentName
        ? `${parentName} > ${componentItem.description}${label ? ` (${label})` : ""}`
        : `${componentItem.description}${label ? ` (${label})` : ""}`,
    };
  };

  const addEditPart = (partId: string, sourceInstallationId = editInstallationId) => {
    const item = buildEditPartItem(partId, {}, sourceInstallationId);
    if (!item) return;
    const kitComponents = parts.find((part: any) => part.id === partId)?.is_kit
      ? (partComponents
          .filter(
            (component: any) =>
              component.parent_part_id === partId && component.relation_kind === "kit_component",
          )
          .map((component: any) => buildEditComponentItem(item, component, "compris dans le kit"))
          .filter(Boolean) as EditableItem[])
      : [];
    setEditItems((current) => [...current, item, ...kitComponents]);
  };
  const addEditPresentParts = () => {
    const existingPartIds = new Set(editItems.map((item) => item.part_id).filter(Boolean));
    installationParts
      .filter((row: any) => editInstallationIds.includes(row.installation_id))
      .filter((row: any) => !existingPartIds.has(row.part_id))
      .forEach((row: any) => addEditPart(row.part_id, row.installation_id));
  };
  const addEditComponentToQuote = (parentItem: EditableItem, component: any) => {
    const relationLabel =
      component.relation_kind === "kit_component"
        ? "compris dans le kit"
        : component.relation_kind === "negotiated_option"
          ? "option prix négocié"
          : "option";
    const componentItem = buildEditComponentItem(parentItem, component, relationLabel);
    if (!componentItem) return;
    setEditItems((current) => [...current, componentItem]);
  };

  const changeQuoteStatus = async (status: string) => {
    const { error } = await (supabase.from("quotes" as any) as any)
      .update({ status })
      .eq("id", quoteId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["quotes", quoteId] });
    toast.success("Statut du devis mis à jour");
  };

  const applyEditContractPricing = (
    contractRow: any,
    reason = editQuote.intervention_reason,
    onCall = editQuote.is_on_call,
  ) => {
    if (!contractRow) return;
    const usesOutOfContractRates = reason === "damage_vandalism" || reason === "new_installation";
    let laborRate = Number(
      (usesOutOfContractRates
        ? contractRow.out_of_contract_hourly_rate
        : contractRow.hourly_rate) ??
        contractRow.hourly_rate ??
        0,
    );
    let travelFee = Number(
      (usesOutOfContractRates ? contractRow.out_of_contract_travel_fee : contractRow.travel_fee) ??
        contractRow.travel_fee ??
        0,
    );

    if (reason === "standard_repair" && contractRow.repairs_included) {
      laborRate = 0;
      travelFee = 0;
    }

    if (onCall) {
      if (contractRow.on_call_included) {
        laborRate = 0;
        travelFee = 0;
      } else {
        laborRate = Number(contractRow.on_call_hourly_rate ?? contractRow.hourly_rate ?? laborRate);
        travelFee = Number(contractRow.on_call_travel_fee ?? contractRow.travel_fee ?? travelFee);
      }
    }

    setEditQuote((current: any) => ({
      ...current,
      labor_rate: laborRate,
      travel_fee: travelFee,
      shipping_fee: Number(contractRow.shipping_fee ?? 0),
      waste_treatment_fee: Number(contractRow.waste_treatment_fee ?? 0),
      oversized_shipping_fee: 0,
      dump_evacuation_fee: Number(contractRow.dump_evacuation_fee ?? 0),
      lifting_equipment_fee: Number(contractRow.lifting_equipment_fee ?? 0),
    }));
  };

  const hasEditOversizedPart = editItems.some((item) => {
    if (item.is_oversized) return true;
    return Boolean(parts.find((part: any) => part.id === item.part_id)?.is_oversized);
  });

  const removeEditItem = (key: string) =>
    setEditItems((current) => {
      const removed = current.find((item) => item.key === key);
      return current.filter(
        (item) =>
          item.key !== key && (!removed?.part_id || item.parent_part_id !== removed.part_id),
      );
    });

  const updateEditItem = (key: string, patch: Partial<EditableItem>) =>
    setEditItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );

  const addEditItem = () =>
    setEditItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        installation_id: activeEditInstallationId || undefined,
        description: "",
        reference: "",
        category: "",
        quantity: 1,
        unit_price: 0,
        unit_cost: 0,
        position: current.length,
      },
    ]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const owner_id = user.user!.id;
      const { error } = await (supabase.from("quotes" as any) as any)
        .update({
          client_id: editQuote.client_id,
          site_id: editQuote.site_id || null,
          installation_id: editInstallationId || null,
          contract_id: editQuote.contract_id || null,
          intervention_reason: editQuote.intervention_reason,
          is_on_call: editQuote.is_on_call,
          labor_hours: editQuote.labor_hours,
          labor_rate: editQuote.labor_rate,
          travel_count: editQuote.travel_count,
          travel_fee: editQuote.travel_fee,
          shipping_fee: editQuote.shipping_fee,
          waste_treatment_fee: editQuote.waste_treatment_fee,
          oversized_shipping_fee:
            hasEditOversizedPart && editContract
              ? Number(editContract.oversized_shipping_fee ?? 0)
              : 0,
          dump_evacuation_fee: editQuote.dump_evacuation_fee,
          lifting_equipment_fee: editQuote.lifting_equipment_fee,
          vat_rate: editQuote.vat_rate,
          notes: editQuote.notes || null,
        })
        .eq("id", quoteId);
      if (error) throw error;

      const { error: deleteInstallationsError } = await (
        supabase.from("quote_installations" as any) as any
      )
        .delete()
        .eq("quote_id", quoteId);
      if (deleteInstallationsError) throw deleteInstallationsError;
      if (editInstallationIds.length > 0) {
        const { error: insertInstallationsError } = await (
          supabase.from("quote_installations" as any) as any
        ).insert(
          editInstallationIds.map((id, position) => ({
            owner_id,
            quote_id: quoteId,
            installation_id: id,
            position,
          })),
        );
        if (insertInstallationsError) throw insertInstallationsError;
      }

      const keptIds = editItems.map((item) => item.id).filter(Boolean);
      const deletedIds = items
        .map((item: any) => item.id)
        .filter((id: string) => !keptIds.includes(id));
      if (deletedIds.length > 0) {
        const { error: deleteError } = await (supabase.from("quote_items" as any) as any)
          .delete()
          .in("id", deletedIds);
        if (deleteError) throw deleteError;
      }

      for (const [position, item] of editItems.entries()) {
        const row = {
          part_id: item.part_id ?? null,
          installation_id: item.installation_id ?? editInstallationId ?? null,
          description: item.description,
          quantity: item.quantity,
          length_meters: item.pricing_unit === "linear_meter" ? (item.length_meters ?? null) : null,
          unit_price: item.unit_price,
          unit_cost: item.unit_cost,
          position,
          parent_part_id: item.parent_part_id ?? null,
          relation_kind: item.relation_kind ?? null,
          stock_usage: item.stock_usage ?? "billable_repair",
          storage_location_id: item.storage_location_id ?? null,
        };
        if (item.id) {
          const { error: itemError } = await (supabase.from("quote_items" as any) as any)
            .update(row)
            .eq("id", item.id);
          if (itemError) throw itemError;
        } else {
          const { error: itemError } = await supabase.from("quote_items").insert({
            owner_id,
            quote_id: quoteId,
            ...row,
          });
          if (itemError) throw itemError;
        }
      }

      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_items", "byQuote", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_installations", quoteId] });
      setIsEditing(false);
      toast.success("Devis modifié");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const bestSupplierId = (partId?: string | null) => {
    if (!partId) return null;
    const offers = supplierParts
      .filter((row: any) => row.part_id === partId)
      .sort((a: any, b: any) => Number(a.purchase_price ?? 0) - Number(b.purchase_price ?? 0));
    return offers[0]?.supplier_id ?? null;
  };

  const createQuotePartOrders = async () => {
    if (linkedTickets.length === 0) return;
    const owner_id = await currentUserId();
    const existingKeys = new Set(
      partOrders
        .filter((order: any) => order.quote_id === quoteId && order.status !== "annulee")
        .map((order: any) => `${order.ticket_id}:${order.supplier_id ?? "__none"}`),
    );

    for (const ticket of linkedTickets) {
      const ticketItems = items.filter(
        (item: any) =>
          (!item.installation_id || item.installation_id === ticket.installation_id) &&
          item.stock_usage !== "use_site_stock" &&
          item.stock_usage !== "audit_service",
      );
      const grouped = new Map<string, any[]>();
      ticketItems.forEach((item: any) => {
        const supplierId = bestSupplierId(item.part_id);
        const key = supplierId ?? "__none";
        grouped.set(key, [...(grouped.get(key) ?? []), item]);
      });

      for (const [supplierKey, groupedItems] of grouped.entries()) {
        const supplier_id = supplierKey === "__none" ? null : supplierKey;
        const orderKey = `${ticket.id}:${supplier_id ?? "__none"}`;
        if (existingKeys.has(orderKey) || groupedItems.length === 0) continue;

        const { data: order, error } = await (supabase.from("part_orders" as any) as any)
          .insert({
            owner_id,
            ticket_id: ticket.id,
            quote_id: quoteId,
            installation_id: ticket.installation_id,
            supplier_id,
            status: "commandee",
            ordered_at: new Date().toISOString().slice(0, 10),
          })
          .select()
          .single();
        if (error) throw error;

        const orderLines = groupedItems.map((item: any) => ({
          owner_id,
          part_order_id: order.id,
          part_id: item.part_id ?? null,
          designation: item.description || "Pièce",
          reference: parts.find((part: any) => part.id === item.part_id)?.reference ?? null,
          quantity: Number(item.quantity || 1),
          source_type: item.stock_usage === "replenish_site_stock" ? "fournisseur" : undefined,
        }));
        const { error: linesError } = await (
          supabase.from("part_order_items" as any) as any
        ).insert(orderLines);
        if (linesError) throw linesError;
        existingKeys.add(orderKey);
      }

      await addHistoryEvent(
        ticket.owner_id,
        { ticket_id: ticket.id, site_id: ticket.site_id, installation_id: ticket.installation_id },
        "quote_part_orders_created",
        "Commandes de pièces créées depuis le devis",
        `Devis ${quote.quote_number ?? quoteId}`,
        { quote_id: quoteId },
      );
    }
  };

  const updateGlobalStatus = async (quoteStatus: string, ticketStatus: string) => {
    try {
      if (quoteStatus === "pieces_commandees") await createQuotePartOrders();
      const { error } = await (supabase.from("quotes" as any) as any)
        .update({ status: quoteStatus })
        .eq("id", quoteId);
      if (error) throw error;
      if (linkedTickets.length > 0) {
        const { error: ticketError } = await (supabase.from("tickets" as any) as any)
          .update({ status: ticketStatus })
          .in(
            "id",
            linkedTickets.map((ticket: any) => ticket.id),
          );
        if (ticketError) throw ticketError;
      }
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", quoteId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["part_orders"] });
      qc.invalidateQueries({ queryKey: ["part_order_items"] });
      toast.success(
        quoteStatus === "pieces_commandees" ? "Commandes de pièces créées" : "Statuts mis à jour",
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getEditableBillableQuantity = (item: EditableItem) =>
    Number(item.quantity || 0) *
    (item.pricing_unit === "linear_meter" ? Number(item.length_meters || 0) || 1 : 1);

  const getEditableMargin = (item: EditableItem) =>
    (Number(item.unit_price) - Number(item.unit_cost)) * getEditableBillableQuantity(item);

  const getEditEquivalenceSuggestion = (item: EditableItem) => {
    if (!item.part_id) return null;
    const currentMargin = getEditableMargin(item);
    return (
      partEquivalences
        .filter((row: any) => row.source_part_id === item.part_id)
        .map((row: any) => {
          const part = parts.find((candidate: any) => candidate.id === row.equivalent_part_id);
          if (!part) return null;
          const candidate = buildEditPartItem(part.id, {}, item.installation_id ?? editInstallationId);
          if (!candidate) return null;
          const equivalentItem = { ...candidate, quantity: item.quantity };
          const candidateMargin = getEditableMargin(equivalentItem);
          return { row, part, item: equivalentItem, marginGain: candidateMargin - currentMargin };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.marginGain - a.marginGain)[0] ?? null
    );
  };

  const applyEditEquivalenceSuggestion = (key: string, suggestion: any) => {
    updateEditItem(key, {
      part_id: suggestion.item.part_id,
      description: suggestion.item.description,
      reference: suggestion.item.reference,
      category: suggestion.item.category,
      unit_price: suggestion.item.unit_price,
      unit_cost: suggestion.item.unit_cost,
      length_meters: suggestion.item.length_meters,
      pricing_unit: suggestion.item.pricing_unit,
      is_oversized: suggestion.item.is_oversized,
    });
    toast.success(`Remplacement suggéré appliqué : ${suggestion.part.name}`);
  };

  const partsHT = items.reduce((s: number, i: any) => {
    const part = parts.find((row: any) => row.id === i.part_id);
    const billableQuantity =
      Number(i.quantity) *
      (part?.pricing_unit === "linear_meter" || Number(i.length_meters) > 0
        ? Number(i.length_meters || 0) || 1
        : 1);
    return s + Number(i.unit_price) * billableQuantity;
  }, 0);
  const travelCount = Number(quote.travel_count ?? 1);
  const laborHT = Number(quote.labor_hours ?? 0) * travelCount * Number(quote.labor_rate ?? 0);
  const shippingFee = Number(quote.shipping_fee ?? 0);
  const wasteTreatmentFee = Number(quote.waste_treatment_fee ?? 0);
  const oversizedShippingFee = Number(quote.oversized_shipping_fee ?? 0);
  const dumpEvacuationFee = Number(quote.dump_evacuation_fee ?? 0);
  const liftingEquipmentFee = Number(quote.lifting_equipment_fee ?? 0);
  const totalHT =
    partsHT +
    laborHT +
    Number(quote.travel_fee ?? 0) +
    shippingFee +
    wasteTreatmentFee +
    oversizedShippingFee +
    dumpEvacuationFee +
    liftingEquipmentFee;
  const vat = (totalHT * Number(quote.vat_rate)) / 100;
  const totalTTC = totalHT + vat;
  const quoteSettings = settings.find((setting: any) => setting.key === "quote_document");
  const pageOneDescription = String(quoteSettings?.value?.description ?? "");
  const terms = String(
    quoteSettings?.value?.terms ?? "Devis valable 30 jours. Bon pour accord : date et signature.",
  );
  const fmt = (n: number) => n.toFixed(2) + " €";
  const stockUsageLabel = (usage?: string | null) =>
    usage === "use_site_stock"
      ? "Utilisée depuis stock site · non facturée"
      : usage === "replenish_site_stock"
        ? "Approvisionnement stock site"
        : usage === "audit_service"
          ? "Levée de réserve / contrôle stock"
          : null;

  const del = async () => {
    if (!confirm("Supprimer ce devis ?")) return;
    await remove.mutateAsync(quoteId);
    navigate({ to: "/quotes" });
  };

  return (
    <div>
      <Link
        to="/quotes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ChevronLeft className="h-4 w-4" /> Devis
      </Link>
      <PageHeader
        title={quote.quote_number}
        description={`Émis le ${new Date(quote.issued_at).toLocaleDateString("fr-FR")}`}
        actions={
          <div className="print:hidden flex flex-wrap gap-2">
            <select
              value={quote.status ?? "brouillon"}
              onChange={(event) => changeQuoteStatus(event.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Statut du devis"
            >
              {QUOTE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => setIsEditing((current) => !current)}>
              {isEditing ? <X className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
              {isEditing ? "Annuler" : "Modifier"}
            </Button>
            {isEditing && (
              <Button onClick={saveEdit} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            )}
            {linkedTickets.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateGlobalStatus("envoye", "devis_envoye")}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Envoyé
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateGlobalStatus("accepte", "devis_accepte")}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Accepté
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateGlobalStatus("pieces_commandees", "en_attente_pieces")}
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Commande pièces
                </Button>
              </>
            )}
            <QuoteWebhookButton quoteId={quoteId} disabled={isEditing || saving} />
            {linkedTickets.some((ticket: any) => ticket.external_source === "field_service") && (
              <FieldServiceQuoteButton quoteId={quoteId} disabled={isEditing || saving} />
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimer / PDF
            </Button>
            <Button variant="ghost" onClick={del}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          </div>
        }
      />

      <QuoteReminderNotice quoteId={quoteId} />

      {isEditing && (
        <Card className="mb-6 print:hidden">
          <CardContent className="space-y-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Client *</Label>
                <select
                  value={editQuote.client_id ?? ""}
                  onChange={(event) => {
                    setEditQuote((current: any) => ({
                      ...current,
                      client_id: event.target.value,
                      site_id: "",
                    }));
                    setEditInstallationIds([]);
                    setSelectedPartTypes([]);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">—</option>
                  {clients.map((clientRow: any) => (
                    <option key={clientRow.id} value={clientRow.id}>
                      {clientRow.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Site</Label>
                <select
                  value={editQuote.site_id ?? ""}
                  onChange={(event) => {
                    setEditQuote((current: any) => ({ ...current, site_id: event.target.value }));
                    setEditInstallationIds([]);
                    setSelectedPartTypes([]);
                  }}
                  disabled={!editQuote.client_id}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">—</option>
                  {editClientSites.map((siteRow: any) => (
                    <option key={siteRow.id} value={siteRow.id}>
                      {siteRow.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Installations</Label>
                <div className="rounded-md border border-input p-2 space-y-1">
                  {editSiteInstalls.length === 0 ? (
                    <div className="text-sm text-muted-foreground">—</div>
                  ) : (
                    editSiteInstalls.map((installRow: any) => {
                      const checked = editInstallationIds.includes(installRow.id);
                      return (
                        <label key={installRow.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEditInstallationIds((current) =>
                                checked
                                  ? current.filter((id) => id !== installRow.id)
                                  : [...current, installRow.id],
                              );
                              setSelectedPartTypes([]);
                              if (!checked && installRow.contract_id) {
                                setEditQuote((current: any) => ({
                                  ...current,
                                  contract_id: installRow.contract_id,
                                }));
                              }
                            }}
                          />
                          <span>{installRow.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <Label>Contrat appliqué</Label>
                <select
                  value={editQuote.contract_id ?? ""}
                  onChange={(event) => {
                    const nextContract = contracts.find(
                      (contractRow: any) => contractRow.id === event.target.value,
                    );
                    setEditQuote((current: any) => ({
                      ...current,
                      contract_id: event.target.value,
                    }));
                    applyEditContractPricing(
                      nextContract,
                      editQuote.intervention_reason,
                      editQuote.is_on_call,
                    );
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Aucun</option>
                  {contracts.map((contractRow: any) => (
                    <option key={contractRow.id} value={contractRow.id}>
                      {contractRow.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["labor_hours", "Heures", "0.25"],
                ["labor_rate", "Tarif €/h/technicien", "0.01"],
                ["travel_count", "Nombre de déplacements", "1"],
                ["travel_fee", "Déplacement €", "0.01"],
                ["shipping_fee", "Frais de port €", "0.01"],
                ["waste_treatment_fee", "Traitement déchets €", "0.01"],
                ["oversized_shipping_fee", "Port hors gabarit €", "0.01"],
                ["dump_evacuation_fee", "Déchetterie €", "0.01"],
                ["lifting_equipment_fee", "Levage €", "0.01"],
                ["vat_rate", "TVA %", "0.01"],
              ].map(([key, label, step]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    step={step}
                    value={editQuote[key] ?? 0}
                    onChange={(event) =>
                      setEditQuote((current: any) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              ))}
              <div>
                <Label>Motif d’intervention</Label>
                <select
                  value={editQuote.intervention_reason ?? "standard_repair"}
                  onChange={(event) => {
                    const reason = event.target.value;
                    setEditQuote((current: any) => ({
                      ...current,
                      intervention_reason: reason,
                    }));
                    applyEditContractPricing(editContract, reason, editQuote.is_on_call);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="standard_repair">Réparation hors casse</option>
                  <option value="damage_vandalism">Casse / vandalisme</option>
                  <option value="new_installation">Nouvelle installation</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editQuote.is_on_call)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setEditQuote((current: any) => ({
                      ...current,
                      is_on_call: checked,
                    }));
                    applyEditContractPricing(editContract, editQuote.intervention_reason, checked);
                  }}
                />
                Astreinte
              </label>
              <div className="sm:col-span-4">
                <Label>Notes</Label>
                <Textarea
                  value={editQuote.notes ?? ""}
                  onChange={(event) =>
                    setEditQuote((current: any) => ({ ...current, notes: event.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Pièces et lignes du devis</h3>
                <Button type="button" variant="outline" size="sm" onClick={addEditItem}>
                  <Plus className="mr-1 h-4 w-4" /> Ligne libre
                </Button>
              </div>
              {editInstallationIds.length > 1 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <Label>Installation cible pour les pièces ajoutées</Label>
                  <select
                    value={activeEditInstallationId}
                    onChange={(event) => {
                      setEditTargetInstallationId(event.target.value);
                      setSelectedPartTypes([]);
                    }}
                    className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {editSelectedInstallations.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name || row.installation_number || "Installation"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Les nouvelles pièces seront rattachées à cette installation du devis
                    multi-installations.
                  </p>
                </div>
              )}
              {availablePartTypes.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-md border border-border/60 p-3">
                  {availablePartTypes.map((type) => {
                    const checked = selectedPartTypes.includes(type);
                    return (
                      <label
                        key={type}
                        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedPartTypes((current) =>
                              checked
                                ? current.filter((name) => name !== type)
                                : [...current, type],
                            )
                          }
                        />
                        {type}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <select
                  onChange={(event) => {
                    if (event.target.value) {
                      addEditPart(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  className="flex h-9 flex-1 min-w-[220px] rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">+ Ajouter une pièce présente / compatible</option>
                  {compatibleParts.map((part: any) => (
                    <option key={part.id} value={part.id}>
                      {editPresentPartIds.has(part.id) ? "✓ " : ""}
                      {part.name} — {Number(part.sale_price).toFixed(2)}€
                    </option>
                  ))}
                </select>
                {kits.length > 0 && (
                  <select
                    onChange={(event) => {
                      if (event.target.value) {
                        addEditPart(event.target.value);
                        event.target.value = "";
                      }
                    }}
                    className="flex h-9 min-w-[180px] rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">+ Ajouter un kit</option>
                    {kits.map((kit: any) => (
                      <option key={kit.id} value={kit.id}>
                        {kit.name} — {Number(kit.sale_price).toFixed(2)}€
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEditPresentParts}
                  disabled={editInstallationIds.length === 0}
                >
                  Ajouter présentes
                </Button>
              </div>
              {editItems.map((item) => {
                const equivalenceSuggestion = getEditEquivalenceSuggestion(item);
                const hasBetterEquivalence = Number(equivalenceSuggestion?.marginGain ?? 0) > 0.01;
                return (
                  <div
                    key={item.key}
                    className={`rounded-md border p-3 ${
                      hasBetterEquivalence
                        ? "border-green-500/60 bg-green-50/70"
                        : "border-border/60"
                    }`}
                  >
                    <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_90px_90px_110px_110px_40px]">
                      <Input
                        value={item.description}
                        onChange={(event) =>
                          updateEditItem(item.key, { description: event.target.value })
                        }
                        placeholder="Description"
                      />
                      <Input
                        value={item.reference ?? ""}
                        onChange={(event) =>
                          updateEditItem(item.key, { reference: event.target.value })
                        }
                        placeholder="Référence"
                        disabled={Boolean(item.part_id)}
                      />
                      <select
                        value={item.category ?? ""}
                        onChange={(event) =>
                          updateEditItem(item.key, { category: event.target.value })
                        }
                        disabled={Boolean(item.part_id)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Type</option>
                        {partCategories.map((category: any) => (
                          <option key={category.id} value={category.name}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) =>
                          updateEditItem(item.key, { quantity: Number(event.target.value) })
                        }
                        placeholder="Qté"
                      />
                      {item.pricing_unit === "linear_meter" && (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.length_meters ?? ""}
                          onChange={(event) =>
                            updateEditItem(item.key, { length_meters: Number(event.target.value) })
                          }
                          placeholder="Long. ml"
                          title="Longueur unitaire en mètres linéaires"
                        />
                      )}
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(event) =>
                          updateEditItem(item.key, { unit_price: Number(event.target.value) })
                        }
                        placeholder="PU HT"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(event) =>
                          updateEditItem(item.key, { unit_cost: Number(event.target.value) })
                        }
                        placeholder="Coût"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditItem(item.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {item.part_id && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr]">
                        <select
                          value={item.stock_usage ?? "billable_repair"}
                          onChange={(event) =>
                            updateEditItem(item.key, {
                              stock_usage: event.target.value,
                              unit_price:
                                event.target.value === "use_site_stock" ? 0 : item.unit_price,
                            })
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        >
                          <option value="billable_repair">Pièce réparation facturée</option>
                          <option value="use_site_stock">Utiliser stock site (non facturé)</option>
                          <option value="use_technician_stock">Utiliser stock technicien</option>
                          <option value="replenish_site_stock">Commander pour stock site</option>
                          <option value="replenish_technician_stock">
                            Envoyer au stock technicien
                          </option>
                          <option value="direct_site_delivery">Livrer directement sur site</option>
                          <option value="audit_service">Levée de réserve / contrôle</option>
                        </select>
                        <select
                          value={item.storage_location_id ?? ""}
                          onChange={(event) =>
                            updateEditItem(item.key, {
                              storage_location_id: event.target.value || undefined,
                            })
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        >
                          <option value="">Stock site automatique</option>
                          {storageLocations
                            .filter(
                              (loc: any) =>
                                ["site", "vehicule_technicien", "point_relais"].includes(
                                  loc.type,
                                ) || loc.site_id === editQuote.site_id,
                            )
                            .map((loc: any) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    {partComponents.some(
                      (component: any) => component.parent_part_id === item.part_id,
                    ) && (
                      <div className="mt-3 rounded-md border border-dashed border-border/70 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <Boxes className="h-3.5 w-3.5" /> Composition comprise et options
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {partComponents
                            .filter((component: any) => component.parent_part_id === item.part_id)
                            .map((component: any) => {
                              const componentPart = parts.find(
                                (part: any) => part.id === component.component_part_id,
                              );
                              const alreadyAdded = editItems.some(
                                (row) =>
                                  row.parent_part_id === item.part_id &&
                                  row.part_id === component.component_part_id,
                              );
                              return (
                                <Button
                                  key={component.component_part_id}
                                  type="button"
                                  variant={alreadyAdded ? "secondary" : "outline"}
                                  size="sm"
                                  disabled={alreadyAdded}
                                  className="justify-start"
                                  onClick={() => addEditComponentToQuote(item, component)}
                                >
                                  {alreadyAdded ? "✓ " : "+ "}
                                  {componentPart?.name ?? "Pièce inconnue"} · Qté{" "}
                                  {component.quantity}
                                  {component.relation_kind === "kit_component"
                                    ? " · composition"
                                    : component.relation_kind === "negotiated_option"
                                      ? " · option négociée"
                                      : " · accessoire unité"}
                                </Button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    {hasBetterEquivalence && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-green-500/30 bg-green-100/70 p-2 text-xs text-green-800">
                        <span>
                          Équivalence plus rentable suggérée : {equivalenceSuggestion!.part.name} (+
                          {equivalenceSuggestion!.marginGain.toFixed(2)} € de marge)
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-green-600 text-green-800 hover:bg-green-200"
                          onClick={() =>
                            applyEditEquivalenceSuggestion(item.key, equivalenceSuggestion)
                          }
                        >
                          Remplacer
                        </Button>
                      </div>
                    )}
                    {editContractDiscountPct > 0 && item.part_id && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Réduction contrat appliquée : {editContractDiscountPct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mx-auto max-w-3xl bg-card p-8 shadow-sm print:shadow-none print:bg-white print:text-black">
        <div className="mb-8 flex items-start justify-between border-b border-border pb-6">
          <div>
            <div className="text-2xl font-semibold tracking-tight">DEVIS</div>
            <div className="mt-1 text-sm text-muted-foreground">N° {quote.quote_number}</div>
            <div className="text-sm text-muted-foreground">
              Date : {new Date(quote.issued_at).toLocaleDateString("fr-FR")}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">AutoMaintain</div>
            <div className="text-muted-foreground">Maintenance portes automatiques</div>
          </div>
        </div>

        <div className="mb-6 grid gap-6 sm:grid-cols-2 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Client
            </div>
            <div className="font-medium">{client?.name}</div>
            <div className="text-muted-foreground">{client?.address}</div>
            <div className="text-muted-foreground">
              {[client?.email, client?.phone].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Intervention
            </div>
            <div>{site?.name}</div>
            <div className="text-muted-foreground">{site?.address}</div>
            {linkedInstallations.length > 0 && (
              <div className="text-muted-foreground">
                Installations : {linkedInstallations.map((x: any) => x.name).join(", ")}
              </div>
            )}
            {linkedTickets.length > 0 && (
              <div className="text-muted-foreground">
                Tickets :{" "}
                {linkedTickets.map((ticket: any, index: number) => (
                  <span key={ticket.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      to="/ticket/$ticketSlug"
                      params={{ ticketSlug: ticket.ticket_number ?? ticket.id }}
                      className="underline underline-offset-2"
                    >
                      {ticket.ticket_number}
                    </Link>
                  </span>
                ))}
              </div>
            )}
            {contractTypeLabel && (
              <div className="text-muted-foreground">Type de contrat : {contractTypeLabel}</div>
            )}
            <div className="text-muted-foreground">
              Intervention :{" "}
              {quote.intervention_reason === "damage_vandalism"
                ? "Casse / vandalisme"
                : quote.intervention_reason === "new_installation"
                  ? "Nouvelle installation"
                  : "Réparation hors casse"}
              {quote.is_on_call ? " · Astreinte" : ""}
            </div>
          </div>
        </div>

        {pageOneDescription && (
          <div className="mb-8 rounded-md bg-muted/40 p-4 text-sm print:bg-transparent">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </div>
            <div className="whitespace-pre-wrap">{pageOneDescription}</div>
          </div>
        )}

        <div className="print:break-before-page">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Désignation</th>
                <th className="py-2 text-right">Qté</th>
                <th className="py-2 text-right">PU HT</th>
                <th className="py-2 text-right">Réduc. contrat</th>
                <th className="py-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {displayInstallations.flatMap((inst: any) => [
                <tr key={`inst-${inst.id}`} className="bg-muted/40 font-semibold">
                  <td className="py-2" colSpan={5}>
                    Installation : {inst.name}
                    {ticketNumbersForInstallation(inst.id).length > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Tickets concernés : {ticketNumbersForInstallation(inst.id).join(", ")}
                      </span>
                    )}
                  </td>
                </tr>,
                ...items
                  .filter(
                    (i: any) =>
                      inst.id === "__general" ||
                      !i.installation_id ||
                      i.installation_id === inst.id,
                  )
                  .map((i: any) => (
                    <tr key={i.id}>
                      <td className="py-2">
                        {i.description}
                        {stockUsageLabel(i.stock_usage) ? (
                          <div className="text-xs text-muted-foreground">
                            {stockUsageLabel(i.stock_usage)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">
                        {Number(i.quantity)}
                        {(parts.find((part: any) => part.id === i.part_id)?.pricing_unit ===
                          "linear_meter" ||
                          Number(i.length_meters) > 0) &&
                        i.length_meters
                          ? ` × ${Number(i.length_meters)} ml`
                          : ""}
                      </td>
                      <td className="py-2 text-right">{fmt(Number(i.unit_price))}</td>
                      <td className="py-2 text-right">
                        {contractDiscountPct > 0 ? `${contractDiscountPct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {fmt(
                          Number(i.unit_price) *
                            Number(i.quantity) *
                            (parts.find((part: any) => part.id === i.part_id)?.pricing_unit ===
                              "linear_meter" || Number(i.length_meters) > 0
                              ? Number(i.length_meters || 0) || 1
                              : 1),
                        )}
                      </td>
                    </tr>
                  )),
              ])}
              {Number(quote.labor_hours) > 0 && (
                <tr>
                  <td className="py-2">Main-d'œuvre</td>
                  <td className="py-2 text-right">
                    {quote.labor_hours} h/technicien × {travelCount} déplacement
                    {travelCount > 1 ? "s" : ""}
                  </td>
                  <td className="py-2 text-right">{fmt(Number(quote.labor_rate))}</td>
                  <td className="py-2 text-right">—</td>
                  <td className="py-2 text-right">{fmt(laborHT)}</td>
                </tr>
              )}
              {Number(quote.travel_fee) > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Déplacement
                  </td>
                  <td className="py-2 text-right">{fmt(Number(quote.travel_fee))}</td>
                </tr>
              )}
              {shippingFee > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Frais de port
                  </td>
                  <td className="py-2 text-right">{fmt(shippingFee)}</td>
                </tr>
              )}
              {wasteTreatmentFee > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Traitement déchets
                  </td>
                  <td className="py-2 text-right">{fmt(wasteTreatmentFee)}</td>
                </tr>
              )}
              {oversizedShippingFee > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Frais de port hors gabarit
                  </td>
                  <td className="py-2 text-right">{fmt(oversizedShippingFee)}</td>
                </tr>
              )}
              {dumpEvacuationFee > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Évacuation déchetterie
                  </td>
                  <td className="py-2 text-right">{fmt(dumpEvacuationFee)}</td>
                </tr>
              )}
              {liftingEquipmentFee > 0 && (
                <tr>
                  <td className="py-2" colSpan={4}>
                    Engin de levage
                  </td>
                  <td className="py-2 text-right">{fmt(liftingEquipmentFee)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          {contractDiscountPct > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Réduction contrat pièces</span>
              <span>{contractDiscountPct.toFixed(2)}%</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Total HT</span>
            <span>{fmt(totalHT)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>TVA {quote.vat_rate}%</span>
            <span>{fmt(vat)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total TTC</span>
            <span>{fmt(totalTTC)}</span>
          </div>
        </div>

        {linkedTickets.length > 0 && (
          <div className="mt-8 rounded-md bg-muted/40 p-4 text-sm print:bg-transparent">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Détail tickets / rapports
            </div>
            <div className="grid gap-3">
              {linkedTickets.map((ticket: any) => (
                <div key={ticket.id} className="rounded border border-border/60 p-2">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <Link
                      to="/ticket/$ticketSlug"
                      params={{ ticketSlug: ticket.ticket_number ?? ticket.id }}
                      className="underline underline-offset-2"
                    >
                      {ticket.ticket_number}
                    </Link>{" "}
                    · {ticket.title} <Badge variant="secondary">{ticket.status}</Badge>
                  </div>
                  {reportsByTicket(ticket.id).map((report: any) => {
                    const faultyPieces = formatReportPieces(report.pieces_defectueuses);
                    const replacementPieces = formatReportPieces(report.pieces_remplacees);
                    return (
                      <div key={report.id} className="mt-1 space-y-1 text-xs text-muted-foreground">
                        <p>Problèmes signalés : {report.constat}</p>
                        {faultyPieces && <p>Types de pièces en défaut : {faultyPieces}</p>}
                        {replacementPieces && <p>Pièces à remplacer : {replacementPieces}</p>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {eventsByTicket.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Historique commun du dossier
                </div>
                {eventsByTicket.slice(0, 8).map((event: any) => (
                  <p key={event.id} className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString("fr-FR")} · {event.title}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {quote.notes && (
          <div className="mt-8 rounded-md bg-muted/40 p-4 text-sm print:bg-transparent">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </div>
            <div className="whitespace-pre-wrap">{quote.notes}</div>
          </div>
        )}

        <div className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground whitespace-pre-wrap">
          {terms}
        </div>
      </div>

      <style>{`@media print { @page { margin: 1.5cm; } body, html { background: white; } }`}</style>
    </div>
  );
}
