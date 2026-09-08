import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useList } from "@/lib/db-hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronsUpDown,
  Circle,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { calculateInstallationQuote } from "@/lib/erp/installation-calculator";
import type { CalculationLog } from "@/lib/erp/types";

export const Route = createFileRoute("/_authenticated/quotes/new")({
  component: NewQuote,
});

// Radix Select interdit la valeur "" pour un item : ce jeton représente
// « aucune sélection » et est reconverti en "" dans les handlers.
const UNSELECTED = "__unselected__";

// Partagé entre l'en-tête et chaque ligne pour que les colonnes restent alignées.
const ITEM_ROW_GRID = "grid gap-2 sm:grid-cols-[1fr_120px_120px_80px_90px_100px_100px_40px]";

interface Item {
  key: string;
  installation_id?: string;
  part_id?: string;
  description: string;
  reference?: string;
  category?: string;
  quantity: number;
  length_meters?: number;
  unit_price: number;
  unit_cost: number;
  save_as_part?: boolean;
  parent_part_id?: string;
  pricing_unit?: string;
  relation_kind?: string;
  is_oversized?: boolean;
  supplier_id?: string;
}

function NewQuote() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: clients = [] } = useList<any>("clients");
  const { data: grandAccounts = [] } = useList<any>("grand_accounts");
  const { data: grandAccountBpuItems = [] } = useList<any>("grand_account_bpu_items", {
    orderBy: "created_at",
    ascending: true,
  });
  const { data: sites = [] } = useList<any>("sites");
  const { data: installs = [] } = useList<any>("installations");
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
  const { data: sp = [] } = useList<any>("supplier_parts");
  const { data: contracts = [] } = useList<any>("contracts");
  const { data: contractKitPrices = [] } = useList<any>("contract_kit_prices");
  const { data: partCategories = [] } = useList<any>("part_categories", {
    orderBy: "name",
    ascending: true,
  });
  const { data: formulas = [] } = useList<any>("calculation_formulas", {
    orderBy: "position",
    ascending: true,
  });
  const { data: rules = [] } = useList<any>("business_rules", {
    orderBy: "priority",
    ascending: true,
  });
  const { data: bomTemplates = [] } = useList<any>("bom_templates");
  const { data: bomItems = [] } = useList<any>("bom_template_items", {
    orderBy: "position",
    ascending: true,
  });
  const { data: partCompatibilities = [] } = useList<any>("part_compatibilities");

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [installationIds, setInstallationIds] = useState<string[]>([]);
  const [targetInstallationId, setTargetInstallationId] = useState("");
  const [contractId, setContractId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
  const [laborHours, setLaborHours] = useState(0);
  const [travelCount, setTravelCount] = useState(1);
  const [laborRate, setLaborRate] = useState(65);
  const [travelFee, setTravelFee] = useState(0);
  const [interventionReason, setInterventionReason] = useState("standard_repair");
  const [isOnCall, setIsOnCall] = useState(false);
  const [shippingFee, setShippingFee] = useState(0);
  const [wasteTreatmentFee, setWasteTreatmentFee] = useState(0);
  const [oversizedShippingFee, setOversizedShippingFee] = useState(0);
  const [dumpEvacuationFee, setDumpEvacuationFee] = useState(0);
  const [liftingEquipmentFee, setLiftingEquipmentFee] = useState(0);
  const [vatRate, setVatRate] = useState(20);
  const [notes, setNotes] = useState("");
  const [calculationLogs, setCalculationLogs] = useState<CalculationLog[]>([]);
  const [busy, setBusy] = useState(false);

  const clientSites = sites.filter((s: any) => s.client_id === clientId);
  const siteInstalls = installs.filter((i: any) => i.site_id === siteId);
  const selectedInstallations = installs.filter((i: any) => installationIds.includes(i.id));
  const installationId = installationIds[0] ?? "";
  const activeInstallationId = targetInstallationId || installationId;
  const installation =
    installs.find((i: any) => i.id === activeInstallationId) ?? selectedInstallations[0];
  const contract = contracts.find((c: any) => c.id === contractId);
  const selectedClient = clients.find((c: any) => c.id === clientId);
  const selectedSite = sites.find((s: any) => s.id === siteId);
  const selectedGrandAccount = grandAccounts.find(
    (account: any) => account.id === selectedClient?.grand_account_id,
  );
  const grandAccountBpuCount = grandAccountBpuItems.filter(
    (item: any) => item.grand_account_id === selectedGrandAccount?.id,
  ).length;
  const contractDiscountPct = Number(contract?.parts_discount_pct ?? 0);
  const contractTypeLabel = contract?.type ? String(contract.type) : contract?.name;
  const contractRepairsIncluded = Boolean(contract?.repairs_included);
  const contractOnCallIncluded = Boolean(contract?.on_call_included);
  const kits = parts.filter((part: any) => part.is_kit && !part.is_obsolete);
  const effectiveLaborRate = Number(laborRate);
  const effectiveTravelCount = Math.max(0, Number(travelCount) || 0);
  const effectiveTravelFee = Number(travelFee);

  const applyContractPricing = (c: any, reason = interventionReason, onCall = isOnCall) => {
    if (!c) return;

    if (reason === "standard_repair" && c.repairs_included) {
      setLaborRate(0);
      setTravelFee(0);
    } else {
      const usesOutOfContractRates = reason === "damage_vandalism" || reason === "new_installation";
      setLaborRate(
        Number(
          (usesOutOfContractRates ? c.out_of_contract_hourly_rate : c.hourly_rate) ??
            c.hourly_rate ??
            65,
        ),
      );
      setTravelFee(
        Number(
          (usesOutOfContractRates ? c.out_of_contract_travel_fee : c.travel_fee) ??
            c.travel_fee ??
            0,
        ),
      );
    }

    if (onCall) {
      if (c.on_call_included) {
        setLaborRate(0);
        setTravelFee(0);
      } else {
        setLaborRate(Number(c.on_call_hourly_rate ?? c.hourly_rate ?? 65));
        setTravelFee(Number(c.on_call_travel_fee ?? c.travel_fee ?? 0));
      }
    }

    setShippingFee(Number(c.shipping_fee ?? 0));
    setWasteTreatmentFee(Number(c.waste_treatment_fee ?? 0));
    setOversizedShippingFee(0);
    setDumpEvacuationFee(Number(c.dump_evacuation_fee ?? 0));
    setLiftingEquipmentFee(Number(c.lifting_equipment_fee ?? 0));
  };

  // Apply contract rates
  const applyContract = (c: any) => {
    setContractId(c?.id ?? "");
    applyContractPricing(c);
  };

  const updateInterventionReason = (reason: string) => {
    setInterventionReason(reason);
    applyContractPricing(contract, reason, isOnCall);
  };

  const updateIsOnCall = (checked: boolean) => {
    setIsOnCall(checked);
    applyContractPricing(contract, interventionReason, checked);
  };

  const hasOversizedPart = items.some((item) => {
    if (item.is_oversized) return true;
    return Boolean(parts.find((part: any) => part.id === item.part_id)?.is_oversized);
  });

  useEffect(() => {
    setOversizedShippingFee(
      hasOversizedPart && contract ? Number(contract.oversized_shipping_fee ?? 0) : 0,
    );
  }, [hasOversizedPart, contract]);

  const presentPartIds = useMemo(
    () =>
      new Set(
        installationParts
          .filter((x: any) => x.installation_id === installationId)
          .map((x: any) => x.part_id),
      ),
    [installationParts, installationId],
  );

  const normalizeName = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const availablePartTypes = useMemo<string[]>(() => {
    const installationModel = models.find((m: any) => m.id === installation?.model_id);
    const effectiveTypeId = installation?.type_id || installationModel?.type_id;
    const installationType = types.find((t: any) => t.id === effectiveTypeId);
    const componentTypes = Array.isArray(installationType?.component_types)
      ? installationType.component_types
      : [];
    const names: string[] = componentTypes.length
      ? componentTypes.map((name: unknown) => String(name))
      : partCategories.map((category: any) => String(category.name));
    return [...new Set(names.filter(Boolean))];
  }, [installation, models, types, partCategories]);

  const compatibleParts = useMemo(() => {
    if (!installation?.model_id && !installation?.type_id) return parts;
    const ids = new Set<string>();
    const installationModel = models.find((m: any) => m.id === installation?.model_id);
    const effectiveTypeId = installation?.type_id || installationModel?.type_id;
    const installationType = types.find((t: any) => t.id === effectiveTypeId);
    const componentTypes = new Set(
      (installationType?.component_types ?? []).map((name: string) => normalizeName(name)),
    );

    if (installation.model_id) {
      modelCompat
        .filter((x: any) => x.model_id === installation.model_id)
        .forEach((x: any) => ids.add(x.part_id));
    }
    if (effectiveTypeId) {
      typeCompat
        .filter((x: any) => x.type_id === effectiveTypeId)
        .forEach((x: any) => ids.add(x.part_id));
    }
    installationParts
      .filter((x: any) => x.installation_id === installation.id)
      .forEach((x: any) => ids.add(x.part_id));

    const selectedTypes = new Set(selectedPartTypes.map((name) => normalizeName(name)));

    return parts
      .filter((p: any) => {
        const matchesSelectedType =
          selectedTypes.size === 0 || (p.category && selectedTypes.has(normalizeName(p.category)));
        const normalizedCategory = normalizeName(p.category);
        const selectedTypeMatchesCategory =
          selectedTypes.size > 0 &&
          Boolean(normalizedCategory) &&
          selectedTypes.has(normalizedCategory);
        const matchesCompatibility =
          ids.has(p.id) ||
          (Boolean(normalizedCategory) && componentTypes.has(normalizedCategory)) ||
          selectedTypeMatchesCategory;
        return matchesSelectedType && matchesCompatibility;
      })
      .sort(
        (a: any, b: any) => Number(presentPartIds.has(b.id)) - Number(presentPartIds.has(a.id)),
      );
  }, [
    parts,
    models,
    types,
    modelCompat,
    typeCompat,
    installationParts,
    installation,
    presentPartIds,
    selectedPartTypes,
  ]);

  const accessorySuggestions = useMemo(() => {
    const selectedTypes = new Set(selectedPartTypes.map((name) => normalizeName(name)));
    const parentIds = new Set(
      installationParts
        .filter((x: any) => installationIds.includes(x.installation_id))
        .filter((x: any) => {
          if (selectedTypes.size === 0) return true;
          const part = parts.find((p: any) => p.id === x.part_id);
          return Boolean(part?.category && selectedTypes.has(normalizeName(part.category)));
        })
        .map((x: any) => x.part_id),
    );

    return partComponents
      .filter((component: any) => parentIds.has(component.parent_part_id))
      .map((component: any) => ({
        ...component,
        parentPart: parts.find((part: any) => part.id === component.parent_part_id),
        accessoryPart: parts.find((part: any) => part.id === component.component_part_id),
      }))
      .filter((component: any) => component.accessoryPart)
      .sort((a: any, b: any) => {
        const aParent = a.parentPart?.name ?? "";
        const bParent = b.parentPart?.name ?? "";
        return (
          aParent.localeCompare(bParent) || a.accessoryPart.name.localeCompare(b.accessoryPart.name)
        );
      });
  }, [installationParts, installationIds, partComponents, parts, selectedPartTypes]);

  const getComponentPrice = (component: any) => {
    if (component.relation_kind === "kit_component") return 0;
    const componentPart = parts.find((part: any) => part.id === component.component_part_id);
    if (component.relation_kind === "negotiated_option") {
      return Number(component.negotiated_price ?? componentPart?.sale_price ?? 0);
    }
    return Number(componentPart?.sale_price ?? 0);
  };

  const addAccessoryToQuote = (component: any) => {
    const sourceInstallationId =
      installationParts.find(
        (x: any) =>
          installationIds.includes(x.installation_id) && x.part_id === component.parent_part_id,
      )?.installation_id ?? installationId;
    const componentPart = parts.find((part: any) => part.id === component.component_part_id);
    const componentPatch: Partial<Item> = {
      parent_part_id: component.parent_part_id,
      quantity: Number(component.quantity) || 1,
    };
    if (component.relation_kind === "negotiated_option") {
      componentPatch.unit_price = Number(
        component.negotiated_price ?? componentPart?.sale_price ?? 0,
      );
    }
    const accessoryItem = buildPartItem(
      component.component_part_id,
      componentPatch,
      sourceInstallationId,
    );
    if (!accessoryItem) return;
    const parentName = parts.find((part: any) => part.id === component.parent_part_id)?.name;
    setItems((prev) => [
      ...prev,
      {
        ...accessoryItem,
        description: parentName
          ? `${parentName} > ${accessoryItem.description} (option)`
          : `${accessoryItem.description} (option)`,
      },
    ]);
  };

  const getItemMargin = (
    item: Pick<Item, "unit_price" | "unit_cost" | "pricing_unit" | "length_meters" | "quantity">,
  ) =>
    (Number(item.unit_price) - Number(item.unit_cost)) *
    (Number(item.quantity) || 0) *
    (item.pricing_unit === "linear_meter" ? Number(item.length_meters || 0) || 1 : 1);

  const getEquivalenceSuggestion = (item: Item) => {
    if (!item.part_id) return null;
    const currentMargin = getItemMargin(item);
    return (
      partEquivalences
        .filter((row: any) => row.source_part_id === item.part_id)
        .map((row: any) => {
          const part = parts.find((candidate: any) => candidate.id === row.equivalent_part_id);
          if (!part) return null;
          const candidate = buildPartItem(
            part.id,
            { quantity: item.quantity },
            item.installation_id ?? installationId,
          );
          if (!candidate) return null;
          const candidateMargin = getItemMargin(candidate);
          return { row, part, item: candidate, marginGain: candidateMargin - currentMargin };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.marginGain - a.marginGain)[0] ?? null
    );
  };

  const applyEquivalenceSuggestion = (key: string, suggestion: any) => {
    update(key, {
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

  const cheapestCost = (partId: string) => {
    const offers = sp.filter((x: any) => x.part_id === partId);
    if (offers.length === 0) return 0;
    return Math.min(...offers.map((o: any) => Number(o.purchase_price)));
  };

  const getActiveReplacement = (partId: string) => {
    const original = parts.find((x: any) => x.id === partId);
    if (!original?.is_obsolete)
      return { original, replacement: original, missingReplacement: false };
    const replacement = parts.find((x: any) => x.id === original.replacement_part_id);
    return { original, replacement, missingReplacement: !replacement };
  };

  const getGrandAccountPrice = (part: any, baseSalePrice: number, purchaseCost: number) => {
    if (!selectedGrandAccount) return null;
    const bpuItem = grandAccountBpuItems.find(
      (row: any) => row.grand_account_id === selectedGrandAccount.id && row.part_id === part.id,
    );
    if (bpuItem) {
      if (bpuItem.pricing_mode === "purchase_coef") {
        return {
          price: purchaseCost * Number(bpuItem.purchase_coef ?? 1),
          label: `BPU grand compte : coef achat × ${Number(bpuItem.purchase_coef ?? 1).toFixed(2)}`,
        };
      }
      if (bpuItem.pricing_mode === "discount") {
        const discountPct = Number(bpuItem.discount_pct ?? 0);
        return {
          price: baseSalePrice * (1 - discountPct / 100),
          label: `BPU grand compte : remise ${discountPct.toFixed(2)}%`,
        };
      }
      return {
        price: Number(bpuItem.manual_sale_price ?? baseSalePrice),
        label: "BPU grand compte : prix manuel",
      };
    }

    const outOfBpuCoef = Number(selectedGrandAccount.out_of_bpu_purchase_coef ?? 0);
    if (outOfBpuCoef > 0 && purchaseCost > 0) {
      return {
        price: purchaseCost * outOfBpuCoef,
        label: `Hors BPU grand compte : coef achat × ${outOfBpuCoef.toFixed(2)}`,
      };
    }

    const outOfBpuDiscountPct = Number(selectedGrandAccount.out_of_bpu_discount_pct ?? 0);
    if (outOfBpuDiscountPct > 0) {
      return {
        price: baseSalePrice * (1 - outOfBpuDiscountPct / 100),
        label: `Hors BPU grand compte : remise ${outOfBpuDiscountPct.toFixed(2)}%`,
      };
    }

    return null;
  };

  const buildPartItem = (
    partId: string,
    patch: Partial<Item> = {},
    sourceInstallationId = installationId,
  ): Item | null => {
    const { original, replacement, missingReplacement } = getActiveReplacement(partId);
    if (missingReplacement) {
      toast.error(
        `La pièce obsolète « ${original?.name ?? "sélectionnée"} » n’a pas de remplacement configuré`,
      );
      return null;
    }
    const p = replacement;
    if (!p) return null;
    const installedPart = installationParts.find(
      (x: any) => x.installation_id === sourceInstallationId && x.part_id === partId,
    );
    const length = Number(installedPart?.length_meters ?? 0);
    const unitPriceOverride = Number(installedPart?.configuration?.unitPriceOverride);
    const useConfiguratorLinearPrice =
      Number.isFinite(unitPriceOverride) && unitPriceOverride > 0 && length > 0;
    const details = [
      p.pricing_unit === "linear_meter" && length > 0 ? `${length} ml` : null,
      installedPart?.dimensions,
      installedPart?.color,
      installedPart?.notes,
    ]
      .filter(Boolean)
      .join(" · ");
    const negotiatedKitPrice =
      p.is_kit && contractId
        ? contractKitPrices.find(
            (row: any) => row.contract_id === contractId && row.kit_part_id === p.id,
          )
        : null;
    const discount = contract?.parts_discount_pct ? Number(contract.parts_discount_pct) / 100 : 0;
    const componentCost = p.is_kit
      ? partComponents
          .filter(
            (component: any) =>
              component.parent_part_id === p.id && component.relation_kind === "kit_component",
          )
          .reduce(
            (sum: number, component: any) =>
              sum + cheapestCost(component.component_part_id) * (Number(component.quantity) || 1),
            0,
          )
      : null;
    const purchaseCost = componentCost ?? cheapestCost(p.id);
    const standardSalePrice = useConfiguratorLinearPrice
      ? unitPriceOverride
      : negotiatedKitPrice
        ? Number(negotiatedKitPrice.negotiated_price)
        : Number(p.sale_price) * (1 - discount);
    const grandAccountPrice = getGrandAccountPrice(p, standardSalePrice, purchaseCost);

    return {
      key: crypto.randomUUID(),
      part_id: p.id,
      installation_id: sourceInstallationId || undefined,
      description: `${details ? `${p.name} — ${details}` : p.name}${original?.is_obsolete && original.id !== p.id ? ` (remplace ${original.name})` : ""}`,
      reference: installedPart?.reference_override || p.reference || "",
      category: installedPart?.component_type || p.category || "",
      quantity: 1,
      length_meters:
        (p.pricing_unit === "linear_meter" || useConfiguratorLinearPrice) && length > 0
          ? length
          : Number(p.length_meters ?? 0) || undefined,
      unit_price: grandAccountPrice?.price ?? standardSalePrice,
      unit_cost: purchaseCost,
      pricing_unit: useConfiguratorLinearPrice ? "linear_meter" : (p.pricing_unit ?? "unit"),
      is_oversized: Boolean(p.is_oversized),
      ...patch,
    };
  };

  const buildComponentItem = (parentItem: Item, component: any, label?: string) => {
    const componentItem = buildPartItem(
      component.component_part_id,
      {
        parent_part_id: parentItem.part_id,
        quantity: Number(component.quantity) || 1,
        unit_price: getComponentPrice(component),
        relation_kind: component.relation_kind ?? "accessory",
      },
      parentItem.installation_id ?? installationId,
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

  const addPart = (partId: string, sourceInstallationId = installationId) => {
    const selectedPart = parts.find((part: any) => part.id === partId);
    const item = buildPartItem(partId, {}, sourceInstallationId);
    if (!item) return;
    if (selectedPart?.is_obsolete && selectedPart.id !== item.part_id) {
      toast.info(`${selectedPart.name} est obsolète : remplacement ajouté au devis`);
    }
    const kitComponents = parts.find((part: any) => part.id === item.part_id)?.is_kit
      ? (partComponents
          .filter(
            (component: any) =>
              component.parent_part_id === item.part_id &&
              component.relation_kind === "kit_component",
          )
          .map((component: any) => buildComponentItem(item, component, "compris dans le kit"))
          .filter(Boolean) as Item[])
      : [];
    setItems((prev) => [...prev, item, ...kitComponents]);
  };

  const addComponentToQuote = (parentItem: Item, component: any) => {
    const componentItem = buildComponentItem(parentItem, component, "option");
    if (!componentItem) return;
    setItems((prev) => [...prev, componentItem]);
  };

  const addAllComponentsToQuote = (parentItem: Item) => {
    const components = partComponents.filter(
      (component: any) => component.parent_part_id === parentItem.part_id,
    );
    setItems((prev) => {
      const additions = components
        .filter(
          (component: any) =>
            !prev.some(
              (item) =>
                item.parent_part_id === parentItem.part_id &&
                item.part_id === component.component_part_id,
            ),
        )
        .map((component: any) => buildComponentItem(parentItem, component))
        .filter(Boolean) as Item[];
      return [...prev, ...additions];
    });
  };

  const getSelectedInstallationType = () => {
    const installationModel = models.find((m: any) => m.id === installation?.model_id);
    const effectiveTypeId = installation?.type_id || installationModel?.type_id;
    return types.find((t: any) => t.id === effectiveTypeId);
  };

  const autoCalculateInstallation = () => {
    if (!installation) return toast.error("Sélectionnez une installation");
    const installationType = getSelectedInstallationType();
    const activeBom = bomTemplates.find(
      (template: any) =>
        template.installation_type_id === installationType?.id && template.is_active !== false,
    );
    const configuredBomItems = activeBom
      ? bomItems.filter((item: any) => item.bom_template_id === activeBom.id)
      : availablePartTypes.map((name, index) => ({ part_family: name, position: index }));
    const activeFormulas = formulas.length
      ? formulas
      : [
          {
            code: "surface_m2",
            name: "Surface",
            target_key: "surfaceM2",
            expression: "widthMm * heightMm / 1000000",
            position: 1,
          },
        ];
    const widthMm = Number(
      installation.width_mm ?? installation.width ?? installation.characteristics?.largeur ?? 0,
    );
    const heightMm = Number(
      installation.height_mm ?? installation.height ?? installation.characteristics?.hauteur ?? 0,
    );
    const result = calculateInstallationQuote({
      input: {
        installationTypeId: installationType?.id,
        installationTypeName: installationType?.name,
        brandId: installation.brand_id,
        modelId: installation.model_id,
        widthMm,
        heightMm,
        isMotorized: Boolean(installation.characteristics?.motorise),
      },
      parts: compatibleParts,
      supplierOffers: sp,
      formulas: activeFormulas,
      rules,
      bomItems: configuredBomItems,
      compatibilities: partCompatibilities,
    });
    setItems((prev) => [
      ...prev,
      ...result.lines.map((line) => ({
        key: crypto.randomUUID(),
        installation_id: installation.id,
        ...line,
      })),
    ]);
    setCalculationLogs((current) => [...current, ...result.logs]);
    setNotes((current) =>
      [current, "Journal des calculs:", ...result.logs.map((log) => `- ${log.message}`)]
        .filter(Boolean)
        .join("\n"),
    );
    toast.success(`${result.lines.length} ligne(s) générée(s) par le moteur`);
  };

  const addPresentParts = () => {
    const existingPartIds = new Set(items.map((item) => item.part_id).filter(Boolean));
    const compatiblePartIds = new Set(compatibleParts.map((part: any) => part.id));
    const ids = installationParts
      .filter((x: any) => installationIds.includes(x.installation_id))
      .filter((x: any) => compatiblePartIds.has(x.part_id) && !existingPartIds.has(x.part_id));

    ids.forEach((x: any) => addPart(x.part_id, x.installation_id));
    if (ids.length === 0) {
      toast.info(
        selectedPartTypes.length > 0
          ? "Aucune pièce présente ne correspond aux types sélectionnés"
          : "Toutes les pièces présentes sont déjà ajoutées",
      );
    }
  };

  const addFree = () =>
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        installation_id: activeInstallationId || undefined,
        description: "",
        reference: "",
        category: selectedPartTypes[0] ?? "",
        quantity: 1,
        unit_price: 0,
        unit_cost: 0,
      },
    ]);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const remove = (key: string) =>
    setItems((prev) => {
      const removed = prev.find((item) => item.key === key);
      return prev.filter(
        (item) =>
          item.key !== key && (!removed?.part_id || item.parent_part_id !== removed.part_id),
      );
    });

  const getItemBillableQuantity = (i: Item) =>
    i.quantity * (i.pricing_unit === "linear_meter" ? Number(i.length_meters || 0) || 1 : 1);
  const partsHT = items.reduce((s, i) => s + i.unit_price * getItemBillableQuantity(i), 0);
  const laborHT = laborHours * effectiveTravelCount * effectiveLaborRate;
  const feesHT =
    effectiveTravelFee +
    shippingFee +
    wasteTreatmentFee +
    oversizedShippingFee +
    dumpEvacuationFee +
    liftingEquipmentFee;
  const totalHT = partsHT + laborHT + feesHT;
  const vat = totalHT * (vatRate / 100);
  const totalTTC = totalHT + vat;
  const costsTotal = items.reduce((s, i) => s + i.unit_cost * getItemBillableQuantity(i), 0);
  const margin = partsHT - costsTotal;
  const marginPct = partsHT > 0 ? (margin / partsHT) * 100 : 0;
  const hasBillableLine = items.length > 0 || laborHours > 0 || feesHT > 0;
  const workflowSteps = [
    { label: "Client", done: Boolean(clientId), hint: selectedClient?.name ?? "À choisir" },
    { label: "Site", done: Boolean(siteId), hint: selectedSite?.name ?? "Optionnel" },
    {
      label: "Installation",
      done: installationIds.length > 0,
      hint: installationIds.length > 0 ? `${installationIds.length} installation(s)` : "Optionnel",
    },
    {
      label: "Chiffrage",
      done: hasBillableLine,
      hint: hasBillableLine ? `${totalHT.toFixed(2)} € HT` : "À compléter",
    },
  ];

  const save = async () => {
    if (!clientId) return toast.error("Sélectionnez un client");
    if (!hasBillableLine)
      return toast.error("Ajoutez une ligne, de la main-d’œuvre ou un déplacement");
    setBusy(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const owner_id = user.user!.id;
      const number = `DEV-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({
          owner_id,
          quote_number: number,
          client_id: clientId,
          site_id: siteId || null,
          installation_id: installationId || null,
          contract_id: contractId || null,
          labor_hours: laborHours,
          travel_count: effectiveTravelCount,
          labor_rate: effectiveLaborRate,
          travel_fee: effectiveTravelFee,
          intervention_reason: interventionReason,
          is_on_call: isOnCall,
          shipping_fee: shippingFee,
          waste_treatment_fee: wasteTreatmentFee,
          oversized_shipping_fee: oversizedShippingFee,
          dump_evacuation_fee: dumpEvacuationFee,
          lifting_equipment_fee: liftingEquipmentFee,
          vat_rate: vatRate,
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      const resolvedItems = await Promise.all(
        items.map(async (i) => {
          if (!i.save_as_part || i.part_id || !i.description.trim()) return i;
          const { data: newPart, error: partError } = await supabase
            .from("parts")
            .insert({
              owner_id,
              name: i.description.trim(),
              reference: i.reference?.trim() || null,
              category: i.category || null,
              sale_price: i.unit_price,
              is_oversized: Boolean(i.is_oversized),
            })
            .select()
            .single();
          if (partError) throw partError;
          if (installation?.model_id) {
            const { error: compatError } = await supabase.from("part_model_compat").insert({
              owner_id,
              part_id: newPart.id,
              model_id: installation.model_id,
            });
            if (compatError) throw compatError;
          }
          return { ...i, part_id: newPart.id };
        }),
      );
      if (installationIds.length > 0) {
        const { error: qiError } = await (
          supabase.from("quote_installations" as any) as any
        ).insert(
          installationIds.map((id, idx) => ({
            owner_id,
            quote_id: quote.id,
            installation_id: id,
            position: idx,
          })),
        );
        if (qiError) throw qiError;
      }
      if (calculationLogs.length > 0) {
        const { error: logError } = await (supabase.from("quote_calculation_logs") as any).insert(
          calculationLogs.map((log) => ({
            owner_id,
            quote_id: quote.id,
            session_key: number,
            step: log.step,
            message: log.message,
            details: (log.details ?? {}) as any,
          })),
        );
        if (logError) throw logError;
      }
      if (resolvedItems.length > 0) {
        const rows = resolvedItems.map((i, idx) => ({
          owner_id,
          quote_id: quote.id,
          part_id: i.part_id ?? null,
          installation_id: i.installation_id ?? null,
          description: i.description,
          quantity: i.quantity,
          length_meters: i.pricing_unit === "linear_meter" ? (i.length_meters ?? null) : null,
          unit_price: i.unit_price,
          unit_cost: i.unit_cost,
          position: idx,
          parent_part_id: i.parent_part_id ?? null,
          relation_kind: i.relation_kind ?? null,
          supplier_id: i.supplier_id ?? null,
        }));
        const { error: e2 } = await (supabase.from("quote_items") as any).insert(rows);
        if (e2) throw e2;
      }
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["part_model_compat"] });
      toast.success("Devis créé");
      navigate({ to: "/quotes/$quoteId", params: { quoteId: quote.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link
        to="/quotes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Devis
      </Link>
      <PageHeader
        title="Nouveau devis"
        description="Suivez le workflow : client → site → installation → pièces"
      />

      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const Icon = step.done ? CheckCircle2 : Circle;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold shadow-sm">
                  {step.done ? (
                    <Icon className="h-4 w-4 text-success" />
                  ) : (
                    <span className="text-muted-foreground">{index + 1}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{step.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{step.hint}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Contexte</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Client *</Label>
                <Select
                  value={clientId || UNSELECTED}
                  onValueChange={(value) => {
                    setClientId(value === UNSELECTED ? "" : value);
                    setSiteId("");
                    setInstallationIds([]);
                    setTargetInstallationId("");
                    setSelectedPartTypes([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSELECTED}>—</SelectItem>
                    {clients.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Site</Label>
                <Select
                  value={siteId || UNSELECTED}
                  onValueChange={(value) => {
                    setSiteId(value === UNSELECTED ? "" : value);
                    setInstallationIds([]);
                    setTargetInstallationId("");
                    setSelectedPartTypes([]);
                  }}
                  disabled={!clientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSELECTED}>—</SelectItem>
                    {clientSites.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Installations</Label>
                <div className="rounded-md border border-input p-2 space-y-1">
                  {siteInstalls.length === 0 ? (
                    <div className="text-sm text-muted-foreground">—</div>
                  ) : (
                    siteInstalls.map((i: any) => {
                      const checked = installationIds.includes(i.id);
                      const inputId = `installation-${i.id}`;
                      return (
                        <Label
                          key={i.id}
                          htmlFor={inputId}
                          className="flex items-center gap-2 text-sm font-normal"
                        >
                          <Checkbox
                            id={inputId}
                            checked={checked}
                            onCheckedChange={() => {
                              setInstallationIds((current) =>
                                checked ? current.filter((id) => id !== i.id) : [...current, i.id],
                              );
                              setTargetInstallationId((current) =>
                                checked && current === i.id ? "" : current || i.id,
                              );
                              setSelectedPartTypes([]);
                              if (!checked && i.contract_id)
                                applyContract(contracts.find((c: any) => c.id === i.contract_id));
                            }}
                            disabled={!siteId}
                          />
                          <span>{i.name}</span>
                        </Label>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <Label>Contrat appliqué</Label>
                <Select
                  value={contractId || UNSELECTED}
                  onValueChange={(value) =>
                    applyContract(contracts.find((c: any) => c.id === value))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSELECTED}>Aucun</SelectItem>
                    {contracts.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                2. Pièces{" "}
                {installation && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (présentes puis compatibles)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {installationIds.length > 1 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <Label>Installation cible pour les pièces ajoutées</Label>
                  <Select
                    value={activeInstallationId}
                    onValueChange={(value) => {
                      setTargetInstallationId(value);
                      setSelectedPartTypes([]);
                    }}
                  >
                    <SelectTrigger className="mt-2 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedInstallations.map((row: any) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name || row.installation_number || "Installation"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Les pièces, kits, accessoires et lignes générées seront rattachés à cette
                    installation du devis multi-installations.
                  </p>
                </div>
              )}

              {availablePartTypes.length > 0 && (
                <div className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Types de pièces à remplacer
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availablePartTypes.map((type, index) => {
                      const checked = selectedPartTypes.includes(type);
                      const inputId = `part-type-${index}`;
                      return (
                        <Label
                          key={type}
                          htmlFor={inputId}
                          className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-normal hover:bg-accent"
                        >
                          <Checkbox
                            id={inputId}
                            checked={checked}
                            onCheckedChange={() =>
                              setSelectedPartTypes((current) =>
                                checked
                                  ? current.filter((name) => name !== type)
                                  : [...current, type],
                              )
                            }
                          />
                          <span>{type}</span>
                        </Label>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Les références proposées ci-dessous sont filtrées par type de pièce et
                    compatibilité avec l’installation sélectionnée.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <PartPicker
                  className="flex-1 min-w-[240px]"
                  placeholder="+ Ajouter une pièce présente / compatible"
                  emptyMessage="Aucune pièce compatible."
                  items={compatibleParts.map((p: any) => {
                    const replacement = p.is_obsolete
                      ? parts.find((part: any) => part.id === p.replacement_part_id)
                      : null;
                    const displayedPart = replacement ?? p;
                    const label = `${presentPartIds.has(p.id) ? "✓ " : ""}${
                      p.is_obsolete && replacement
                        ? `${p.name} (obsolète → ${replacement.name})`
                        : p.is_obsolete
                          ? `${p.name} (obsolète sans remplacement)`
                          : p.name
                    } — ${Number(displayedPart.sale_price).toFixed(2)}€/${
                      displayedPart.pricing_unit === "linear_meter" ? "ml" : "u"
                    }`;
                    return {
                      id: p.id,
                      label,
                      search: `${p.name} ${p.reference ?? ""}`,
                      disabled: p.is_obsolete && !replacement,
                    };
                  })}
                  onSelect={addPart}
                />
                {kits.length > 0 && (
                  <PartPicker
                    className="min-w-[220px]"
                    placeholder="+ Ajouter un kit"
                    emptyMessage="Aucun kit."
                    items={kits.map((kit: any) => {
                      const negotiatedPrice = contractId
                        ? contractKitPrices.find(
                            (row: any) =>
                              row.contract_id === contractId && row.kit_part_id === kit.id,
                          )
                        : null;
                      return {
                        id: kit.id,
                        label: `${kit.name} — ${Number(negotiatedPrice?.negotiated_price ?? kit.sale_price).toFixed(2)}€${negotiatedPrice ? " contrat" : " lot"}`,
                        search: kit.name,
                      };
                    })}
                    onSelect={addPart}
                  />
                )}
                <Button
                  variant="default"
                  onClick={autoCalculateInstallation}
                  disabled={installationIds.length === 0}
                >
                  <Wand2 className="mr-1 h-4 w-4" />
                  Calcul ERP automatique
                </Button>
                <Button
                  variant="outline"
                  onClick={addPresentParts}
                  disabled={installationIds.length === 0 || presentPartIds.size === 0}
                >
                  Ajouter présentes
                </Button>
                <Button variant="ghost" onClick={addFree}>
                  <Plus className="mr-1 h-4 w-4" />
                  Ligne libre
                </Button>
              </div>

              {accessorySuggestions.length > 0 && (
                <div className="rounded-md border border-dashed border-border/70 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5" />
                    Accessoires liés aux pièces présentes
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {accessorySuggestions.map((component: any) => {
                      const alreadyAdded = items.some(
                        (item) =>
                          item.parent_part_id === component.parent_part_id &&
                          item.part_id === component.component_part_id,
                      );
                      return (
                        <Button
                          key={`${component.parent_part_id}-${component.component_part_id}`}
                          type="button"
                          variant={alreadyAdded ? "secondary" : "outline"}
                          size="sm"
                          disabled={alreadyAdded}
                          className="justify-start"
                          onClick={() => addAccessoryToQuote(component)}
                        >
                          {alreadyAdded ? "✓ " : "+ "}
                          {component.parentPart?.name ?? "Pièce liée"} &gt;{" "}
                          {component.accessoryPart.name} · Qté {component.quantity}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ces accessoires proviennent des pièces présentes sur l’installation et du type
                    de pièce sélectionné (ex. système de détection).
                  </p>
                </div>
              )}

              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Commencez par sélectionner une installation, cochez les types de pièces à
                  remplacer pour afficher les références compatibles, ou créez une ligne libre.
                </div>
              )}
              {items.length > 0 && (
                <div
                  className={cn(
                    ITEM_ROW_GRID,
                    "hidden px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid",
                  )}
                >
                  <span>Description</span>
                  <span>Référence</span>
                  <span>Type</span>
                  <span>Qté</span>
                  <span>Long. ml</span>
                  <span>PU HT</span>
                  <span>Coût</span>
                  <span aria-hidden="true" />
                </div>
              )}
              {items.map((i) => {
                const equivalenceSuggestion = getEquivalenceSuggestion(i);
                const hasBetterEquivalence = Number(equivalenceSuggestion?.marginGain ?? 0) > 0.01;
                return (
                  <div
                    key={i.key}
                    className={`rounded-md border p-3 ${
                      hasBetterEquivalence
                        ? "border-green-500/60 bg-green-50/70"
                        : "border-border/60"
                    }`}
                  >
                    <div className={cn(ITEM_ROW_GRID, "sm:items-center")}>
                      <Input
                        value={i.description}
                        onChange={(e) => update(i.key, { description: e.target.value })}
                        placeholder="Description"
                      />
                      <Input
                        value={i.reference ?? ""}
                        onChange={(e) => update(i.key, { reference: e.target.value })}
                        placeholder="Référence"
                        disabled={Boolean(i.part_id)}
                      />
                      <Select
                        value={i.category || UNSELECTED}
                        onValueChange={(value) =>
                          update(i.key, { category: value === UNSELECTED ? "" : value })
                        }
                        disabled={Boolean(i.part_id)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSELECTED}>Type</SelectItem>
                          {partCategories.map((category: any) => (
                            <SelectItem key={category.id} value={category.name}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        value={i.quantity}
                        onChange={(e) => update(i.key, { quantity: Number(e.target.value) })}
                        placeholder={i.pricing_unit === "linear_meter" ? "ml" : "Qté"}
                        title={i.pricing_unit === "linear_meter" ? "Mètres linéaires" : "Quantité"}
                      />
                      {i.pricing_unit === "linear_meter" ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={i.length_meters ?? ""}
                          onChange={(e) => update(i.key, { length_meters: Number(e.target.value) })}
                          placeholder="Long. ml"
                          title="Longueur unitaire en mètres linéaires"
                        />
                      ) : (
                        <div aria-hidden="true" />
                      )}
                      <Input
                        type="number"
                        step="0.01"
                        value={i.unit_price}
                        onChange={(e) => update(i.key, { unit_price: Number(e.target.value) })}
                        placeholder="PU HT"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={i.unit_cost}
                        onChange={(e) => update(i.key, { unit_cost: Number(e.target.value) })}
                        placeholder="Coût"
                        title="Coût réel"
                      />
                      <Button variant="ghost" size="icon" onClick={() => remove(i.key)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {partComponents.some(
                      (component: any) => component.parent_part_id === i.part_id,
                    ) && (
                      <div className="mt-3 rounded-md border border-dashed border-border/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <Boxes className="h-3.5 w-3.5" />
                            Composition comprise et options
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addAllComponentsToQuote(i)}
                          >
                            Ajouter toutes
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {partComponents
                            .filter((component: any) => component.parent_part_id === i.part_id)
                            .map((component: any) => {
                              const componentPart = parts.find(
                                (part: any) => part.id === component.component_part_id,
                              );
                              const alreadyAdded = items.some(
                                (item) =>
                                  item.parent_part_id === i.part_id &&
                                  item.part_id === component.component_part_id,
                              );
                              return (
                                <Button
                                  key={component.component_part_id}
                                  type="button"
                                  variant={alreadyAdded ? "secondary" : "outline"}
                                  size="sm"
                                  disabled={alreadyAdded}
                                  className="justify-start"
                                  onClick={() => addComponentToQuote(i, component)}
                                >
                                  {alreadyAdded ? "✓ " : "+ "}
                                  {componentPart?.name ?? "Pièce inconnue"} · Qté{" "}
                                  {component.quantity}
                                </Button>
                              );
                            })}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Les pièces de composition du kit sont ajoutées à 0 €. Les options restent
                          proposées au tarif optionnel.
                        </p>
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
                          onClick={() => applyEquivalenceSuggestion(i.key, equivalenceSuggestion)}
                        >
                          Remplacer
                        </Button>
                      </div>
                    )}
                    {!i.part_id && installation?.model_id && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                          id={`save-as-part-${i.key}`}
                          checked={Boolean(i.save_as_part)}
                          onCheckedChange={(checked) =>
                            update(i.key, { save_as_part: checked === true })
                          }
                        />
                        <Label
                          htmlFor={`save-as-part-${i.key}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          Enregistrer cette nouvelle pièce et la rendre compatible avec ce modèle de
                          porte
                        </Label>
                      </div>
                    )}
                    {!i.part_id && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                          id={`is-oversized-${i.key}`}
                          checked={Boolean(i.is_oversized)}
                          onCheckedChange={(checked) =>
                            update(i.key, { is_oversized: checked === true })
                          }
                        />
                        <Label
                          htmlFor={`is-oversized-${i.key}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          Pièce hors gabarit
                        </Label>
                      </div>
                    )}
                    {selectedGrandAccount && i.part_id && (
                      <div className="mt-2 text-xs text-emerald-700">
                        Tarif grand compte prioritaire appliqué si la pièce est au BPU ou si une
                        condition hors BPU est configurée.
                      </div>
                    )}
                    {contractDiscountPct > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {i.part_id && parts.find((part: any) => part.id === i.part_id)?.is_kit
                          ? "Tarif kit appliqué"
                          : `Réduction contrat appliquée : ${contractDiscountPct.toFixed(2)}%`}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Main-d'œuvre & déplacement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Intervention
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label>Heures</Label>
                    <Input
                      type="number"
                      step="0.25"
                      value={laborHours}
                      onChange={(e) => setLaborHours(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Nombre de déplacements</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={travelCount}
                      onChange={(e) => setTravelCount(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Tarif €/h/technicien</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={laborRate}
                      onChange={(e) => setLaborRate(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Déplacement €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={travelFee}
                      onChange={(e) => setTravelFee(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>TVA %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={vatRate}
                      onChange={(e) => setVatRate(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/60" />

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Frais additionnels
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label>Frais de port €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shippingFee}
                      onChange={(e) => setShippingFee(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Traitement déchets €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={wasteTreatmentFee}
                      onChange={(e) => setWasteTreatmentFee(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Frais de port hors gabarit €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={oversizedShippingFee}
                      onChange={(e) => setOversizedShippingFee(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Évacuation déchetterie €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={dumpEvacuationFee}
                      onChange={(e) => setDumpEvacuationFee(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Engin de levage €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={liftingEquipmentFee}
                      onChange={(e) => setLiftingEquipmentFee(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Récapitulatif</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {contractTypeLabel && (
                <div className="mb-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                  Type de contrat :{" "}
                  <span className="font-medium text-foreground">{contractTypeLabel}</span>
                </div>
              )}
              {selectedGrandAccount && (
                <div className="mb-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                  Grand compte : <span className="font-medium">{selectedGrandAccount.name}</span> ·{" "}
                  {grandAccountBpuCount} pièce(s) BPU
                  {Number(selectedGrandAccount.out_of_bpu_purchase_coef ?? 0) > 0
                    ? ` · hors BPU coef × ${Number(selectedGrandAccount.out_of_bpu_purchase_coef).toFixed(2)}`
                    : Number(selectedGrandAccount.out_of_bpu_discount_pct ?? 0) > 0
                      ? ` · hors BPU remise ${Number(selectedGrandAccount.out_of_bpu_discount_pct).toFixed(2)}%`
                      : ""}
                </div>
              )}
              {contractDiscountPct > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Réduction contrat pièces</span>
                  <span>{contractDiscountPct.toFixed(2)}%</span>
                </div>
              )}
              <Row label="Pièces HT" value={partsHT} />
              <Row
                label={`Main-d'œuvre (${laborHours} h/technicien × ${effectiveTravelCount} déplacement${effectiveTravelCount > 1 ? "s" : ""})`}
                value={laborHT}
              />
              <Row label="Déplacement" value={travelFee} />
              <Row label="Frais de port" value={shippingFee} />
              <Row label="Traitement déchets" value={wasteTreatmentFee} />
              <Row label="Frais de port hors gabarit" value={oversizedShippingFee} />
              <Row label="Évacuation déchetterie" value={dumpEvacuationFee} />
              <Row label="Engin de levage" value={liftingEquipmentFee} />
              <div className="my-2 border-t border-border/60" />
              <Row label="Total HT" value={totalHT} strong />
              <Row label={`TVA ${vatRate}%`} value={vat} />
              <Row label="Total TTC" value={totalTTC} strong />
              <div className="my-2 border-t border-border/60" />
              <div className="rounded-md bg-muted/60 p-2">
                <Row label="Coût pièces" value={costsTotal} muted />
                <Row label="Marge" value={margin} muted />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>% de marge</span>
                  <span
                    className={
                      marginPct >= 30
                        ? "text-success"
                        : marginPct >= 15
                          ? "text-warning"
                          : "text-destructive"
                    }
                  >
                    {marginPct.toFixed(1)}%
                  </span>
                </div>
              </div>
              {!clientId && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Sélectionnez au minimum un client pour créer le devis.
                </p>
              )}
              {clientId && !hasBillableLine && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Ajoutez une ligne, de la main-d’œuvre ou un déplacement pour finaliser.
                </p>
              )}
              <Button
                onClick={save}
                disabled={busy || !clientId || !hasBillableLine}
                className="mt-3 w-full"
              >
                {busy ? "Enregistrement..." : "Créer le devis"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "font-semibold" : ""} ${muted ? "text-xs text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span>{value.toFixed(2)} €</span>
    </div>
  );
}

type PickerItem = { id: string; label: string; search: string; disabled?: boolean };

function PartPicker({
  items,
  onSelect,
  placeholder,
  emptyMessage = "Aucun résultat.",
  disabled,
  className,
}: {
  items: PickerItem[];
  onSelect: (id: string) => void;
  placeholder: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || items.length === 0}
          className={cn("justify-between font-normal text-muted-foreground", className)}
        >
          <span className="truncate">{placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher par nom ou référence..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.id} ${item.search}`}
                  disabled={item.disabled}
                  onSelect={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
