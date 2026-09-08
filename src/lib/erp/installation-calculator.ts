import { filterCompatibleParts } from "./compatibility-engine";
import { calculateCoulisse } from "./coulisse-calculator";
import { runFormulas } from "./formula-engine";
import { runRules } from "./rule-engine";
import { selectBestSupplier } from "./supplier-optimizer";
import type {
  BomItem,
  BusinessRule,
  ErpPart,
  FormulaDefinition,
  InstallationCalculationInput,
  InstallationCalculationResult,
  PartCompatibility,
  SupplierOffer,
} from "./types";

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function evaluateCandidate(part: ErpPart, offers: SupplierOffer[]) {
  const supplier = selectBestSupplier(part, offers);
  const cost = supplier?.totalCost ?? (Number(part.purchase_price) || 0);
  const margin = (Number(part.sale_price) || 0) - cost;
  return { part, supplier, cost, margin };
}

// Implémente la stratégie "best_supplier_margin" (valeur par défaut de
// bom_template_items.selection_strategy) : parmi les pièces compatibles
// d'une même famille, retient celle qui dégage la meilleure marge une fois
// sourcée chez son meilleur fournisseur, plutôt que la première par ordre
// alphabétique.
function selectBestCandidate(candidates: ErpPart[], offers: SupplierOffer[]) {
  return candidates
    .map((part) => evaluateCandidate(part, offers))
    .sort(
      (a, b) => b.margin - a.margin || a.cost - b.cost || a.part.name.localeCompare(b.part.name),
    )[0];
}

export function calculateInstallationQuote(args: {
  input: InstallationCalculationInput;
  parts: ErpPart[];
  supplierOffers: SupplierOffer[];
  formulas: FormulaDefinition[];
  rules: BusinessRule[];
  bomItems: BomItem[];
  compatibilities?: PartCompatibility[];
}): InstallationCalculationResult {
  const base = {
    widthMm: Number(args.input.widthMm) || 0,
    heightMm: Number(args.input.heightMm) || 0,
    isMotorized: args.input.isMotorized ? 1 : 0,
  };
  const formulaResult = runFormulas(args.formulas, base);
  const ruleResult = runRules(args.rules, { ...args.input, ...formulaResult.metrics });
  const logs = [...formulaResult.logs, ...ruleResult.logs];
  const forcedFamilies: BomItem[] = ruleResult.actions
    .filter((action) => action.type === "add_part_family" && action.part_family)
    .map((action) => ({
      part_family: String(action.part_family),
      quantity: Number(action.quantity ?? 1),
    }));
  const families: BomItem[] = [...args.bomItems, ...forcedFamilies].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  const compatibleParts = filterCompatibleParts(args.parts, args.compatibilities ?? [], args.input);
  const formulaByCode = new Map(args.formulas.map((formula) => [formula.code, formula]));
  const lines = families.flatMap((item) => {
    if (normalize(item.part_family) === "coulisse") {
      const result = calculateCoulisse({
        input: args.input,
        parts: compatibleParts,
        supplierOffers: args.supplierOffers,
        metrics: formulaResult.metrics,
      });
      logs.push(...result.logs);
      return result.line ? [result.line] : [];
    }
    const candidates = compatibleParts.filter(
      (part) => normalize(part.category) === normalize(item.part_family),
    );
    if (candidates.length === 0) {
      logs.push({
        step: "bom",
        message: `Aucune pièce trouvée pour la famille ${item.part_family}`,
      });
      return [];
    }
    const strategy = String(item.selection_strategy ?? "best_supplier_margin");
    const { part: selected, supplier, cost, margin } = selectBestCandidate(
      candidates,
      args.supplierOffers,
    );
    const quantityFormula = item.quantity_formula_code
      ? formulaByCode.get(item.quantity_formula_code)
      : null;
    const formulaQuantity = quantityFormula
      ? formulaResult.metrics[quantityFormula.target_key]
      : null;
    const rawQuantity = formulaQuantity ?? item.quantity ?? 1;
    const rounding = String(item.constraints?.quantity_rounding ?? "ceil");
    const quantity =
      rounding === "none" ? Number(rawQuantity) || 1 : Math.ceil(Number(rawQuantity) || 1);
    logs.push({
      step: "supplier",
      message: `${selected.name} sélectionné pour ${item.part_family} (${strategy}, marge ${margin.toFixed(2)} € sur ${candidates.length} pièce(s) compatible(s))`,
      details: {
        supplier_id: supplier?.supplier_id,
        quantity,
        quantity_formula_code: item.quantity_formula_code,
        candidates_considered: candidates.length,
        margin,
      },
    });
    return [
      {
        part_id: selected.id,
        description: selected.name,
        reference: selected.reference ?? "",
        category: selected.category ?? item.part_family,
        quantity,
        unit_price: Number(selected.sale_price) || 0,
        unit_cost: cost,
        supplier_id: supplier?.supplier_id,
      },
    ];
  });
  return { metrics: formulaResult.metrics, lines, logs };
}
