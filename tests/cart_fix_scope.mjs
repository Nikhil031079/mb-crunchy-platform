// ============================================================================
// MB CRUNCHY — shared scope predicate for the meal-upgrade BU fix.
//
// The approved fix touches src/stores/cart.ts in exactly one place
// (applyMealDeal shortfall path: deal BU instead of cart-first BU, via the
// buildMealDealShortfallLine helper). Suites that pin cart.ts as
// "unmodified" use isMealDealBuFixOnlyCartDiff() so the approved,
// diff-bounded change passes while ANY other cart.ts modification —
// pricing, merge/variant semantics, persistence, reconciliation — still
// fails. Clean tree (no cart.ts diff) passes unchanged.
//
// Plain-Node convention (no test runner installed).
// ============================================================================

import { execSync } from "node:child_process";

const CART_PATH = "src/stores/cart.ts";

// Exact added lines introduced by the approved fix (diff +/- stripped).
const ALLOWED_ADDED = new Set([
  `import { buildMealDealShortfallLine } from "@/utils/mealDealLines";`,
  `          // The line's BU is the deal's BU (server-validated same-BU for`,
  `          // all components) — never the cart's first BU, which misroutes`,
  `          // Kitchen-combo upgrades into Mart whenever a Mart line exists.`,
  `            newItems.push(`,
  `              buildMealDealShortfallLine({`,
  `                cartItemId: dealCartItemId,`,
  `                catalogItemId: selectedCatalogItemId,`,
  `                name: selectedProductName,`,
  `                variantName: selectedVariant,`,
  `                quantity: remaining,`,
  `                unitPrice: variantUnitPrice,`,
  `                mealDealId: deal._id,`,
  `                mealDealName: deal.name,`,
  `                dealBusinessUnitId: deal.businessUnitId,`,
  `              }),`,
  `            );`,
]);

// Exact removed lines deleted by the approved fix (diff +/- stripped).
const ALLOWED_REMOVED = new Set([
  `            newItems.push({`,
  `              cartItemId: dealCartItemId,`,
  `              catalogItemId: selectedCatalogItemId,`,
  `              itemType: "product",`,
  `              businessUnitId: prev.businessUnitIds[0] ?? "",`,
  `              name: selectedProductName,`,
  `              variantName: selectedVariant,`,
  `              quantity: remaining,`,
  `              unitPrice: variantUnitPrice,`,
  `              totalPrice: variantUnitPrice * remaining,`,
  `              mealDealId: deal._id,`,
  `              mealDealName: deal.name,`,
  `            });`,
]);

// Tokens that must not appear in ANY added/removed cart.ts line: pricing,
// merge/variant semantics, persistence, reconciliation, deal lifecycle.
const FORBIDDEN_TOKENS = [
  "updateQuantity",
  "reconcile",
  "merge",
  "computeMealDealSavings",
  "effectiveDealPrice",
  "actualSavings",
  "mealDealSavings",
  "calculateSubtotal",
  "computeTotal",
  "discount",
  "deliveryFee",
  "localStorage",
  "setActiveDeals",
  "allocateExistingMealDeal",
  "removeMealDeal",
  "CART_STORAGE_KEY",
  "isParentAllowed",
  "verifyCatalogItemIds",
  "appliedMealDeals",
  "consumedQuantities",
];

function cartFixDiffLines(root) {
  let out;
  try {
    out = execSync(`git diff -U0 HEAD -- "${CART_PATH}"`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const added = [];
  const removed = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
    else if (line.startsWith("-") && !line.startsWith("---")) removed.push(line.slice(1));
  }
  return { added, removed };
}

/**
 * True when src/stores/cart.ts is untouched, or its working-tree diff is
 * exactly the approved meal-upgrade BU fix and nothing else.
 */
export function isMealDealBuFixOnlyCartDiff(root) {
  const d = cartFixDiffLines(root);
  if (!d) return false;
  if (d.added.length === 0 && d.removed.length === 0) return true;
  const all = [...d.added, ...d.removed];
  if (all.some((l) => FORBIDDEN_TOKENS.some((t) => l.includes(t)))) return false;
  if (!d.added.some((l) => l.includes("dealBusinessUnitId: deal.businessUnitId,"))) {
    return false;
  }
  if (!d.removed.some((l) => l.includes("businessUnitId: prev.businessUnitIds[0]"))) {
    return false;
  }
  return (
    d.added.every((l) => ALLOWED_ADDED.has(l)) &&
    d.removed.every((l) => ALLOWED_REMOVED.has(l))
  );
}
