// ============================================================================
// MB CRUNCHY — shared scope predicates for the meal-upgrade fixes.
//
// (1) isMealDealBuFixOnlyCartDiff(): the approved shortfall-BU fix touches
// src/stores/cart.ts in exactly one place (deal BU instead of cart-first
// BU, via buildMealDealShortfallLine). Suites pinning cart.ts as
// "unmodified" use it so the approved, diff-bounded change passes while
// ANY other cart.ts modification still fails. Clean tree passes unchanged.
//
// (2) isMealDealDiscoveryFixOnlyDiff(root, baseRef = "HEAD"): the approved
// mixed-cart discovery fix evaluates detection per distinct cart BU (pure
// helpers in mealDealMatching.ts, multi-BU hook input, CartPage rewiring).
// Suites pinning use-meal-deals.ts / CartPage.tsx as "unmodified" use it so
// the approved, marker-and-token-bounded change passes while ANY pricing,
// savings, persistence, grouping, routing, variant-editing, checkout,
// payment, shipping, inventory, loyalty, or coupon edit still fails.
// baseRef selects the diff base: "HEAD" for in-flight working-tree review;
// a stable baseline commit for guards spanning committed history (so the
// same approved change passes both before AND after it is committed).
// All seven required-added and all three required-removed markers must
// appear across the combined per-file diffs (they span both files, so the
// check is aggregate, not per-file).
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

function diffLinesForFile(root, file, baseRef = "HEAD") {
  let out;
  try {
    out = execSync(`git diff -U0 ${baseRef} -- "${file}"`, {
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

function cartFixDiffLines(root) {
  return diffLinesForFile(root, CART_PATH);
}

/**
 * True when the diffs of the mixed-cart discovery fix files (against
 * baseRef, default HEAD) contain only the approved change: per-BU match
 * evaluation extracted to a pure module, the hook delegating to it over a
 * multi-BU input list, and CartPage feeding every distinct cart BU. Any
 * pricing, savings, persistence, grouping, routing, variant-editing,
 * checkout, payment, shipping, inventory, loyalty, or coupon token in any
 * added line fails. All seven required-added markers and all three
 * required-removed markers must appear across the combined per-file diffs
 * (the marker set spans both files, so the check is aggregate). Clean tree
 * (no diff) returns false — callers OR this with their untouched-file
 * condition.
 */
const DISCOVERY_FILES = [
  "src/hooks/use-meal-deals.ts",
  "src/pages/customer/CartPage.tsx",
];

const DISCOVERY_REQUIRED_ADDED = [
  "evaluateMealDealMatchesForBu({",
  "combineMealDealMatches(perBu)",
  "dealsByBusinessUnit",
  "MealDealsByBusinessUnit",
  "export type { CartMealDealMatch }",
  "dealsByBuForDetection",
  "cartBuIds.map(",
];

const DISCOVERY_REQUIRED_REMOVED = [
  "const deals = useMealDeals(businessUnitId);",
  "Filter cart items to the target business unit for isolation.",
  "primaryBusinessUnitId,",
];

const DISCOVERY_FORBIDDEN_IN_ADDED = [
  "dealPrice",
  "savings",
  "totalDiscount",
  "updateQuantity",
  "updateVariant",
  "merge",
  "localStorage",
  "reconcile",
  "discount",
  "deliveryFee",
  "computeTotal",
  "groupedItems",
  "checkoutItems",
  "selectedCheckoutBU",
  "resolveMartDelivery",
  "shipping",
  "inventory",
  "coupon",
  "loyalty",
  "removeMealDeal",
  "allocateExistingMealDeal",
  "applyMealDeal",
  "setActiveDeals",
  "useMealDeals(",
  "getActiveForCustomer",
  "openRazorpayCheckout",
  "createOrder",
  "CartVariantEditor",
  "editingCartItemId",
  "resolveCurrentLinePrice",
  "STALE_PRICE_THRESHOLD",
  "effectiveDealPrice",
  "mealDealSavings",
  "calculateSubtotal",
  "subtotal",
  "persist",
];

export function isMealDealDiscoveryFixOnlyDiff(root, baseRef = "HEAD") {
  let sawFix = false;
  const combinedAdded = [];
  const combinedRemoved = [];
  for (const file of DISCOVERY_FILES) {
    const d = diffLinesForFile(root, file, baseRef);
    if (!d) return false;
    if (d.added.length === 0 && d.removed.length === 0) continue;
    sawFix = true;
    if (DISCOVERY_FORBIDDEN_IN_ADDED.some((t) =>
      d.added.some((line) => line.includes(t)),
    )) {
      return false;
    }
    combinedAdded.push(...d.added);
    combinedRemoved.push(...d.removed);
  }
  if (!sawFix) return false;
  const addedText = combinedAdded.join("\n");
  const removedText = combinedRemoved.join("\n");
  return (
    DISCOVERY_REQUIRED_ADDED.every((m) => addedText.includes(m)) &&
    DISCOVERY_REQUIRED_REMOVED.every((m) => removedText.includes(m))
  );
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
