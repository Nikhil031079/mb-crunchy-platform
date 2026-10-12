// ============================================================================
// MB CRUNCHY — shared scope predicates for the meal-upgrade fixes.
//
// (1) isMealDealBuFixOnlyCartDiff(): the approved shortfall-BU fix touches
// src/stores/cart.ts in exactly one place (deal BU instead of cart-first
// BU, via buildMealDealShortfallLine). Suites pinning cart.ts as
// "unmodified" use it so the approved, diff-bounded change passes while
// ANY other cart.ts modification still fails. Clean tree passes unchanged.
//
// (2) isMealDealDiscoveryFixOnlyDiff(): the approved mixed-cart discovery
// fix evaluates detection per distinct cart BU (pure helpers in
// mealDealMatching.ts, multi-BU hook input, CartPage rewiring). Suites
// pinning use-meal-deals.ts / CartPage.tsx as "unmodified" use it so the
// approved, marker-and-token-bounded change passes while ANY pricing,
// savings, persistence, grouping, routing, variant-editing, checkout,
// payment, shipping, inventory, loyalty, or coupon edit still fails.
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

function diffLinesForFile(root, file) {
  let out;
  try {
    out = execSync(`git diff -U0 HEAD -- "${file}"`, {
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
 * True when the working-tree diffs of the mixed-cart discovery fix files
 * contain only the approved change: per-BU match evaluation extracted to a
 * pure module, the hook delegating to it over a multi-BU input list, and
 * CartPage feeding every distinct cart BU. Any pricing, savings,
 * persistence, grouping, routing, variant-editing, checkout, payment,
 * shipping, inventory, loyalty, or coupon token in added lines fails.
 * Clean tree (no diff) returns false — callers OR this with their
 * untouched-file condition.
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

export function isMealDealDiscoveryFixOnlyDiff(root) {
  let sawFix = false;
  for (const file of DISCOVERY_FILES) {
    const d = diffLinesForFile(root, file);
    if (!d) return false;
    if (d.added.length === 0 && d.removed.length === 0) continue;
    sawFix = true;
    const addedText = d.added.join("\n");
    const removedText = d.removed.join("\n");
    if (
      DISCOVERY_FORBIDDEN_IN_ADDED.some((t) => addedText.includes(t)) ||
      !DISCOVERY_REQUIRED_ADDED.some((m) => addedText.includes(m)) ||
      !DISCOVERY_REQUIRED_REMOVED.some((m) => removedText.includes(m))
    ) {
      return false;
    }
  }
  return sawFix;
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
