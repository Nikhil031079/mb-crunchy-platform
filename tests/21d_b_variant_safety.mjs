// ============================================================================
// Phase 21D-B — Variant identity, inventory fail-closed & checkout recovery
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// existing plain-Node `tests/*.mjs` convention: run with
//   node tests/21d_b_variant_safety.mjs
//
// Scope (21D-B only): canonical default-variant quick-add (M1), server
// fail-closed on an invalid variant (M2), tracked-vs-untracked inventory
// distinction (M3), ProductCard/PDP alignment (S5) and CheckoutPage mixed-BU
// error handling (S6).
//
// 21D-B.2: outside-area orders now run a READ-ONLY strict inventory dry-run
// inside orders.create BEFORE ctx.db.insert, so a tracked-variant mismatch is
// rejected before the Razorpay order/payment boundary. The actual reservation
// for outside-area orders stays at finalizePaidOrder.
//
// LIMITATION (documented per phase instructions): the repo has no Convex test
// runtime, so sections A-H are STRUCTURAL proofs — source position/ordering,
// call content and absence of side effects — not runtime execution of
// orders.create. No new test framework is introduced.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
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
  return src === null ? 0 : src.split(needle).length - 1;
}

/**
 * Extract a top-level function body. Finds the first `{` AFTER the closing
 * paren of the parameter list so parameter defaults don't terminate the scan
 * early.
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

const UTIL = "src/utils/product-variants.ts";
const HELPER = "convex/utils/variantHelper.ts";
const ORDERS = "convex/orders.ts";
const INV = "convex/inventory.ts";
const MAINT = "convex/maintenance.ts";
const HOOK = "src/hooks/use-add-to-cart.ts";
const BU = "src/pages/customer/BusinessUnitPage.tsx";
const CAT = "src/pages/customer/CategoryPage.tsx";
const FAV = "src/pages/customer/account/FavouritesPage.tsx";
const MODAL = "src/components/customer/ItemDetailsModal.tsx";
const CARD = "src/components/customer/ProductCard.tsx";
const PDP = "src/pages/customer/ProductPage.tsx";
const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";

console.log("\n=== PHASE 21D-B VARIANT SAFETY TESTS ===\n");

const resolver = functionBody(UTIL, "resolveQuickAddVariantLine");
const activeVariantsHelper = functionBody(UTIL, "getActiveVariants");
const resolveOrderLine = functionBody(ORDERS, "resolveOrderLine");
const resolveReservations = functionBody(INV, "resolveInventoryReservations");

// ---------------------------------------------------------------------------
console.log("1. Quick-add without variants writes \"Default\"");
// ---------------------------------------------------------------------------
check("1a. Shared resolver exists", resolver.length > 0);
check(
  "1b. Product with zero active variants resolves to \"Default\" + catalog price",
  resolver.includes('return { variantName: "Default", unitPrice: item.price ?? 0 };'),
);
check(
  "1c. Non-product lines (combo/partyPack) keep \"Default\"",
  resolver.includes('if (item.itemType !== "product")'),
);

// ---------------------------------------------------------------------------
console.log("\n2. Active default variant resolves to its real optionValue");
// ---------------------------------------------------------------------------
check(
  "2a. Canonical default = isDefault active variant",
  resolver.includes("active.find((v) => v.isDefault)"),
);
check(
  "2b. Client canonical rule mirrors convex/utils/variantHelper.ts",
  has(UTIL, "active.find((v) => v.isDefault) ?? active[0]") &&
    has(HELPER, "active.find((v) => v.isDefault) ?? active[0]"),
);

// ---------------------------------------------------------------------------
console.log("\n3. Active variant without isDefault falls back to first by sortOrder");
// ---------------------------------------------------------------------------
check(
  "3a. getActiveVariants sorts by sortOrder",
  activeVariantsHelper.includes("a.sortOrder - b.sortOrder"),
);
check(
  "3b. Resolver falls back to the first active variant (active[0])",
  resolver.includes("?? active[0]"),
);
check(
  "3c. getActiveVariants filters on v.active",
  activeVariantsHelper.includes(".filter((v) => v.active)"),
);

// ---------------------------------------------------------------------------
console.log("\n4. Invalid variantName rejected by orders.create");
// ---------------------------------------------------------------------------
check("4a. resolveOrderLine exists", resolveOrderLine.length > 0);
check(
  "4b. Product line with active variants but no match FAILS CLOSED",
  resolveOrderLine.includes("else if (activeVariants.length > 0)"),
);
check(
  "4c. Failure carries customer-facing copy (selected variant + review cart)",
  resolveOrderLine.includes("The selected variant for") &&
    resolveOrderLine.includes("Please review your cart."),
);
check(
  "4d. Non-matching identity is never priced from the catalog fallback",
  resolveOrderLine.indexOf("activeVariants.length > 0") <
    resolveOrderLine.indexOf("unitPrice = doc.price ?? 0"),
);
check(
  "4e. No legacy-cart normalization was added (cart.ts untouched by this rule)",
  lacks("src/stores/cart.ts", "resolveQuickAddVariantLine"),
);

// ---------------------------------------------------------------------------
console.log("\n5. Valid variant price is used");
// ---------------------------------------------------------------------------
check(
  "5a. Matching active variant prices from the variant",
  resolveOrderLine.includes("unitPrice = variant.price"),
);
check(
  "5b. Variant match only considers ACTIVE variants",
  resolveOrderLine.includes(".filter((v) => v.active)"),
);
check(
  "5c. Zero active variants keeps the non-variant price fallback",
  resolveOrderLine.includes("unitPrice = doc.price ?? 0"),
);

// ---------------------------------------------------------------------------
console.log("\n6. Tracked inventory with a valid variant reserves stock");
// ---------------------------------------------------------------------------
check(
  "6a. Matching (catalogItemId, variantName) row is reserved as before",
  resolveReservations.includes(
    "if (bundleRow) return [{ inventory: bundleRow, quantity: line.quantity }];",
  ),
);
check(
  "6b. Strict mode is opt-in (default behavior unchanged)",
  has(INV, "options?: { failOnVariantMismatch?: boolean }"),
);

// ---------------------------------------------------------------------------
console.log("\n7. Tracked inventory with an invalid variant does not silently skip");
// ---------------------------------------------------------------------------
check(
  "7a. Strict path re-checks rows for the catalog item",
  resolveReservations.includes("if (itemRows.length > 0)"),
);
check(
  "7b. Tracked-but-mismatched line THROWS instead of resolving to untracked",
  resolveReservations.includes("The selected variant for") &&
    resolveReservations.includes("Please review your cart."),
);
check(
  "7c. Guard runs only in strict mode and only for product lines",
  resolveReservations.includes(
    "if (options?.failOnVariantMismatch && !isBundleLine)",
  ),
);

// ---------------------------------------------------------------------------
console.log("\n8. Untracked inventory behavior unchanged");
// ---------------------------------------------------------------------------
check(
  "8a. Item with zero inventory rows still resolves to nothing (untracked)",
  resolveReservations.indexOf("The selected variant for") > 0 &&
    resolveReservations.indexOf(
      "return [];",
      resolveReservations.indexOf("The selected variant for"),
    ) > 0,
);
check(
  "8b. Non-strict callers keep the legacy skip path",
  resolveReservations.includes("if (!isBundleLine) return [];"),
);
check(
  "8c. Strict flag used at exactly 3 orders.ts sites: outside-area dry-run, local create reserve, finalize reserve",
  count(ORDERS, "resolveInventoryReservations(ctx, item, {") === 3,
);
check(
  "8d. Confirm/release/restore sites stay non-strict (no blocked cancellations)",
  count(ORDERS, "resolveInventoryReservations(ctx, item);") === 3,
);
check(
  "8e. Maintenance reconciliation stays non-strict",
  lacks(MAINT, "failOnVariantMismatch"),
);

// ---------------------------------------------------------------------------
console.log("\n9. ProductCard and ProductPage use the same default variant");
// ---------------------------------------------------------------------------
check(
  "9a. ProductCard imports the shared canonical helper",
  has(CARD, "getDefaultActiveVariant") &&
    has(CARD, '@/utils/product-variants'),
);
check(
  "9b. ProductCard no longer looks up variants[0] by position",
  lacks(CARD, "variants![0].optionValue"),
);
check(
  "9c. ProductPage no longer owns a private copy of the helpers",
  lacks(PDP, "function getDefaultVariant(") &&
    has(PDP, '@/utils/product-variants'),
);
check(
  "9d. ProductPage still resolves through the shared rule",
  has(PDP, "getDefaultVariant") && has(PDP, "getDefaultSelections"),
);
check(
  "9e. Shared resolver is the single source for quick-add identity",
  [HOOK, BU, CAT, FAV, MODAL].every((rel) => has(rel, "resolveQuickAddVariantLine")),
);

// ---------------------------------------------------------------------------
console.log("\n10. Mixed-BU checkout failure surfaces a specific message");
// ---------------------------------------------------------------------------
check(
  "10a. Server mixed-BU gate error is recognized",
  has(CHECKOUT, "MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED"),
);
check(
  "10b. Customer is returned to the store-selection guidance",
  has(CHECKOUT, "setSelectedCheckoutBU(null)") &&
    has(CHECKOUT, "Choose Store to Checkout") &&
    has(CHECKOUT, "items from different stores"),
);
check(
  "10c. Variant/inventory fail-closed errors surface verbatim",
  has(CHECKOUT, 'message.includes("selected variant")') &&
    has(CHECKOUT, "isVariantError"),
);
const checkoutSrc = code(CHECKOUT) ?? "";
const mixedAt = checkoutSrc.indexOf("MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED");
const mixedEnd = checkoutSrc.indexOf("return;", mixedAt);
const mixedBranch = checkoutSrc.slice(
  mixedAt,
  mixedEnd > 0 ? mixedEnd : mixedAt + 400,
);
check(
  "10d. Mixed-BU recovery does not discard cart lines",
  mixedAt > 0 &&
    !mixedBranch.includes("removeByBusinessUnit") &&
    !mixedBranch.includes("clearCart"),
);

// ---------------------------------------------------------------------------
console.log("\n--- Extra guards ---");
// ---------------------------------------------------------------------------
check(
  "G1. ItemDetailsModal initialises to the canonical default variant",
  has(MODAL, "getDefaultActiveVariant(product?.variants)") &&
    lacks(MODAL, "setSelectedVariant(product.variants[0].optionValue)"),
);
check(
  "G2. Modal add button only requires a selection when variants exist",
  has(MODAL, "activeVariants.length > 0 && !selectedVariant"),
);
check(
  "G3. Modal honors an explicit ACTIVE selection via the shared resolver",
  has(MODAL, "selectedVariantName: selectedVariant"),
);
check(
  "G4. Failure to resolve product identity aborts the add (no \"Default\" guess)",
  [HOOK, BU, CAT, FAV, MODAL].every((rel) => has(rel, "Unable to add to cart")),
);
check(
  "G5. Combo/partyPack quick-adds still use \"Default\" (unchanged)",
  has(BU, "itemType: \"combo\"") && has(BU, "itemType: \"partyPack\""),
);

// ---------------------------------------------------------------------------
console.log("\n--- Strict-option reach ---");
// ---------------------------------------------------------------------------
const strictFiles = [
  "convex/orders.ts",
  "convex/inventory.ts",
  "convex/maintenance.ts",
  "convex/cart.ts",
  "convex/razorpayWebhook.ts",
].filter((rel) => has(rel, "failOnVariantMismatch"));
check(
  "G6. Strict option is referenced only by inventory.ts + orders.ts",
  strictFiles.length === 2 &&
    strictFiles.includes("convex/orders.ts") &&
    strictFiles.includes("convex/inventory.ts"),
  `found in: ${strictFiles.join(", ")}`,
);

// ---------------------------------------------------------------------------
console.log("\n21D-B.2. Outside-area pre-payment inventory dry-run (A-H)");
// ---------------------------------------------------------------------------
const ordersCode = code(ORDERS) ?? "";
const oaDeclAt = ordersCode.indexOf("const isOutsideArea");
const ordersInsertAt = ordersCode.indexOf('db.insert("orders"');
const dryRunGuardAt = ordersCode.indexOf("if (isOutsideArea) {", oaDeclAt);
const dryRunAt = ordersCode.indexOf(
  "resolveInventoryReservations(ctx, item, {",
  oaDeclAt,
);
const dryRunBlock =
  dryRunGuardAt > 0 && ordersInsertAt > dryRunGuardAt
    ? ordersCode.slice(dryRunGuardAt, ordersInsertAt)
    : "";

// TEST A — orders.create validates outside-area inventory configuration by
// delegating to the shared strict resolver (same M3 rules; no second
// definition of "inventory tracked").
check(
  "A. Outside-area dry-run validates every line via the shared strict resolver",
  oaDeclAt > 0 &&
    dryRunGuardAt > oaDeclAt &&
    dryRunAt > dryRunGuardAt &&
    dryRunBlock.includes("for (const item of items)") &&
    dryRunBlock.includes("resolveInventoryReservations(ctx, item, {") &&
    dryRunBlock.includes("failOnVariantMismatch: true"),
);

// TEST B — the dry-run sits BEFORE the order insert, and its throw is not
// swallowed: a tracked mismatch aborts the mutation with no order row written
// (and therefore no Razorpay order/payment boundary).
check(
  "B1. Dry-run runs between the isOutsideArea declaration and ctx.db.insert",
  oaDeclAt > 0 && dryRunGuardAt > oaDeclAt && ordersInsertAt > dryRunAt,
);
check(
  "B2. Dry-run rejection aborts BEFORE order insert (no try/catch, single insert site)",
  dryRunBlock.includes("failOnVariantMismatch: true") &&
    !dryRunBlock.includes("try") &&
    count(ORDERS, 'db.insert("orders"') === 1,
);

// TEST C — genuinely untracked products stay allowed: the dry-run adds no
// rejection of its own; the tracked-vs-untracked distinction stays inside the
// shared resolver (rows exist -> throw, zero rows -> []).
check(
  "C. Dry-run adds no extra rejection (untracked zero-row products still allowed)",
  (dryRunBlock.match(/resolveInventoryReservations/g) || []).length === 1 &&
    !dryRunBlock.includes("throw") &&
    !/stockQuantity|reservedStock|avail/.test(dryRunBlock) &&
    resolveReservations.includes("if (itemRows.length > 0)") &&
    resolveReservations.includes("return [];"),
);

// TEST D — local orders keep the existing actual reservation path.
const localGuardAt = ordersCode.indexOf("if (!isOutsideArea) {", ordersInsertAt);
const localStrictAt = ordersCode.indexOf(
  "resolveInventoryReservations(ctx, item, {",
  localGuardAt,
);
const localBlock =
  localGuardAt > 0 && localStrictAt > localGuardAt
    ? ordersCode.slice(localGuardAt, localStrictAt + 400)
    : "";
check(
  "D1. Local orders still reserve inside the !isOutsideArea block after insert",
  localGuardAt > ordersInsertAt && localStrictAt > localGuardAt,
);
check(
  "D2. Local strict reserve still patches reservedStock (actual reservation unchanged)",
  localBlock.includes("failOnVariantMismatch: true") &&
    ordersCode.slice(localGuardAt).includes("ctx.db.patch(inventory._id") &&
    ordersCode.slice(localGuardAt).includes("reservedStock: newReserved"),
);

// TEST E — local invalid tracked variant still fails closed (shared resolver
// throw + strict flag at the local reserve site both intact).
check(
  "E. Local fail-closed behavior unchanged (strict flag + resolver throw intact)",
  localBlock.includes("failOnVariantMismatch: true") &&
    resolveReservations.includes("The selected variant for") &&
    resolveReservations.includes("Please review your cart."),
);

// TEST F — the dry-run cannot mutate inventory: neither the resolver body nor
// the dry-run block performs any write.
const resolverCode = stripComments(resolveReservations);
check(
  "F1. Resolver body performs no writes (queries/get + throw only)",
  !/ctx\.db\.(insert|patch|delete)|runMutation|logMovement\(/.test(resolverCode),
);
check(
  "F2. Dry-run block performs no writes (no patch/insert/reservedStock/logMovement)",
  !/ctx\.db\.|patch\(|insert\(|reservedStock|logMovement/.test(dryRunBlock),
);

// TEST G — finalizePaidOrder still owns the authoritative outside-area
// reservation (strict resolve + reservedStock patch) after payment.
const finDeclAt = ordersCode.indexOf("export const finalizePaidOrder");
const finEndAt = ordersCode.indexOf("export const ", finDeclAt + 10);
const finalizeBody =
  finDeclAt > 0
    ? ordersCode.slice(finDeclAt, finEndAt > 0 ? finEndAt : undefined)
    : "";
check(
  "G. finalizePaidOrder still performs the actual strict reservation",
  finalizeBody.includes("resolveInventoryReservations(ctx, item, {") &&
    finalizeBody.includes("failOnVariantMismatch: true") &&
    finalizeBody.includes("ctx.db.patch(inventory._id") &&
    finalizeBody.includes("reservedStock: newReserved") &&
    finalizeBody.includes('action: "inventory_reserved"'),
);

// TEST H — payment architecture untouched (tracked changes vs HEAD).
const changedFiles = execSync("git diff --name-only HEAD", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const paymentTouched = changedFiles.filter((f) =>
  /razorpay|webhook|shiprocket|payment/i.test(f),
);
check(
  "H. No Razorpay / webhook / payment / Shiprocket files changed",
  paymentTouched.length === 0,
  paymentTouched.join(", "),
);

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
