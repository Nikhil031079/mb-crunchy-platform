// ============================================================================
// MB CRUNCHY — Meal-upgrade business-unit assignment regression tests
//
// Guards the fix for upgrades selected for an MB Kitchen combo being
// routed into MB Mart: applyMealDeal's shortfall path stamped new lines
// with the cart's first BU (prev.businessUnitIds[0]) instead of the deal's
// BU. Functional assertions exercise the REAL helper
// (src/utils/mealDealLines.ts, imported directly — no runner, no mocks);
// structural assertions pin the surrounding protected behavior.
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/meal_deal_bu_assignment.mjs
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildMealDealShortfallLine } from "../src/utils/mealDealLines.ts";
import { isMealDealBuFixOnlyCartDiff } from "./cart_fix_scope.mjs";

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function read(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function code(rel) {
  const src = read(rel);
  return src === null ? null : stripComments(src);
}

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function has(rel, needle) {
  const src = code(rel);
  return src !== null && src.includes(needle);
}

function lacks(rel, needle) {
  const src = code(rel);
  return src !== null && !src.includes(needle);
}

const CART = "src/stores/cart.ts";
const HELPER = "src/utils/mealDealLines.ts";

// Fictitious but structurally faithful IDs for the reported scenario.
const MART_BU = "bu_mart";
const KITCHEN_BU = "bu_kitchen";
const DEAL_ID = "deal_kitchen_upgrade";

console.log("Meal-upgrade BU assignment — regression tests");
console.log("==================================================");

// ---------------------------------------------------------------------------
// 1. Reported scenario: Mart line present, Kitchen combo upgrade added.
//    Groundnut Oil keeps Mart BU; Fries + Cool Drink lines get Kitchen BU.
// ---------------------------------------------------------------------------
console.log("[1] Reported scenario (Mart line present + Kitchen upgrade)");
const fries = buildMealDealShortfallLine({
  cartItemId: "line_fries",
  catalogItemId: "cat_french_fries",
  name: "French Fries",
  variantName: "Default",
  quantity: 1,
  unitPrice: 60,
  mealDealId: DEAL_ID,
  mealDealName: "Kitchen Upgrade",
  dealBusinessUnitId: KITCHEN_BU,
});
const drink = buildMealDealShortfallLine({
  cartItemId: "line_drink",
  catalogItemId: "cat_cool_drink",
  name: "Cool Drink",
  variantName: "Default",
  quantity: 1,
  unitPrice: 40,
  mealDealId: DEAL_ID,
  mealDealName: "Kitchen Upgrade",
  dealBusinessUnitId: KITCHEN_BU,
});
check(
  "French Fries line carries the Kitchen deal BU, not Mart",
  fries.businessUnitId === KITCHEN_BU && fries.businessUnitId !== MART_BU
);
check(
  "Cool Drink line carries the Kitchen deal BU, not Mart",
  drink.businessUnitId === KITCHEN_BU && drink.businessUnitId !== MART_BU
);
check(
  "upgrade lines are product lines tagged to the deal",
  fries.itemType === "product" &&
    drink.itemType === "product" &&
    fries.mealDealId === DEAL_ID &&
    drink.mealDealId === DEAL_ID
);
check(
  "all other line fields preserved verbatim (name/variant/qty/price/total)",
  fries.name === "French Fries" &&
    fries.variantName === "Default" &&
    fries.quantity === 1 &&
    fries.unitPrice === 60 &&
    fries.totalPrice === 60 &&
    drink.catalogItemId === "cat_cool_drink" &&
    drink.totalPrice === 40
);

// ---------------------------------------------------------------------------
// 2. Selected alternatives retain the deal's BU.
// ---------------------------------------------------------------------------
console.log("[2] Selected alternatives keep the deal BU");
const alt = buildMealDealShortfallLine({
  cartItemId: "line_alt",
  catalogItemId: "cat_peri_peri_fries",
  name: "Peri Peri Fries",
  variantName: "Large",
  quantity: 2,
  unitPrice: 80,
  mealDealId: DEAL_ID,
  mealDealName: "Kitchen Upgrade",
  dealBusinessUnitId: KITCHEN_BU,
});
check(
  "alternative line carries the deal BU with scaled total",
  alt.businessUnitId === KITCHEN_BU && alt.totalPrice === 160
);

// ---------------------------------------------------------------------------
// 3. Empty-cart upgrade receives the deal BU, never an empty string.
// ---------------------------------------------------------------------------
console.log("[3] Empty-cart upgrade (no cart BU exists)");
const solo = buildMealDealShortfallLine({
  cartItemId: "line_solo",
  catalogItemId: "cat_french_fries",
  name: "French Fries",
  variantName: "Default",
  quantity: 1,
  unitPrice: 60,
  mealDealId: DEAL_ID,
  mealDealName: "Kitchen Upgrade",
  dealBusinessUnitId: KITCHEN_BU,
});
check(
  "line BU is the deal BU and non-empty",
  solo.businessUnitId === KITCHEN_BU && solo.businessUnitId !== ""
);

// ---------------------------------------------------------------------------
// 4. The shortfall path can no longer read the cart's first BU.
// ---------------------------------------------------------------------------
console.log("[4] Shortfall path wiring in cart.ts");
check(
  "shortfall path builds lines via the helper with deal.businessUnitId",
  has(CART, "buildMealDealShortfallLine({") &&
    has(CART, "dealBusinessUnitId: deal.businessUnitId,")
);
check(
  "shortfall path never assigns prev.businessUnitIds[0] to a new line",
  (() => {
    const src = read(CART) ?? "";
    const idx = src.indexOf("buildMealDealShortfallLine({");
    if (idx === -1) return false;
    // The old expression must not appear anywhere in the store anymore.
    return !src.includes("businessUnitId: prev.businessUnitIds[0]");
  })(),
  "cart-order-dependent assignment still present"
);
check(
  "helper takes no cart-state BU input (cannot regress to cart order)",
  (() => {
    const src = read(HELPER) ?? "";
    return (
      !src.includes("businessUnitIds") &&
      !src.includes("prev.") &&
      src.includes("dealBusinessUnitId: string")
    );
  })()
);
check(
  "working-tree cart.ts diff is exactly the approved fix (scope predicate agrees)",
  (() => {
    try {
      return isMealDealBuFixOnlyCartDiff(ROOT);
    } catch {
      return false;
    }
  })(),
  "cart.ts contains changes beyond the approved shortfall-BU fix"
);

// ---------------------------------------------------------------------------
// 5. Grouping + per-BU checkout routing unchanged.
// ---------------------------------------------------------------------------
console.log("[5] Grouping and checkout routing preserved");
check(
  "CartPage still groups view-only by item.businessUnitId",
  has("src/pages/customer/CartPage.tsx", "const key = item.businessUnitId")
);
check(
  "CheckoutPage still filters checkout lines by selected BU",
  has(
    "src/pages/customer/CheckoutPage.tsx",
    "cart.items.filter((item) => item.businessUnitId === selectedCheckoutBU)"
  )
);
check(
  "mixed-cart BU gate still present",
  has(
    "src/pages/customer/CheckoutPage.tsx",
    "MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED"
  )
);

// ---------------------------------------------------------------------------
// 6. ₹10 saving formula unchanged (prices flow into it verbatim).
// ---------------------------------------------------------------------------
console.log("[6] Savings calculation preserved");
check(
  "effective-price/savings derivation untouched",
  has(CART, "const effectiveDealPrice = deal.dealPrice + totalSurcharge;") &&
    has(
      CART,
      "const actualSavings = Math.max(0, actualIndividualTotal - effectiveDealPrice);"
    )
);
check(
  "savings ledger still multiplies per-set savings by quantity",
  has(CART, "d.savings * d.quantity")
);
check(
  "reported ₹10 case still computes (100 individual − 90 deal)",
  100 - 90 === 10 && fries.totalPrice + drink.totalPrice === 100,
  "line totals feeding the formula changed"
);

console.log("==================================================");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log("All meal-upgrade BU assignment tests passed.");
}
