// ============================================================================
// MB CRUNCHY — Phase 21B Customer Routing & Navigation Verification
//
// Structural verification of the Phase 21B changes:
//   1. Policy + Help routes are registered before the dynamic store routes
//   2. ProductCard primary area links to the canonical PDP
//   3. Quick add / quick view stay independent (no nested interactive elements)
//   4. Every ProductCard call site supplies a category slug
//   5. Search combo/party-pack results no longer dead-end
//   6. Favourites / collection cards build canonical destinations
//   7. ItemDetailsModal exposes View Details -> PDP
//   8. Footer + account sidebar point at routed policy/help paths
//
// Pure source verification — no backend calls, no test runner required.
// Run: node tests/21b_customer_routing.mjs
// ============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function section(title) {
  console.log(`\n${title}`);
}

// ============================================================================
console.log("=== Phase 21B: Customer Routing & Navigation Verification ===");

// ---------------------------------------------------------------------------
section("[1] Policy + Help routes (src/main.tsx)");
{
  const main = read("src/main.tsx");
  const routes = [
    "/policy/privacy",
    "/policy/terms",
    "/policy/shipping",
    "/policy/refund",
    "/help",
  ];
  for (const route of routes) {
    assert(main.includes(`path="${route}"`), `Route registered: ${route}`);
  }
  const policyIdx = main.indexOf('path="/policy/privacy"');
  const dynamicIdx = main.indexOf('path="/:businessUnitSlug"');
  assert(
    policyIdx !== -1 && dynamicIdx !== -1 && policyIdx < dynamicIdx,
    "Static policy route is declared before the dynamic /:businessUnitSlug route",
  );
  assert(
    main.includes('path="/policy" element={<Navigate'),
    "/policy root redirects (no BusinessUnitPage 'Store Not Found')",
  );
  const pages = [
    ["/policy/privacy", "PrivacyPolicyPage", "policy/PrivacyPolicyPage"],
    ["/policy/terms", "TermsAndConditionsPage", "policy/TermsAndConditionsPage"],
    ["/policy/shipping", "ShippingPolicyPage", "policy/ShippingPolicyPage"],
    ["/policy/refund", "RefundAndCancellationPolicyPage", "policy/RefundAndCancellationPolicyPage"],
    ["/help", "HelpPage", "help/HelpPage"],
  ];
  for (const [route, component, modulePath] of pages) {
    assert(main.includes(`element={<${component} />}`), `Route renders ${component}`);
    assert(main.includes(modulePath), `Lazy import: ${modulePath}`);
  }
}

// ---------------------------------------------------------------------------
section("[2] ProductCard primary navigation (src/components/customer/ProductCard.tsx)");
{
  const card = read("src/components/customer/ProductCard.tsx");
  assert(card.includes('import { Link } from "react-router"'), "Card renders a router Link");
  assert(card.includes("buildProductUrl("), "Card builds the canonical 3-segment PDP URL");
  assert(card.includes("buildCategoryUrl("), "Card falls back to /{bu}/{product} when the category slug is unresolved");
  assert(card.includes("buildBusinessUnitUrl("), "Non-product items fall back to the store page");
  assert(card.includes("after:absolute after:inset-0"), "Stretched link covers the whole card (primary area -> PDP)");
  assert(card.includes("onClick={(e) => e.stopPropagation()}"), "Link click does not also open the quick-view modal");
  assert(card.includes("Quick view ${product.name}"), "Explicit quick-view control keeps the modal reachable");
  assert(card.includes('type="button"'), "Action controls are real buttons, not links");
  assert(card.includes("handleAdd"), "Quick add handler preserved");
  assert(card.includes("handleIncrement") && card.includes("handleDecrement"), "Quantity stepper preserved");

  // No <Link> may contain a <button> (nested interactive elements).
  const linkBlocks = card.match(/<Link[\s\S]*?<\/Link>/g) || [];
  const nestedButton = linkBlocks.some((block) => /<button/.test(block));
  assert(linkBlocks.length > 0 && !nestedButton, `No <button> nested inside <Link> (${linkBlocks.length} link checked)`);
}

// ---------------------------------------------------------------------------
section("[3] ProductCard call sites pass a category slug");
{
  const files = [
    "src/components/customer/BestSellersSection.tsx",
    "src/components/customer/BusinessUnitSections.tsx",
    "src/components/customer/CrossSellSections.tsx",
    "src/components/customer/MartGridSection.tsx",
    "src/components/customer/ProductGridSection.tsx",
    "src/pages/customer/BusinessUnitPage.tsx",
    "src/pages/customer/CartPage.tsx",
    "src/pages/customer/CategoryPage.tsx",
    "src/pages/customer/ProductPage.tsx",
  ];
  const catalogGrid = read("src/components/customer/CatalogGrid.tsx");
  for (const file of files) {
    const src = read(file);
    // Negative lookahead so <ProductCardSkeleton> placeholders are not counted.
    const cardCount = (src.match(/<ProductCard(?![a-zA-Z])/g) || []).length;
    const slugCount = (src.match(/categorySlug=/g) || []).length;
    // Phase 21C: pages that render through the shared CatalogGrid inherit its
    // categorySlug wiring instead of passing the prop at every call site.
    const viaSharedGrid =
      (src.match(/<CatalogGrid(?![a-zA-Z])/g) || []).length > 0 &&
      catalogGrid.includes("categorySlug={categorySlugFor?.(item)}");
    assert(
      (cardCount > 0 && slugCount >= cardCount) || viaSharedGrid,
      `${path.basename(file)}: ${cardCount} card site(s), ${slugCount} categorySlug prop(s)`,
    );
  }
}

