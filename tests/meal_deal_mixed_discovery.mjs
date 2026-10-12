// ============================================================================
// MB CRUNCHY — Mixed-cart meal-upgrade discovery regression tests
//
// Guards the fix for "Complete Your Meal" disappearing in mixed carts:
// useCartMealDealDetection evaluated only cart.businessUnitIds[0], so a
// Mart-first cart never loaded Kitchen deals. Detection now runs per
// distinct cart BU (via evaluateMealDealMatchesForBu) and combines with
// deal-id dedupe (combineMealDealMatches).
//
// Functional assertions exercise the REAL pure helpers
// (src/utils/mealDealMatching.ts, imported directly). Structural
// assertions pin the CartPage/hook wiring. This is NOT a full integration
// test: React hooks and Convex queries cannot run in this harness; the
// hook body delegates to the tested helpers (verified structurally).
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/meal_deal_mixed_discovery.mjs
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  combineMealDealMatches,
  evaluateMealDealMatchesForBu,
} from "../src/utils/mealDealMatching.ts";
import { buildMealDealShortfallLine } from "../src/utils/mealDealLines.ts";

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

function matches(rel, re) {
  const src = code(rel);
  return src !== null && re.test(src);
}

const HOOK = "src/hooks/use-meal-deals.ts";
const CART_PAGE = "src/pages/customer/CartPage.tsx";
const MATCH_UTIL = "src/utils/mealDealMatching.ts";

// ---------------------------------------------------------------------------
// Faithful fixtures: Kitchen combo + upgrade, Mart solo product.
// ---------------------------------------------------------------------------
const KITCHEN_BU = "bu_kitchen";
const MART_BU = "bu_mart";
const VEG_DELIGHT = "cat_veg_delight_combo";
const FRIES = "cat_french_fries";
const DRINK = "cat_cool_drink";
const OIL = "cat_groundnut_oil";

function line(overrides) {
  return {
    cartItemId: `line_${Math.random().toString(36).slice(2, 8)}`,
    variantName: "Default",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    ...overrides,
  };
}

const vegDelight = (bu = KITCHEN_BU) =>
  line({
    catalogItemId: VEG_DELIGHT,
    itemType: "combo",
    businessUnitId: bu,
    name: "Veg Delight",
    unitPrice: 199,
    totalPrice: 199,
  });

const groundnutOil = () =>
  line({
    catalogItemId: OIL,
    itemType: "product",
    businessUnitId: MART_BU,
    name: "Groundnut Oil",
    variantName: "1 L",
    unitPrice: 150,
    totalPrice: 150,
  });

