// ============================================================================
// Phase 21C-FIX — card quantity identity + scoped category page structural tests
//
// Covers the two production-confirmed defects fixed in Phase 21C-FIX:
//   1. ProductCard quantity — canonical default-variant identity (must match
//      the exact line quick-add writes) and the stale-closure dependency fix.
//   2. CategoryPage — single-category scoped catalog instead of the
//      all-category section browser, with canonical URL navigation.
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/21c_fix_category_quantity.mjs
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

function count(rel, needle) {
  const src = code(rel);
  if (src === null) return -1;
  return src.split(needle).length - 1;
}

/** Working-tree diff lines for a path ("" when untouched). */
function diffOf(rel) {
  try {
    return execSync(`git diff -- "${rel}"`, { cwd: ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

const CARD = "src/components/customer/ProductCard.tsx";
const GRID = "src/components/customer/CatalogGrid.tsx";
const HOOK = "src/hooks/use-default-variant-names.ts";
const CAT = "src/pages/customer/CategoryPage.tsx";
const BU = "src/pages/customer/BusinessUnitPage.tsx";
const BEST = "src/components/customer/BestSellersSection.tsx";
const BU_SECTIONS = "src/components/customer/BusinessUnitSections.tsx";
const CROSS = "src/components/customer/CrossSellSections.tsx";
const PGS = "src/components/customer/ProductGridSection.tsx";
const CART = "src/pages/customer/CartPage.tsx";
const STORE = "src/stores/cart.ts";
const COMBO = "src/components/customer/ComboCard.tsx";
const PACK = "src/components/customer/PartyPackCard.tsx";

console.log("\n=== PHASE 21C-FIX STRUCTURAL TESTS ===\n");

// ---------------------------------------------------------------------------
console.log("1. Canonical default-variant identity (ProductCard)");
// ---------------------------------------------------------------------------
check(
  "1a. Card resolves inline variants first, then the threaded canonical name",
  has(CARD, "inlineDefaultVariantName ?? defaultVariantName ?? \"Default\""),
);
check(
  "1b. Cart lookup matches quick-add's line: catalogItemId + canonical variant",
  has(CARD, "item.catalogItemId === product._id && item.variantName === cartVariantName"),
);
check(
  "1c. Canonical rule still comes from the shared 21D-B helper (no position lookups)",
  has(CARD, "getDefaultActiveVariant") &&
    has(CARD, '@/utils/product-variants') &&
    lacks(CARD, "variants![0].optionValue"),
);
check(
  "1d. New defaultVariantName prop is declared on ProductCardProps",
  has(CARD, "defaultVariantName?: string"),
);
check(
  "1e. Increment handler depends on cartItem (stale-closure fix)",
  /handleIncrement[\s\S]*?\},\s*\[updateQuantity,\s*cartItem\]\)/.test(code(CARD) || ""),
);
check(
  "1f. Decrement handler depends on cartItem (stale-closure fix)",
  /handleDecrement[\s\S]*?\},\s*\[updateQuantity,\s*cartItem\]\)/.test(code(CARD) || ""),
);
check(
  "1g. Both handlers close over cartItem (exactly 2 dependency entries)",
  count(CARD, "[updateQuantity, cartItem]") === 2,
  `${count(CARD, "[updateQuantity, cartItem]")} found`,
);

// ---------------------------------------------------------------------------
console.log("2. Shared resolver hook (use-default-variant-names)");
// ---------------------------------------------------------------------------
check("2a. Hook file exists and exports the resolver", has(HOOK, "export function useDefaultVariantNames("));
check(
  "2b. Canonical name exported and derived via getDefaultActiveVariant",
  has(HOOK, "export function canonicalDefaultVariantName(") &&
    has(HOOK, "getDefaultActiveVariant(variants)?.optionValue ?? \"Default\""),
);
check(
  "2c. Resolves through the products table (same source as quick-add)",
  has(HOOK, "api.products.getByIds") && has(HOOK, '"skip"'),
);
check(
  "2d. Non-product items (combo / partyPack sourceIds) are excluded",
  has(HOOK, "(item.itemType ?? \"product\") !== \"product\""),
);
check(
  "2e. Inline-variant items are skipped (card resolves those locally)",
  has(HOOK, "item.variants && item.variants.length > 0"),
);
check(
  "2f. Query ids are sorted for value-stable arguments",
  has(HOOK, "return Array.from(ids).sort()"),
);

