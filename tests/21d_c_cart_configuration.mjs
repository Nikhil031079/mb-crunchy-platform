// ============================================================================
// Phase 21D-C — Cart configuration continuity (edit variant in cart)
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// existing plain-Node `tests/*.mjs` convention: run with
//   node tests/21d_c_cart_configuration.mjs
//
// Scope (21D-C only): cart-line variant editing with correct identity/merge
// (M1-M3, M6), inventory verification (M4), stale-price indication + explicit
// refresh (M5), canonical helper reuse (M9), no silent Default fallback
// (M14), meal-deal / cross-BU preservation (M1/M11) and the full regression
// suites (21B, 21C, 21D-B).
//
// LIMITATION (documented per phase instructions): the repo has no browser/Convex
// runtime harness, so TESTS 1-14 are STRUCTURAL proofs — source structure,
// guards, call content and absence of out-of-scope changes — not runtime
// execution of the cart UI. TESTS 15-17 execute the existing suites for real.
// No new test framework is introduced.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function read(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  // Normalize CRLF: the repo mixes line endings and markers assume "\n"
  // (same convention as tests/19c_*, 19d_*, 19e_*, 19g_*).
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
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
  return src === null ? 0 : src.split(needle).length - 1;
}

/** Extract a `function foo(...)` body (paren-aware, then brace-aware). */
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

/** Extract a `const name = ... => { ... }` arrow body (brace-aware). */
function constFnBody(rel, name) {
  const src = read(rel);
  if (!src) return "";
  const at = src.indexOf(`const ${name} =`);
  if (at < 0) return "";
  const arrow = src.indexOf("=>", at);
  if (arrow < 0) return "";
  const brace = src.indexOf("{", arrow);
  if (brace < 0) return "";
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  return "";
}

