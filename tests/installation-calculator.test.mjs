import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInstallationQuote } from "../src/lib/erp/installation-calculator.ts";

const input = { widthMm: 1000, heightMm: 2000, isMotorized: false };
const bomItems = [{ part_family: "poignee", position: 1, quantity: 1 }];

function run(parts, supplierOffers = []) {
  return calculateInstallationQuote({
    input,
    parts,
    supplierOffers,
    formulas: [],
    rules: [],
    bomItems,
  });
}

test("picks the compatible part with the best margin instead of the alphabetically first one", () => {
  const parts = [
    { id: "part-a", name: "AAA poignee bas de gamme", category: "poignee", sale_price: 10, purchase_price: 8 },
    { id: "part-b", name: "ZZZ poignee rentable", category: "poignee", sale_price: 15, purchase_price: 5 },
  ];
  const result = run(parts);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].part_id, "part-b");
  assert.equal(result.lines[0].unit_cost, 5);
  assert.match(result.logs.at(-1).message, /best_supplier_margin/);
});

test("accounts for supplier offers, not just list purchase price, when comparing candidates", () => {
  const parts = [
    { id: "part-a", name: "AAA poignee", category: "poignee", sale_price: 10, purchase_price: 8 },
    { id: "part-b", name: "ZZZ poignee", category: "poignee", sale_price: 10, purchase_price: 20 },
  ];
  const supplierOffers = [
    { id: "offer-1", supplier_id: "sup-1", part_id: "part-b", purchase_price: 3, shipping_cost: 1 },
  ];
  const result = run(parts, supplierOffers);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].part_id, "part-b");
  assert.equal(result.lines[0].unit_cost, 4);
  assert.equal(result.lines[0].supplier_id, "sup-1");
});

test("logs a clear message and adds no line when no compatible part matches the family", () => {
  const result = run([{ id: "part-a", name: "AAA autre chose", category: "autre", sale_price: 10, purchase_price: 8 }]);
  assert.equal(result.lines.length, 0);
  assert.ok(result.logs.some((log) => log.message.includes("Aucune pièce trouvée pour la famille poignee")));
});