// ---------------------------------------------------------------------------
console.log("3. CatalogGrid threads identity to every card");
// ---------------------------------------------------------------------------
check("3a. CatalogGrid accepts the products fallback prop", has(GRID, "products?: readonly Pick<Product, \"_id\" | \"variants\">[]"));
check(
  "3b. Hook is called before any early return (stable hook order)",
  (() => {
    const src = code(GRID) || "";
    const hookAt = src.indexOf("useDefaultVariantNames(");
    const earlyAt = src.indexOf("if (loading)");
    return hookAt > 0 && earlyAt > hookAt;
  })(),
);
check(
  "3c. Each ProductCard receives its sourceId's canonical name",
  has(GRID, "defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}"),
);
check(
  "3d. Hook receives the caller's products (no extra query when seeded)",
  has(GRID, "useDefaultVariantNames(items, products)"),
);

// ---------------------------------------------------------------------------
console.log("4. Call sites seed the resolver with loaded products");
// ---------------------------------------------------------------------------
check("4a. BusinessUnitPage passes allProducts to BOTH grid mounts", count(BU, "products={allProducts}") === 2, `${count(BU, "products={allProducts}")} found`);
check("4b. CategoryPage passes allProducts to its grid", has(CAT, "products={allProducts}"));
check("4c. BestSellersSection resolves + threads identity", has(BEST, "useDefaultVariantNames(bestSellers)") && has(BEST, "defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}"));
check("4d. BusinessUnitSections resolves + threads identity", has(BU_SECTIONS, "useDefaultVariantNames(featuredProducts)") && has(BU_SECTIONS, "defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}"));
check("4e. CrossSellSections resolves + threads identity", has(CROSS, "useDefaultVariantNames(mayAlsoLike)") && has(CROSS, "defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}"));
check("4f. ProductGridSection resolves + threads identity", has(PGS, "useDefaultVariantNames(items)") && has(PGS, "defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}"));
check("4g. CartPage recommendations resolve + thread identity", has(CART, "useDefaultVariantNames(recommendedViewItems)") && has(CART, "defaultVariantName={recommendedDefaultVariantNames.get(item.sourceId)}"));

// ---------------------------------------------------------------------------
console.log("5. CategoryPage is a scoped single-category catalog");
// ---------------------------------------------------------------------------
check("5a. Exactly one CatalogGrid", count(CAT, "<CatalogGrid") === 1, `${count(CAT, "<CatalogGrid")} found`);
check("5b. Exactly one CatalogToolbar", count(CAT, "<CatalogToolbar") === 1, `${count(CAT, "<CatalogToolbar")} found`);
check(
  "5c. H1 is the route category, not '{bu} Categories'",
  has(CAT, "{activeCategory?.name ?? bu.name}") && lacks(CAT, "{bu.name} Categories"),
);
check(
  "5d. Document title leads with the route category",
  has(CAT, "activeCategory.name} | ${businessUnit.name}"),
);
check(
  "5e. Breadcrumb resolves the route category name",
  has(CAT, "activeCategory?.name ?? \"Categories\""),
);
check(
  "5f. Filter pipeline is scoped to the route category",
  has(CAT, "const scopedItems = useMemo(") &&
    has(CAT, "itemsByCategoryId.get(activeCategory._id)") &&
    has(CAT, "filterAndSortCatalogItems(scopedItems, {"),
);
check(
  "5g. Grid binds every card to the route category",
  has(CAT, "categorySlugFor={() => activeCategory.slug}"),
);
check(
  "5h. Header product badge shows the scoped count",
  has(CAT, "{scopedProductCount} product"),
);