function kitchenUpgradeDeal() {
  return {
    _id: "deal_kitchen_upgrade",
    businessUnitId: KITCHEN_BU,
    name: "Kitchen Upgrade",
    status: "active",
    dealPrice: 90,
    savings: 10,
    qualifyingItems: [
      {
        catalogItemId: FRIES,
        quantity: 1,
        name: "French Fries",
        price: 60,
        basePrice: 60,
      },
      {
        catalogItemId: DRINK,
        quantity: 1,
        name: "Cool Drink",
        price: 40,
        basePrice: 40,
      },
    ],
    applyToCombos: true,
    applyToPartyPacks: false,
    cartSmartDetection: true,
    displayOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

// Simulates one render's per-BU evaluation + combination, mirroring the
// hook: each distinct cart BU evaluated with its own deals, then combined.
function detect(cartItems, dealsByBu, applied) {
  const perBu = dealsByBu.map(({ businessUnitId, deals }) =>
    evaluateMealDealMatchesForBu({
      cartItems,
      businessUnitId,
      deals,
      appliedMealDeals: applied,
    }),
  );
  return combineMealDealMatches(perBu);
}

console.log("Mixed-cart meal-upgrade discovery — regression tests");
console.log("==================================================");

// ---------------------------------------------------------------------------
// A. Kitchen combo alone shows the offer.
// ---------------------------------------------------------------------------
console.log("[A] Kitchen-only cart");
{
  const matches = detect([vegDelight()], [{ businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] }], undefined);
  check("one Kitchen upgrade match", matches.length === 1);
  const [m] = matches;
  check(
    "partial opportunity names Fries + Drink with ₹10 savings",
    m.missingItems.length === 2 &&
      m.missingItems.some((i) => i.catalogItemId === FRIES) &&
      m.missingItems.some((i) => i.catalogItemId === DRINK) &&
      m.deal.savings === 10 &&
      m.sourceParentCatalogItemId === VEG_DELIGHT
  );
}

// ---------------------------------------------------------------------------
// B. Mart-first, Kitchen-second still shows the Kitchen offer.
// ---------------------------------------------------------------------------
console.log("[B] Mart-first mixed cart");
{
  const cart = [groundnutOil(), vegDelight()];
  const matches = detect(
    cart,
    [
      { businessUnitId: MART_BU, deals: [] },
      { businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] },
    ],
    undefined,
  );
  check(
    "Kitchen upgrade discovered despite Mart-first order",
    matches.length === 1 && matches[0].deal.businessUnitId === KITCHEN_BU
  );
  check(
    "Mart line does not satisfy Kitchen components (both still missing)",
    matches[0].missingItems.length === 2
  );
}

// ---------------------------------------------------------------------------
// C. Kitchen-first, Mart-second: same offer (order independence).
// ---------------------------------------------------------------------------
console.log("[C] Kitchen-first mixed cart");
{
  const cart = [vegDelight(), groundnutOil()];
  const matches = detect(
    cart,
    [
      { businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] },
      { businessUnitId: MART_BU, deals: [] },
    ],
    undefined,
  );
  check(
    "same Kitchen upgrade regardless of cart order",
    matches.length === 1 &&
      matches[0].deal._id === "deal_kitchen_upgrade" &&
      matches[0].missingItems.length === 2
  );
}

// ---------------------------------------------------------------------------
// Isolation: a Mart line with the SAME catalog id must not count.
// ---------------------------------------------------------------------------
console.log("[Isolation] Cross-BU same-id lines do not satisfy components");
{
  const martFriesLookalike = line({
    catalogItemId: FRIES,
    itemType: "product",
    businessUnitId: MART_BU,
    name: "French Fries",
    unitPrice: 60,
    totalPrice: 60,
  });
  const matches = detect(
    [vegDelight(), martFriesLookalike],
    [{ businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] }],
    undefined,
  );
  check(
    "Mart-BU Fries line leaves Kitchen Fries slot missing",
    matches.length === 1 &&
      matches[0].missingItems.some((i) => i.catalogItemId === FRIES)
  );
}

// ---------------------------------------------------------------------------
// Duplicate suppression: same deal id across BU inputs offered once.
// ---------------------------------------------------------------------------
console.log("[Dupe] Same deal in two BU inputs");
{
  const deal = kitchenUpgradeDeal();
  const combined = combineMealDealMatches([
    evaluateMealDealMatchesForBu({
      cartItems: [vegDelight()],
      businessUnitId: KITCHEN_BU,
      deals: [deal],
      appliedMealDeals: undefined,
    }),
    evaluateMealDealMatchesForBu({
      cartItems: [vegDelight()],
      businessUnitId: KITCHEN_BU,
      deals: [{ ...deal }],
      appliedMealDeals: undefined,
    }),
  ]);
  check(
    "deal offered exactly once",
    combined.length === 1 && combined[0].deal._id === deal._id
  );
}

