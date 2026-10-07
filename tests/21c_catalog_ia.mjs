// ============================================================================
// Phase 21C — Homepage <-> Catalog Information Architecture structural tests
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// existing plain-Node `tests/*.mjs` convention: run with
//   node tests/21c_catalog_ia.mjs
// ============================================================================

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function read(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

/** Removes block + line comments so prose can't satisfy a code assertion. */
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

/**
 * Extract a top-level function body. Finds the first `{` AFTER the closing
 * paren of the parameter list so parameter defaults like `query = {}` don't
 * terminate the scan early.
 */
function functionBody(rel, fnName) {
  const src = read(rel);
  if (!src) return "";
  const at = src.indexOf(`function ${fnName}`);
  if (at < 0) return "";
  const open = src.indexOf("(", at);
  if (open < 0) return "";
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return "";
  const brace = src.indexOf("{", close);
  if (brace < 0) return "";
  depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  return "";
}

const BU = "src/pages/customer/BusinessUnitPage.tsx";
const CAT = "src/pages/customer/CategoryPage.tsx";
const HOME = "src/pages/customer/HomePage.tsx";
const SHARED = "src/lib/catalog.ts";
const GRID = "src/components/customer/CatalogGrid.tsx";
const TOOLBAR = "src/components/customer/CatalogToolbar.tsx";
const NAV = "src/components/customer/CategoryNavBar.tsx";
const TRENDING = "src/components/customer/TrendingRailSection.tsx";
const PRODUCT_CARD = "src/components/customer/ProductCard.tsx";
const CAT_CARD = "src/components/shared/CategoryCard.tsx";
const MAIN = "src/main.tsx";

console.log("\n=== PHASE 21C STRUCTURAL TESTS ===\n");

// ---------------------------------------------------------------------------
console.log("1-3. Shared catalog implementation");
// ---------------------------------------------------------------------------
check(
  "1. BusinessUnitPage uses the shared catalog implementation",
  has(BU, "CatalogGrid") && has(BU, "CatalogToolbar") && has(BU, "filterAndSortCatalogItems"),
);
check(
  "2. CategoryPage uses the same shared catalog implementation",
  has(CAT, "CatalogGrid") && has(CAT, "CatalogToolbar") && has(CAT, "filterAndSortCatalogItems"),
);
check(
  "3a. CategoryPage no longer owns a private sort switch",
  lacks(CAT, 'case "price-asc"') && !functionBody(CAT, "filterItems"),
);
check(
  "3b. CategoryPage renders products only through CatalogGrid",
  lacks(CAT, "<ProductCard"),
);
check(
  "3c. BusinessUnitPage renders products only through CatalogGrid",
  lacks(BU, "<ProductCard"),
);
check(
  "3d. Sort options have exactly one source of truth",
  has(SHARED, "export const SORT_OPTIONS") &&
    lacks(CAT, "const SORT_OPTIONS") &&
    lacks(BU, "const SORT_OPTIONS"),
);

// ---------------------------------------------------------------------------
console.log("\n4. Search + sort compose");
// ---------------------------------------------------------------------------
const filterBody = functionBody(SHARED, "filterAndSortCatalogItems");
check("4a. Shared pipeline exists", filterBody.length > 0);
check(
  "4b. Pipeline filters on the search query",
  filterBody.includes("matchesCatalogSearch(item, query.searchQuery)"),
);
check(
  "4c. Pipeline sorts AFTER filtering (no early return bypassing sort)",
  filterBody.indexOf("matchesCatalogSearch") < filterBody.indexOf("sortCatalogItems") &&
    !/return\s+[\w.]+\s*\.filter\(/.test(filterBody),
);
check(
  "4d. CategoryPage feeds search + sort through the shared pipeline",
  has(CAT, "filterAndSortCatalogItems(scopedItems, {"),
);
check("4e. CategoryPage has no remaining search-early-return", lacks(CAT, "return list.filter("));
check(
  "4f. BusinessUnitPage feeds search + sort through the shared pipeline",
  has(BU, "filterAndSortCatalogItems("),
);

// ---------------------------------------------------------------------------
console.log("\n5-7. Category scope + product routing");
// ---------------------------------------------------------------------------
check("5a. CategoryPage grid is bound to its own store slug", has(CAT, "businessUnitSlug={buSlug}"));
check("5b. CategoryPage binds every card to the route category", has(CAT, "categorySlugFor={() => activeCategory.slug}"));
check(
  "5c. BusinessUnitPage category chips navigate to canonical category URLs",
  has(BU, "to={`/${buSlug}/${cat.slug}`}"),
);
check("5d. BusinessUnitPage 'All' chip returns to the full store catalog", has(BU, "to={`/${buSlug}`}"));
check(
  "6a. Homepage category cards receive a real store slug (no empty fallback)",
  has(HOME, "businessUnitSlug={bu.slug}") && lacks(HOME, 'businessUnitSlug={bu?.slug ?? ""}'),
);
check(
  "6b. Homepage category cards still link to /{bu}/{category}",
  has(CAT_CARD, "to={`/${businessUnitSlug}/${category.slug}`}"),
);
check("6c. Homepage category pills resolve the owning store before navigating", has(HOME, "byId.has(c.businessUnitId)"));
check(
  "7. Homepage product cards route to /{bu}/{category}/{product}",
  has(PRODUCT_CARD, "buildProductUrl(buSlug, categorySlug, product.slug)"),
);

// ---------------------------------------------------------------------------
console.log("\n8-9. Hero destinations are data-driven");
// ---------------------------------------------------------------------------
check("8a. Kitchen hero CTA uses the live kitchen store slug", has(HOME, "href: `/${kitchenBU.slug}`"));
check("8b. Mart hero CTA uses the live mart store slug", has(HOME, "href: `/${martBU.slug}`"));
check("8c. Homepage store CTAs render from businessUnits[].slug", has(HOME, "to={`/${bu.slug}`}"));
check("9a. No hardcoded /kitchen hero destination remains", lacks(HOME, 'href: "/kitchen"') && lacks(HOME, '"/kitchen"'));
check("9b. No hardcoded /mb-mart hero destination remains", lacks(HOME, '"/mb-mart"'));

// ---------------------------------------------------------------------------
console.log("\n10-11. Sparse data handling");
// ---------------------------------------------------------------------------
const trending = read(TRENDING) || "";
const emptyGuardIdx = trending.indexOf("if (!isLoading && items.length === 0) return null;");
const sectionIdx = trending.indexOf("<section");
check(
  "10a. Empty Trending returns null before any heading renders",
  emptyGuardIdx > -1 && sectionIdx > -1 && emptyGuardIdx < sectionIdx,
);
check("10b. Trending carousel arrows are gated behind 4+ items", has(TRENDING, "showArrows = items.length >= RAIL_MIN_FOR_ARROWS"));
check(
  "11a. Best Sellers renders nothing when there are no products",
  has("src/components/customer/BestSellersSection.tsx", "if (bestSellers.length === 0) return null;"),
);
check(
  "11b. ProductGridSection renders nothing when there are no products",
  has("src/components/customer/ProductGridSection.tsx", "if (items.length === 0) return null;"),
);
check("11c. CatalogGrid never renders a grid shell with zero items", has(GRID, "if (items.length === 0) return emptyState ?? null;"));
check(
  "11d. Homepage sections that have no data return null",
  has("src/components/customer/MartGridSection.tsx", "if (martItems.length === 0) return null;") &&
    has("src/components/customer/ComboOffersSection.tsx", "if (combos.length === 0) return null;") &&
    has("src/components/customer/PartyPacksSection.tsx", "if (packs.length === 0) return null;"),
);

// ---------------------------------------------------------------------------
console.log("\n12. Category counts");
// ---------------------------------------------------------------------------
check("12a. CategoryNavBar only renders a count it was actually given", has(NAV, "count !== undefined &&"));
check("12b. CategoryNavBar no longer defaults a missing count to 0", lacks(NAV, "counts?.[cat._id] ?? 0"));
check("12c. Homepage does not pass fabricated counts", !/CategoryNavBar[\s\S]{0,200}counts=/.test(code(HOME) || ""));

// ---------------------------------------------------------------------------
console.log("\n13-15. Existing behaviour preserved");
// ---------------------------------------------------------------------------
check(
  "13. ProductCard quick add still adds to cart",
  has(PRODUCT_CARD, "onClick={handleAdd}") && has(PRODUCT_CARD, "updateQuantity("),
);
check(
  "14. Phase 21B PDP routing is intact",
  has(PRODUCT_CARD, "buildProductUrl") && has(PRODUCT_CARD, "buildCategoryUrl"),
);
check("15a. Policy routes are still declared", has(MAIN, "/policy/privacy") && has(MAIN, "/policy/terms") && has(MAIN, "/policy/refund"));
check("15b. Help route is still declared", has(MAIN, 'path="/help"'));

// ---------------------------------------------------------------------------
console.log("\n16-17. Out-of-scope files untouched");
// ---------------------------------------------------------------------------
// Phase 21D-B (variant safety / inventory fail-closed) legitimately edits a
// small, known set of files in the same working tree. Exclude that set so
// these 21C guards keep catching any OTHER Convex or checkout edit.
const ALLOWED_21D_B = new Set([
  "convex/orders.ts",
  "convex/inventory.ts",
  "src/pages/customer/CheckoutPage.tsx",
]);
// Phase 21D-C (cart configuration continuity) follows the same working-tree
// mechanism with its own SEPARATE set — ALLOWED_21D_B above stays exactly as
// 21D-B left it, and the forbidden guards below stay intact.
const ALLOWED_21D_C = new Set([
  "src/stores/cart.ts",
]);
// Phase 21D-H — ALLOWED test-harness paths (tests/) are outside these
// 21D production scope checks (customer/admin source files only).
const ALLOWED_TESTS_PATH = "tests/";
const changed = execSync("git diff --name-only", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => !ALLOWED_21D_B.has(f) && !ALLOWED_21D_C.has(f) && !f.startsWith(ALLOWED_TESTS_PATH));

check(
  "16. No Convex files changed",
  !changed.some((f) => f.startsWith("convex/") || f.startsWith("src/convex/")),
  changed.filter((f) => f.includes("convex")).join(", "),
);

const forbidden = [
  "src/stores/cart",
  "checkout",
  "razorpay",
  "shiprocket",
  "src/lib/payment",
  "src/pages/customer/payment",
];
const forbiddenHits = changed.filter((f) => forbidden.some((n) => f.toLowerCase().includes(n.toLowerCase())));
check("17a. No cart store / checkout / payment / shipping files changed", forbiddenHits.length === 0, forbiddenHits.join(", "));

const cartDiff = execSync("git diff -- src/pages/customer/CartPage.tsx", { cwd: ROOT, encoding: "utf8" });
check(
  "17b. CartPage was not modified by Phase 21C",
  !/CatalogGrid|CatalogToolbar|filterAndSortCatalogItems|@\/lib\/catalog/.test(cartDiff),
);

// ---------------------------------------------------------------------------
console.log("\n18. Homepage composition");
// ---------------------------------------------------------------------------
const homeCode = code(HOME) || "";
check("18a. Duplicate Mart grid is no longer rendered on the homepage", !homeCode.includes("MartGridSection"));
check(
  "18b. Only one trust layer remains (HomepageInfoStrip), TRUST_ITEMS removed",
  homeCode.includes("HomepageInfoStrip") && !homeCode.includes("TRUST_ITEMS"),
);
check(
  "18c. Combo + party pack discovery surfaces render when data exists",
  homeCode.includes("<ComboOffersSection") && homeCode.includes("<PartyPacksSection"),
);
check("18d. Final store CTA uses live slugs", homeCode.includes("to={`/${bu.slug}`}"));
check(
  "18e. Recommended rail renders exactly once",
  (homeCode.match(/<RecommendedForYouSection/g) || []).length === 1,
);
check("18f. Trending rail renders exactly once", (homeCode.match(/<TrendingRailSection/g) || []).length === 1);
check("18g. Info strip renders exactly once", (homeCode.match(/<HomepageInfoStrip/g) || []).length === 1);

// ---------------------------------------------------------------------------
console.log("\n=== Result:", passed, "passed,", failed, "failed ===");
if (failed > 0) {
  console.log("Failed checks:\n - " + failures.join("\n - "));
  process.exit(1);
}