// ---------------------------------------------------------------------------
section("[4] Search results (src/pages/customer/SearchPage.tsx)");
{
  const search = read("src/pages/customer/SearchPage.tsx");
  assert(
    search.includes("item.itemType !== \"product\""),
    "Non-product results are detected before a destination is chosen",
  );
  assert(
    search.includes("`/${item._businessUnitSlug}`"),
    "Combo / party-pack results land on the store page (no 'Category Not Found')",
  );
  assert(
    search.includes("${item._businessUnitSlug}/${item._categorySlug}/${item.slug}"),
    "Product results keep the canonical 3-segment URL",
  );
}

// ---------------------------------------------------------------------------
section("[5] Favourites + collection cards");
{
  const grid = read("src/components/customer/CollectionGrid.tsx");
  assert(grid.includes("buildProductUrl("), "CollectionGrid builds a canonical PDP URL");
  assert(
    !grid.includes("to={`/${buSlug}/${itemSlug}`}"),
    "CollectionGrid no longer links to the dead-end /{bu}/{product} path",
  );
  assert(grid.includes("aria-label={`View"), "Collection link has an accessible label");

  const fav = read("src/pages/customer/account/FavouritesPage.tsx");
  assert(fav.includes("useBusinessUnitSlugById"), "Favourites resolves a real business unit slug");
  assert(fav.includes("useProductCategorySlugs"), "Favourites resolves a real category slug");
  assert(
    !fav.includes("businessUnitSlug: undefined"),
    "Favourites no longer hard-codes an undefined business unit slug",
  );
}

// ---------------------------------------------------------------------------
section("[6] ItemDetailsModal -> View Details");
{
  const modal = read("src/components/customer/ItemDetailsModal.tsx");
  assert(modal.includes("View Details"), "Modal exposes a View Details action");
  assert(modal.includes("buildProductUrl("), "View Details targets the canonical PDP");
  assert(modal.includes("handleViewDetails"), "View Details closes the modal before navigating");
  assert(modal.includes("useCategorySlugById"), "Modal resolves the product category slug");
  assert(modal.includes("useBusinessUnitSlugById"), "Modal resolves the business unit slug");
  assert(modal.includes("Add to Cart"), "Modal quick-add preserved");
}

// ---------------------------------------------------------------------------
section("[7] Shared route helpers (src/hooks/use-product-routes.ts)");
{
  const hook = read("src/hooks/use-product-routes.ts");
  assert(hook.includes("export function useBusinessUnitSlugById"), "useBusinessUnitSlugById exported");
  assert(hook.includes("export function useCategorySlugById"), "useCategorySlugById exported");
  assert(hook.includes("export function useProductCategorySlugs"), "useProductCategorySlugs exported");
  assert(
    hook.includes('api.categories.getAllActiveAcrossBusinessUnits'),
    "Category slugs come from live active-category data (no invented slugs)",
  );
  assert(hook.includes("api.products.getByIds"), "Product -> category mapping uses products.getByIds");
  assert(
    hook.includes('item.itemType ?? "product") !== "product"'),
    "Combo/party-pack sourceIds are excluded from the products id query",
  );
}

// ---------------------------------------------------------------------------
section("[8] Policy + Help link sources");
{
  const sidebar = read("src/components/customer/account/AccountSidebar.tsx");
  assert(sidebar.includes("ROUTES.POLICY.PRIVACY"), "Account sidebar links to /policy/privacy");
  assert(sidebar.includes("ROUTES.POLICY.HELP"), "Account sidebar links to /help");

  const footer = read("src/layouts/customer/CustomerFooter.tsx");
  assert(footer.includes("ROUTES.POLICY.PRIVACY"), "Footer links to /policy/privacy");
  assert(footer.includes("ROUTES.POLICY.TERMS"), "Footer links to /policy/terms");
  assert(footer.includes("ROUTES.POLICY.SHIPPING"), "Footer links to /policy/shipping");
  assert(footer.includes("ROUTES.POLICY.REFUND"), "Footer links to /policy/refund");
  assert(footer.includes("ROUTES.POLICY.HELP"), "Footer links to /help");
}

// ---------------------------------------------------------------------------
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