// ---------------------------------------------------------------------------
console.log("6. Section-browser behavior fully removed (no scroll UI)");
// ---------------------------------------------------------------------------
const removed = [
  "categoryAnchorId",
  "scrollIntoView",
  "IntersectionObserver",
  "category-overview",
  "<CategoryCard",
  "<CategoryIcon",
  "scrollToCategory",
  "scrollToOverview",
  "filteredByCategoryId",
  "anyResults",
  "effectiveActiveCategoryId",
  "setActiveCategoryId",
];
for (const needle of removed) {
  check(`6x. CategoryPage no longer contains \`${needle}\``, lacks(CAT, needle));
}

// ---------------------------------------------------------------------------
console.log("7. Category navigation is URL-based (canonical routing)");
// ---------------------------------------------------------------------------
check(
  "7a. Nav chips navigate to the canonical category URL",
  has(CAT, "onSelect={navigateToCategory}") &&
    has(CAT, "navigate(`/${buSlug}/${target.slug}`)"),
);
check(
  "7b. Current-category clicks are no-ops (no self-navigation)",
  has(CAT, "target._id !== activeCategory?._id"),
);
check(
  "7c. Empty-category state explores other categories via navigation",
  has(CAT, "onExploreOther") && has(CAT, "navigateToCategory(nextCategoryWithProducts._id)"),
);
check(
  "7d. Browse-all returns to the store page",
  has(CAT, "onBrowseAll={() => navigate(`/${buSlug}`)}"),
);

// ---------------------------------------------------------------------------
console.log("8. Preserved behavior (regression guards)");
// ---------------------------------------------------------------------------
check(
  "8a. Product-slug -> PDP redirect preserved",
  has(CAT, "productRedirect") && has(CAT, "navigate(productRedirect, { replace: true })"),
);
check(
  "8b. Invalid store still renders Store Not Found",
  has(CAT, "isBuNotFound") && has(CAT, "Store Not Found"),
);
check(
  "8c. Unknown category still renders Category Not Found",
  has(CAT, "Category Not Found"),
);
check(
  "8d. Zero-category store still renders its empty state",
  has(CAT, "No categories yet"),
);
check(
  "8e. Search/sort/view reset on category change preserved",
  has(CAT, "prevSlugKey") && has(CAT, "setSortBy(\"default\")"),
);
check(
  "8f. Quick-add still writes the shared canonical line resolver",
  has(CAT, "resolveQuickAddVariantLine") && has(BU, "resolveQuickAddVariantLine"),
);
check(
  "8g. Shared pipeline + grid + toolbar wiring intact (21C contract)",
  has(CAT, "CatalogGrid") && has(CAT, "CatalogToolbar") && has(CAT, "filterAndSortCatalogItems") &&
    has(CAT, "businessUnitSlug={buSlug}"),
);
check(
  "8h. Category nav still receives real counts",
  has(CAT, "counts={countsRecord}") && has(CAT, "activeId={activeCategory?._id ?? \"\"}"),
);
check(
  "8i. Store cart untouched by Phase 21C-FIX",
  diffOf(STORE) === "",
  diffOf(STORE).split("\n").length + " diff lines",
);
check(
  "8j. Combo / party-pack cards untouched by Phase 21C-FIX",
  diffOf(COMBO) === "" && diffOf(PACK) === "",
);
check(
  "8k. Convex backend untouched by Phase 21C-FIX",
  execSync("git diff --name-only -- convex/", { cwd: ROOT, encoding: "utf8" }).trim() === "",
);

// ---------------------------------------------------------------------------
console.log("\n=== Result:", passed, "passed,", failed, "failed ===");
if (failed > 0) {
  console.log("Failed checks:\n - " + failures.join("\n - "));
  process.exit(1);
}