function gitLines(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

const STORE = "src/stores/cart.ts";
const CART = "src/pages/customer/CartPage.tsx";
const EDITOR = "src/components/customer/CartVariantEditor.tsx";
const UTIL = "src/utils/product-variants.ts";
const SUITE_B = "tests/21b_customer_routing.mjs";
const SUITE_C = "tests/21c_catalog_ia.mjs";
const SUITE_DB = "tests/21d_b_variant_safety.mjs";
const SUITE_DC = "tests/21d_c_cart_configuration.mjs";

const updateVariantBody = constFnBody(STORE, "updateVariant");
const editorBody = functionBody(EDITOR, "isCartVariantUnavailable");
const saveBody = constFnBody(EDITOR, "handleSave");
const priceBody = functionBody(CART, "resolveCurrentLinePrice");

// ---------------------------------------------------------------------------
// TEST 1 — cart store exposes a narrow updateVariant action.
// ---------------------------------------------------------------------------
check("T1.1. updateVariant action defined in the cart store", updateVariantBody.length > 0);
check(
  "T1.2. updateVariant exposed on the useCart return object",
  has(STORE, "updateQuantity,\n    updateVariant,\n    removeItem,") ||
    (code(STORE) || "").match(/return \{[\s\S]*?updateVariant,[\s\S]*?\}/) !== null,
);
check(
  "T1.3. Action takes an explicit variantName + unitPrice payload",
  has(STORE, "next: { variantName: string; unitPrice: number }"),
);

// ---------------------------------------------------------------------------
// TEST 2 — meal-deal lines keep existing behavior everywhere (M1).
// ---------------------------------------------------------------------------
check(
  "T2.1. Store refuses meal-deal lines before any mutation",
  updateVariantBody.includes("if (target.mealDealId) return prev;") &&
    updateVariantBody.indexOf("if (target.mealDealId) return prev;") <
      updateVariantBody.indexOf("let newItems"),
);
check(
  "T2.2. Editor is never rendered for meal-deal lines",
  has(CART, "!item.mealDealId &&"),
);
check(
  "T2.3. Stale-price resolver never reprices meal-deal lines",
  priceBody.includes("item.itemType !== \"product\" || item.mealDealId"),
);
check(
  "T2.4. updateVariant never touches deal state (no appliedMealDeals)",
  !updateVariantBody.includes("appliedMealDeals"),
);

// ---------------------------------------------------------------------------
// TEST 3 — identity, quantity and business unit are preserved (M13/M17).
// ---------------------------------------------------------------------------
check(
  "T3.1. In-place path spreads the original line (identity fields kept)",
  updateVariantBody.includes("...target,"),
);
check(
  "T3.2. In-place path rewrites only variantName/unitPrice/totalPrice",
  updateVariantBody.includes("variantName: next.variantName") &&
    updateVariantBody.includes("unitPrice: next.unitPrice") &&
    updateVariantBody.includes("totalPrice: next.unitPrice * target.quantity"),
);
check(
  "T3.3. Business unit is never reassigned by the action",
  !updateVariantBody.includes("businessUnitId:"),
);
check(
  "T3.4. Merge path preserves total quantity (sums both lines)",
  updateVariantBody.includes("sibling.quantity + target.quantity"),
);

// ---------------------------------------------------------------------------
// TEST 4 — merged identity instead of duplicates (M6).
// ---------------------------------------------------------------------------
check(
  "T4.1. Sibling match uses catalogItemId + resulting variantName",
  updateVariantBody.includes("i.catalogItemId === target.catalogItemId") &&
    updateVariantBody.includes("i.variantName === next.variantName"),
);
check(
  "T4.2. Deal-tagged lines are never merge targets",
  updateVariantBody.includes("!i.mealDealId"),
);
check(
  "T4.3. Index shift handled when the target sits after the sibling",
  updateVariantBody.includes("siblingIdx > targetIdx ? siblingIdx - 1 : siblingIdx"),
);
check(
  "T4.4. No path appends a new cart line (no push/spread-append)",
  !updateVariantBody.includes("newItems.push") &&
    !updateVariantBody.includes("[...prev.items,"),
);

// ---------------------------------------------------------------------------
// TEST 5 — single atomic transition, totals recomputed (M7/M13/M15).
// ---------------------------------------------------------------------------
check(
  "T5.1. Exactly one setState call in the action",
  updateVariantBody.split("setState(").length - 1 === 1,
);
check(
  "T5.2. Subtotal + total recomputed from the new items",
  updateVariantBody.includes("calculateSubtotal(newItems)") &&
    updateVariantBody.includes("computeTotal("),
);
check(
  "T5.3. Result passes through reconcileCartState (deal-consistency rules)",
  updateVariantBody.includes("reconcileCartState("),
);
check(
  "T5.4. No direct persistence or async work in the action (setState emits)",
  !updateVariantBody.includes("localStorage") &&
    !updateVariantBody.includes("persistCart") &&
    !updateVariantBody.includes("await"),
);
check(
  "T5.5. Action reports success/failure synchronously",
  updateVariantBody.includes("return applied;"),
);

// ---------------------------------------------------------------------------
// TEST 6 — canonical variant helpers reused, not recreated (M9).
// ---------------------------------------------------------------------------
check(
  "T6.1. CartPage imports getActiveVariants from the canonical module",
  has(CART, "import { getActiveVariants } from \"@/utils/product-variants\""),
);
check(
  "T6.2. Editor does not define its own variant-resolution helpers",
  lacks(EDITOR, "function getActiveVariants") &&
    lacks(EDITOR, "function getDefaultActiveVariant") &&
    lacks(EDITOR, "function getDefaultVariant") &&
    lacks(EDITOR, "function findMatchingVariant"),
);
check(
  "T6.3. CartPage does not shadow the canonical helpers",
  lacks(CART, "function getActiveVariants") &&
    lacks(CART, "function getDefaultActiveVariant"),
);
check(
  "T6.4. Canonical module still defines getActiveVariants (single source)",
  has(UTIL, "export function getActiveVariants("),
);

// ---------------------------------------------------------------------------
// TEST 7 — editor gating: product lines, active variants, cross-BU (M1/M10/M11).
// ---------------------------------------------------------------------------
check(
  "T7.1. Edit affordance only when active variants exist",
  has(CART, "const editable = activeVariants.length > 0;") &&
    has(CART, "{editable && ("),
);
check(
  "T7.2. Gating excludes non-product lines (itemType check on productDoc)",
  has(CART, "item.itemType === \"product\" && catalogEntry?.sourceId"),
);
check(
  "T7.3. Cross-BU guard before edit + price resolution",
  has(CART, "productDoc.businessUnitId === item.businessUnitId") &&
    priceBody.includes("productDoc.businessUnitId !== item.businessUnitId"),
);
check(
  "T7.4. Editor is wired to the store action (onApply -> updateVariant)",
  has(CART, "onApply={(next) =>\n                                  updateVariant(item.cartItemId ?? \"cl_0\", next)") ||
    (code(CART) || "").includes("updateVariant(item.cartItemId ?? \"cl_0\", next)"),
);

// ---------------------------------------------------------------------------
// TEST 8 — inventory verification before a variant switch (M4).
// ---------------------------------------------------------------------------
check("T8.1. Availability helper exported", has(EDITOR, "export function isCartVariantUnavailable"));
check(
  "T8.2. Unknown inventory blocks (never guess stock)",
  editorBody.includes("if (!inventory) return true;"),
);
check(
  "T8.3. Zero live rows = untracked product, allowed",
  editorBody.includes("if (liveRows.length === 0) return false;"),
);
check(
  "T8.4. Tracked rows with no match for the target variant fail closed",
  editorBody.includes("if (!row) return true;"),
);
check(
  "T8.5. Matching row must be available with stock on hand",
  editorBody.includes("return !row.available || row.stockQuantity <= 0;"),
);
check(
  "T8.6. Save path calls the availability helper",
  saveBody.includes("isCartVariantUnavailable(inventory,"),
);
check(
  "T8.7. Single reactive inventory query, skipped until an editor opens",
  count(CART, "api.inventory.getByCatalogItem") === 1 &&
    /api\.inventory\.getByCatalogItem[\s\S]{0,200}skip/.test(code(CART) || ""),
);

// ---------------------------------------------------------------------------
// TEST 9 — save-time validation, explicit selection, no silent fallback (M2/M14).
// ---------------------------------------------------------------------------
check(
  "T9.1. Save re-validates the choice against the active variant list",
  saveBody.includes("activeVariants.find((v) => v.optionValue === selectedValue)"),
);
check(
  "T9.2. Price applied comes from the chosen active variant",
  saveBody.includes("unitPrice: variant.price"),
);
check(
  "T9.3. Save disabled until an explicit/valid current choice exists",
  has(EDITOR, "disabled={selectedValue === null}"),
);
check(
  "T9.4. No isDefault / default-variant fallback anywhere in the editor",
  lacks(EDITOR, "isDefault") &&
    lacks(EDITOR, "getDefaultActiveVariant") &&
    lacks(EDITOR, "getDefaultVariant("),
);
check(
  "T9.5. Current variant no longer active -> nothing preselected",
  has(EDITOR, "currentStillActive ? item.variantName : null"),
);
check(
  "T9.6. Rejected saves tell the customer the cart was not changed",
  editorBody.length > 0 && (code(EDITOR) || "").split("Your cart was not changed.").length - 1 >= 2,
);
check(
  "T9.7. No unreachable silent Default string in the editor",
  lacks(EDITOR, "\"Default\"") && lacks(EDITOR, "'Default'"),
);

// ---------------------------------------------------------------------------
// TEST 10 — stale-price indicator + explicit refresh action (M5).
// ---------------------------------------------------------------------------
check(
  "T10.1. Threshold mirrors the server price tolerance",
  has(CART, "STALE_PRICE_THRESHOLD = 0.02") &&
    read(CART).includes("mirrors PRICE_TOLERANCE in convex/orders.ts"),
);
check(
  "T10.2. Current price resolves like resolveOrderLine (variant first)",
  priceBody.includes("getActiveVariants(productDoc.variants)") &&
    priceBody.includes("variant ? variant.price : null"),
);
check(
  "T10.3. Zero-active-variant products fall back to the catalog price",
  priceBody.includes("if (active.length === 0) return catalogEntry.price;"),
);
check(
  "T10.4. Missing docs resolve to null (no guessed price)",
  priceBody.includes("if (!catalogEntry || !productDoc) return null;"),
);
check(
  "T10.5. Indicator shows the current price to the customer",
  has(CART, "Price changed") && has(CART, "Now {formatCurrency(stalePrice)}"),
);
check(
  "T10.6. Obvious refresh action reprice via updateVariant (same variant)",
  has(CART, "Update price") &&
    updateVariantBody.includes("target.variantName === next.variantName"),
);
check(
  "T10.7. Refresh failure surfaces an error (no silent no-op)",
  has(CART, "Couldn't update price") &&
    (code(CART) || "").includes("Your cart was not changed."),
);
check(
  "T10.8. Stale indicator only for product lines with a resolvable price",
  priceBody.length > 0 && priceBody.includes("return null"),
);

// ---------------------------------------------------------------------------
// TEST 11 — fixed hook architecture preserved (no dynamic hook counts).
// ---------------------------------------------------------------------------
const headCart = execSync("git show HEAD:src/pages/customer/CartPage.tsx", {
  cwd: ROOT,
  encoding: "utf8",
});
const baseUseQuery = stripComments(headCart).split("useQuery(").length - 1;
const nowUseQuery = count(CART, "useQuery(");
// Baseline is HEAD. 21D-C's +3 growth was measured against its pre-commit
// HEAD and is now committed, so HEAD already includes it — the honest
// post-commit form of this check is "no further growth in this phase"
// (Phase 21C-FIX harness sync; assertion strength preserved: dynamic or
// added useQuery calls in CartPage still fail).
check(
  `T11.1. useQuery count unchanged this phase (baseline ${baseUseQuery} -> ${nowUseQuery})`,
  nowUseQuery === baseUseQuery,
  `baseline ${baseUseQuery}, now ${nowUseQuery}`,
);
check("T11.2. Still exactly 4 useMealDeals calls", count(CART, "useMealDeals(") === 4);
const cartSrc = code(CART) || "";
const invAt = cartSrc.indexOf("api.inventory.getByCatalogItem");
const earlyAt = cartSrc.indexOf("if (cart.items.length === 0)");
check(
  "T11.3. Inventory query declared before the empty-cart early return",
  invAt > 0 && earlyAt > invAt,
);

// ---------------------------------------------------------------------------
// TEST 12 — prior suites: 21D-B untouched, 21C only via sanctioned allowlist.
// ---------------------------------------------------------------------------
const dbDiff = gitLines("diff -- tests/21d_b_variant_safety.mjs");
check("T12.1. 21D-B suite file unchanged this phase", dbDiff !== null && dbDiff.length === 0, (dbDiff || []).join(", "));
const cSrc = read(SUITE_C) || "";
check(
  "T12.2. 21C ALLOWED_21D_B set untouched (exact 21D-B entries)",
  cSrc.includes(
    'const ALLOWED_21D_B = new Set([\n  "convex/orders.ts",\n  "convex/inventory.ts",\n  "src/pages/customer/CheckoutPage.tsx",\n]);',
  ),
);
check(
  "T12.3. 21C forbidden guards still intact (checks 16 / 17a / 17b)",
  cSrc.includes("const forbidden = [") &&
    cSrc.includes('"src/stores/cart",') &&
    cSrc.includes("17a. No cart store / checkout / payment / shipping files changed") &&
    cSrc.includes('"17b. CartPage was not modified by Phase 21C"'),
);
const c12At = cSrc.indexOf("const ALLOWED_21D_C = new Set([");
const c12End = c12At >= 0 ? cSrc.indexOf("]);", c12At) : -1;
const c12Block = c12End > 0 ? cSrc.slice(c12At, c12End + 3) : "";
check(
  "T12.4. ALLOWED_21D_C contains exactly the one required file",
  c12Block === 'const ALLOWED_21D_C = new Set([\n  "src/stores/cart.ts",\n]);',
  c12Block.slice(0, 120),
);
const cDiffBody = execSync("git diff -- tests/21c_catalog_ia.mjs", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter((l) => /^[+-]/.test(l) && !/^(---|\+\+\+)/.test(l));
// Sanctioned line classes: the 21D-C ALLOWED_21D_C extension, plus the
// Phase 21C-FIX needle sync in checks 4d/5b (old line + new line each —
// `filterAndSortCatalogItems` / `categorySlugFor` appear in both) — the
// assertions stay equal-strength and any working-tree drift stays bounded
// at 10 lines. The 21C needle sync itself was committed in f97fa4b, so an
// empty worktree diff is the correct post-commit baseline (Phase 21D-D
// harness sync; the bounded + sanctioned-line guard still applies to any
// future non-empty diff).
check(
  "T12.5. 21C diff is empty (committed) or a bounded sanctioned edit only (<= 10 lines)",
  cDiffBody.length <= 10 &&
    cDiffBody.every((l) => /ALLOWED|21D|src\/stores\/cart\.ts|filterAndSortCatalogItems|categorySlugFor|\]\);$/.test(l)),
  `${cDiffBody.length} lines`,
);