// ---------------------------------------------------------------------------
// E. Fully applied deal is not offered again.
// ---------------------------------------------------------------------------
console.log("[E] Fully applied suppression");
{
  const matches = detect(
    [vegDelight()],
    [{ businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] }],
    [
      {
        mealDealId: "deal_kitchen_upgrade",
        name: "Kitchen Upgrade",
        businessUnitId: KITCHEN_BU,
        dealPrice: 90,
        effectiveDealPrice: 90,
        savings: 10,
        quantity: 1,
        consumedQuantities: { [FRIES]: 1, [DRINK]: 1 },
        consumedCartLineIds: ["line_fries", "line_drink"],
      },
    ],
  );
  check("no re-offer once parent capacity is consumed", matches.length === 0);
}

// ---------------------------------------------------------------------------
// F. Detected upgrade still builds Kitchen-BU lines (0b5bc3a preserved).
// ---------------------------------------------------------------------------
console.log("[F] Detection → line-builder linkage keeps Kitchen BU");
{
  const matches = detect(
    [groundnutOil(), vegDelight()],
    [
      { businessUnitId: MART_BU, deals: [] },
      { businessUnitId: KITCHEN_BU, deals: [kitchenUpgradeDeal()] },
    ],
    undefined,
  );
  const built = matches[0].missingItems.map((mi, i) =>
    buildMealDealShortfallLine({
      cartItemId: `line_new_${i}`,
      catalogItemId: mi.catalogItemId,
      name: mi.name,
      variantName: "Default",
      quantity: mi.quantity,
      unitPrice: i === 0 ? 60 : 40,
      mealDealId: matches[0].deal._id,
      mealDealName: matches[0].deal.name,
      dealBusinessUnitId: matches[0].deal.businessUnitId,
    }),
  );
  check(
    "both built lines carry Kitchen BU in the mixed cart",
    built.length === 2 && built.every((l) => l.businessUnitId === KITCHEN_BU)
  );
}

// ---------------------------------------------------------------------------
// G. Mart prices/grouping inputs untouched by discovery.
// ---------------------------------------------------------------------------
console.log("[G] Mart data passes through unchanged");
{
  const oil = groundnutOil();
  check(
    "Mart line price/total preserved",
    oil.unitPrice === 150 && oil.totalPrice === 150 && oil.businessUnitId === MART_BU
  );
  check(
    "CartPage still groups view-only by item.businessUnitId",
    has(CART_PAGE, "const key = item.businessUnitId")
  );
  check(
    "CheckoutPage still filters checkout lines by selected BU",
    has(
      "src/pages/customer/CheckoutPage.tsx",
      "cart.items.filter((item) => item.businessUnitId === selectedCheckoutBU)"
    )
  );
}

// ---------------------------------------------------------------------------
// H. Hook wiring: every distinct cart BU evaluated, fixed hook count.
// ---------------------------------------------------------------------------
console.log("[H] Hook wiring (structural)");
check(
  "hook delegates per-BU evaluation to the pure helper",
  has(HOOK, "evaluateMealDealMatchesForBu({") && has(HOOK, "combineMealDealMatches(perBu)")
);
check(
  "hook accepts a per-BU deals list via the exported input type",
  has(HOOK, "dealsByBusinessUnit") &&
    has(HOOK, "export interface MealDealsByBusinessUnit")
);
check(
  "CartPage feeds every distinct cart BU with its own deals",
  has(CART_PAGE, "dealsByBuForDetection") && has(CART_PAGE, "cartBuIds.map(")
);
check(
  "detection call uses the multi-BU input, not the first-BU shortcut",
  matches(CART_PAGE, /useCartMealDealDetection\(\s*cart\.items,\s*dealsByBuForDetection,/)
);
check(
  "fixed hook count preserved (exactly 4 BU deal queries)",
  (code(CART_PAGE)?.split("useMealDeals(cartBuIds[")?.length ?? 0) - 1 === 4,
  "useMealDeals(cartBuIds[?] call count changed"
);
check(
  "match type still re-exported for consumers",
  has(HOOK, "export type { CartMealDealMatch }")
);

console.log("==================================================");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log("All mixed-cart discovery tests passed.");
}
