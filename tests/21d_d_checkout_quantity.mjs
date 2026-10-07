// ============================================================================
// Phase 21D-D — checkout quantity continuity structural tests
//
// Verifies the narrow checkout quantity-editing implementation:
//   - Order Summary exposes +/- controls per eligible line
//   - the existing cart store updateQuantity is the ONLY quantity authority
//   - identity is the line's cartItemId (variantName never touched)
//   - min 1 / finite / clamped quantities; per-line duplicate-click guard
//   - payment boundary, Razorpay, mixed-BU, server price authority,
//     and the 21D-C stale-price implementation all remain untouched
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/21d_d_checkout_quantity.mjs
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

function matches(rel, re) {
  const src = code(rel);
  return src !== null && re.test(src);
}

/** Working-tree diff for a path ("" when untouched). */
function diffOf(rel) {
  try {
    return execSync(`git diff HEAD -- "${rel}"`, { cwd: ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

/** Substring of a file between two needles (null when either missing). */
function between(rel, startNeedle, endNeedle) {
  const src = code(rel);
  if (src === null) return null;
  const a = src.indexOf(startNeedle);
  if (a < 0) return null;
  const b = src.indexOf(endNeedle, a);
  if (b < 0) return null;
  return src.slice(a, b + endNeedle.length);
}

const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const CART_PAGE = "src/pages/customer/CartPage.tsx";
const STORE = "src/stores/cart.ts";
const RAZORPAY_HOOK = "src/hooks/use-razorpay.ts";
const ORDERS = "convex/orders.ts";
const RAZORPAY_ORDERS = "convex/razorpay.ts";
const VARIANT_EDITOR = "src/components/customer/CartVariantEditor.tsx";
const CARD = "src/components/customer/ProductCard.tsx";
const COMBO = "src/components/customer/ComboCard.tsx";
const PACK = "src/components/customer/PartyPackCard.tsx";

console.log("\n=== PHASE 21D-D CHECKOUT QUANTITY STRUCTURAL TESTS ===\n");

// ---------------------------------------------------------------------------
console.log("1. Checkout exposes quantity editing");
// ---------------------------------------------------------------------------
check(
  "1a. CheckoutPage imports the shared QuantitySelector control",
  matches(CHECKOUT, /import \{ QuantitySelector \} from "@\/components\/customer"/),
);
check(
  "1b. Order Summary lines render a QuantitySelector",
  matches(CHECKOUT, /<QuantitySelector\s+value=\{item\.quantity\}/),
);
check(
  "1c. Quantity changes route through handleCheckoutQuantityChange",
  matches(CHECKOUT, /onChange=\{\(qty\) =>\s*handleCheckoutQuantityChange\(/),
);
check(
  "1d. Stepper minimum is 1 (checkout can never zero a line)",
  matches(CHECKOUT, /<QuantitySelector[\s\S]{0,400}?min=\{1\}/),
);

// ---------------------------------------------------------------------------
console.log("2. updateQuantity is the only quantity authority");
// ---------------------------------------------------------------------------
check(
  "2a. Handler calls the existing store updateQuantity",
  has(CHECKOUT, "updateQuantity(cartItemId, quantity)"),
);
check(
  "2b. Exactly one updateQuantity call site (no second update path)",
  count(CHECKOUT, "updateQuantity(") === 1,
  `found ${count(CHECKOUT, "updateQuantity(")}`,
);
check(
  "2c. No local quantity state exists in CheckoutPage",
  lacks(CHECKOUT, "setQuantity(") &&
    lacks(CHECKOUT, "const [quantity") &&
    lacks(CHECKOUT, "const [qty"),
);

// ---------------------------------------------------------------------------
console.log("3. cartItemId is the update identity");
// ---------------------------------------------------------------------------
check(
  "3a. Handler signature keys on cartItemId",
  has(CHECKOUT, "(cartItemId: string, nextQuantity: number)"),
);
check(
  "3b. onChange passes this line's item.cartItemId",
  matches(CHECKOUT, /handleCheckoutQuantityChange\(\s*item\.cartItemId \?\? "cl_0",\s*qty,/),
);
check(
  "3c. Summary rows are keyed by cartItemId",
  matches(CHECKOUT, /key=\{item\.cartItemId \?\? /),
);
check(
  "3d. Per-line pending guard is keyed by cartItemId",
  has(CHECKOUT, 'pendingQtyIds.has(item.cartItemId ?? "cl_0")'),
);

// ---------------------------------------------------------------------------
console.log("4. Invalid quantities are prevented");
// ---------------------------------------------------------------------------
check(
  "4a. Non-finite input rejected",
  has(CHECKOUT, "!Number.isFinite(nextQuantity)"),
);
check(
  "4b. Value clamped to integers within 1..99",
  has(CHECKOUT, "Math.max(1, Math.min(99, Math.floor(nextQuantity)))"),
);

// ---------------------------------------------------------------------------
console.log("5. variantName is not changed by quantity editing");
// ---------------------------------------------------------------------------
const handler = between(
  CHECKOUT,
  "const handleCheckoutQuantityChange",
  "[checkoutQtyLocked, pendingQtyIds, updateQuantity],",
);
check(
  "5a. Quantity handler exists",
  handler !== null,
);
check(
  "5b. Handler body never touches variantName or updateVariant",
  handler !== null &&
    !handler.includes("variantName") &&
    !handler.includes("updateVariant"),
);
check(
  "5c. Cart store (merge/variant semantics) untouched this phase",
  diffOf(STORE) === "",
);

// ---------------------------------------------------------------------------
console.log("6. No duplicate rapid-click update path");
// ---------------------------------------------------------------------------
check(
  "6a. Per-line pending set blocks re-entry while a write settles",
  has(CHECKOUT, "if (pendingQtyIds.has(cartItemId)) return;"),
);
check(
  "6b. Control disables while its line is pending or payment-locked",
  count(CHECKOUT, "disabled={lineQtyLocked}") >= 2,
  `found ${count(CHECKOUT, "disabled={lineQtyLocked}")}`,
);
check(
  "6c. Guard releases per-line (other lines never blocked globally)",
  matches(CHECKOUT, /next\.delete\(cartItemId\)/),
);

// ---------------------------------------------------------------------------
console.log("7. Payment / Razorpay architecture preserved");
// ---------------------------------------------------------------------------
check(
  "7a. Payment boundary lock expression present",
  has(CHECKOUT, "isSubmitting || paymentStatus !== \"idle\" || pendingOrder !== null"),
);
check(
  "7b. Retry flow still charges the fixed pendingOrder.amount",
  has(CHECKOUT, "amount: pendingOrder.amount"),
);
check(
  "7c. Razorpay launch flow unchanged",
  has(CHECKOUT, "openRazorpayCheckout("),
);
check(
  "7d. use-razorpay hook untouched",
  diffOf(RAZORPAY_HOOK) === "",
);
check(
  "7e. convex/razorpay.ts untouched",
  diffOf(RAZORPAY_ORDERS) === "",
);

// ---------------------------------------------------------------------------
console.log("8. Cart variant editor untouched");
// ---------------------------------------------------------------------------
check(
  "8a. CartVariantEditor.tsx has no diff",
  diffOf(VARIANT_EDITOR) === "",
);
check(
  "8b. Checkout does NOT import/embed variant editing",
  lacks(CHECKOUT, "CartVariantEditor"),
);

// ---------------------------------------------------------------------------
console.log("9. Mixed-BU protections preserved");
// ---------------------------------------------------------------------------
check(
  "9a. Server mixed-BU gate string still handled",
  has(CHECKOUT, "MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED"),
);
check(
  "9b. Displayed lines still scoped to the selected BU",
  has(CHECKOUT, "item.businessUnitId === selectedCheckoutBU"),
);
check(
  "9c. Quantity editing only renders for selected-BU checkoutItems",
  matches(CHECKOUT, /checkoutItems\.map\(\(item\) => \{[\s\S]{0,7000}?handleCheckoutQuantityChange/),
);

// ---------------------------------------------------------------------------
console.log("10. Server price authority preserved");
// ---------------------------------------------------------------------------
check(
  "10a. convex/orders.ts untouched",
  diffOf(ORDERS) === "",
);
check(
  "10b. Submit still posts pricing.total from the reactive pipeline",
  has(CHECKOUT, "total: pricing.total"),
);
check(
  "10c. Server-authoritative orders.create still the submit path",
  has(CHECKOUT, "api.orders.create"),
);

// ---------------------------------------------------------------------------
console.log("11. 21D-C stale-price implementation not weakened");
// ---------------------------------------------------------------------------
check(
  "11a. CartPage stale-price threshold unchanged (0.02)",
  has(CART_PAGE, "STALE_PRICE_THRESHOLD = 0.02"),
);
check(
  "11b. CartPage stale-price indicator + remedy intact",
  has(CART_PAGE, "Price changed") && has(CART_PAGE, "resolveCurrentLinePrice"),
);
check(
  "11c. CartPage untouched this phase",
  diffOf(CART_PAGE) === "",
);
check(
  "11d. Checkout mirrors the same 0.02 threshold",
  has(CHECKOUT, "STALE_PRICE_THRESHOLD = 0.02"),
);
check(
  "11e. Checkout surfaces Price changed + Update price before payment",
  has(CHECKOUT, "Price changed") && has(CHECKOUT, "aria-label={`Update price of ${item.name}`}"),
);
check(
  "11f. Checkout Update price disabled across the payment boundary",
  matches(CHECKOUT, /disabled=\{lineQtyLocked\}\s+onClick=\{\(\) => \{\s*const applied = updateVariant\(/),
);

// ---------------------------------------------------------------------------
console.log("12. Protected files outside the phase diff");
// ---------------------------------------------------------------------------
const protectedFiles = [
  ORDERS,
  "convex/inventory.ts",
  "convex/orderWorkflow.ts",
  RAZORPAY_ORDERS,
  "convex/razorpayWebhook.ts",
  "convex/notificationService.ts",
  STORE,
  RAZORPAY_HOOK,
  VARIANT_EDITOR,
  CARD,
  COMBO,
  PACK,
];
const dirtyProtected = protectedFiles.filter((f) => diffOf(f) !== "");
check(
  "12a. None of the 12 protected files modified",
  dirtyProtected.length === 0,
  dirtyProtected.join(", "),
);

let changed = [];
try {
  changed = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  /* leave empty */
}
const allowed = new Set([
  CHECKOUT,
  "tests/21d_d_checkout_quantity.mjs",
  // Narrow baseline/harness sync (explicitly reported): T12.5 post-commit
  // baseline + T13.1 sanctioned 21D-D set in the 21D-C suite.
  "tests/21d_c_cart_configuration.mjs",
  // Phase 21D-H working-tree scope (explicitly reported): ProductPage
  // add-to-cart fix + the 21D-G2 suite harness sync.
  "src/pages/customer/ProductPage.tsx",
  "tests/21d_g2_destination_city_state.mjs",
  "tests/21c_catalog_ia.mjs",
]);
const unexpected = changed.filter((f) => !allowed.has(f));
check(
  "12b. Phase diff limited to CheckoutPage (+ this test)",
  unexpected.length === 0 && changed.includes(CHECKOUT),
  unexpected.join(", ") || "CheckoutPage missing from diff",
);

// ---------------------------------------------------------------------------
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("Failed:\n - " + failures.join("\n - "));
  process.exit(1);
}