// ---------------------------------------------------------------------------
// TEST 13 — out-of-scope files untouched (schema, package manifest, authority).
// ---------------------------------------------------------------------------
const changed = gitLines("diff --name-only HEAD") || [];
// Phase 21C-FIX (category page + card quantity identity) legitimately edits
// a small, known set of files in the same working tree — the same sanctioned
// mechanism this suite and tests/21c_catalog_ia.mjs use for 21D-B / 21D-C.
// Everything else stays guarded by T13.1 below.
const ALLOWED_21C_FIX = new Set([
  "src/components/customer/BestSellersSection.tsx",
  "src/components/customer/BusinessUnitSections.tsx",
  "src/components/customer/CatalogGrid.tsx",
  "src/components/customer/CrossSellSections.tsx",
  "src/components/customer/ProductCard.tsx",
  "src/components/customer/ProductGridSection.tsx",
  "src/pages/customer/BusinessUnitPage.tsx",
  "src/pages/customer/CategoryPage.tsx",
  "src/hooks/use-default-variant-names.ts",
  "tests/21c_fix_category_quantity.mjs",
]);
// Phase 21D-D (checkout quantity continuity) sanctioned implementation set —
// the scope's primary file plus its new structural suite (Phase 21D-D
// harness sync, explicitly reported in the phase report).
const ALLOWED_21D_D = new Set([
  "src/pages/customer/CheckoutPage.tsx",
  "tests/21d_d_checkout_quantity.mjs",
]);
// Phase 21D-H (product add-to-cart safety) sanctioned implementation set —
// the ProductPage fix plus the 21D-G2 suite's harness sync in the same
// working tree (explicitly reported in the 21D-H phase report). The 21D-E2
// evidence-pin phase adds this suite's own harness sync (21D-H scope block).
const ALLOWED_21D_H = new Set([
  "src/pages/customer/ProductPage.tsx",
  "tests/21d_g2_destination_city_state.mjs",
  "tests/21d_h_product_add_to_cart.mjs",
]);
const unexpected = changed.filter(
  (f) =>
    ![
      STORE,
      CART,
      "src/components/customer/index.ts",
      SUITE_C,
      SUITE_DB,
      SUITE_DC,
    ].includes(f) &&
    !ALLOWED_21C_FIX.has(f) &&
    !ALLOWED_21D_D.has(f) &&
    !ALLOWED_21D_H.has(f),
);
check(
  "T13.1. Tracked changes limited to the sanctioned implementation sets",
  unexpected.length === 0,
  unexpected.join(", "),
);
const protectedFiles = [
  "package.json",
  "convex/schema.ts",
  "convex/orders.ts",
  "convex/inventory.ts",
  "convex/catalogItems.ts",
  "convex/products.ts",
];
const protectedTouched = protectedFiles.filter((f) => changed.includes(f));
check(
  "T13.2. No schema / package / server-authority files modified",
  protectedTouched.length === 0,
  protectedTouched.join(", "),
);
const pkg = read("package.json") || "";
check(
  "T13.3. No test framework added to package.json",
  !/vitest|"jest"|@testing-library/.test(pkg),
);

// ---------------------------------------------------------------------------
// TEST 14 — documented runtime limitation.
// ---------------------------------------------------------------------------
check(
  "T14.1. Test file documents the structural-only limitation",
  read("tests/21d_c_cart_configuration.mjs").includes("LIMITATION"),
);
check(
  "T14.2. Editor availability logic has no server-side writes (client-only)",
  !editorBody.includes("fetch(") && !saveBody.includes("fetch("),
);

// ---------------------------------------------------------------------------
// TESTS 15-17 — regression suites (executed for real).
// ---------------------------------------------------------------------------
const REGRESSIONS = [
  ["T15", SUITE_B, "Phase 21B customer routing"],
  ["T16", SUITE_C, "Phase 21C catalog IA"],
  ["T17", SUITE_DB, "Phase 21D-B variant safety"],
];
for (const [tag, suite, label] of REGRESSIONS) {
  const r = spawnSync(process.execPath, [suite], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
  });
  const tail = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").slice(-6).join(" | ");
  check(`${tag}. ${label} suite passes (${suite})`, r.status === 0, `exit=${r.status} ${tail}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== RESULTS ===");
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`   - ${f}`);
  process.exit(1);
}
console.log("");
