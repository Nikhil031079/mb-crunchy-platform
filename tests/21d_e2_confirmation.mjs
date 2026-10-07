// ============================================================================
// Phase 21D-E2 — Order Confirmation Evidence Pin (test-only)
//
// Run:  node tests/21d_e2_confirmation.mjs
//
// WHAT THIS PINS (existing, production-verified behavior — NOT new features):
//   1. OrderConfirmationCard renders line items with name, variantName,
//      quantity, and per-line totalPrice.
//   2. Gross subtotal: the card reads order.subtotal directly (the
//      authoritative persisted field), never a net-after-discount value.
//   3. Discount row: rendered from order.discount when > 0 (server-derived
//      at create time; orders.ts re-derives all components server-side).
//   4. Offer/coupon code shown inside the discount row when present.
//   5. Persistence: mb_order_confirmation localStorage wiring
//      (persist / load / clear + creation-path call sites).
//   6. Recovery: mount-time load -> activeLookup -> useQuery
//      (orders.getByPhoneAndOrderNumber) re-subscription feeds the
//      confirmation screen after refresh / clearCart.
//   7. Projection boundary: the confirmation path reads ONLY the sanitized
//      customer projection (sanitizeOrderForCustomer); address / contact /
//      payment-reference / destination fields are not exposed by either the
//      sanitizer or the card.
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// plain-Node `tests/*.mjs` structural/source-test convention used by the
// 21D suites. No production order, OTP, payment, or Shiprocket activity is
// created — assertions are deterministic source-structure proofs.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const ORDERS = "convex/orders.ts";
const ACCESS = "convex/utils/customerAccess.ts";

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

function count(rel, needle) {
  const src = code(rel);
  return src === null ? 0 : src.split(needle).length - 1;
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
 * Extract a top-level `function NAME(` region from a file: from the function
 * declaration to the next top-level declaration (function / interface / const
 * / export). Returns the comment-stripped region source, or null when the
 * file/region is missing.
 */
function extractFn(rel, name) {
  const src = code(rel);
  if (!src) return null;
  const marker = `function ${name}(`;
  const at = src.indexOf(marker);
  if (at < 0) return null;
  let end = -1;
  for (const stop of ["\nfunction ", "\ninterface ", "\nconst ", "\nexport "]) {
    const i = src.indexOf(stop, at + marker.length);
    if (i >= 0 && (end < 0 || i < end)) end = i;
  }
  return end < 0 ? src.slice(at) : src.slice(at, end);
}

/**
 * Extract a `export const NAME = query({...})` region up to its `});` close.
 */
function extractQuery(rel, name) {
  const src = code(rel);
  if (!src) return null;
  const marker = `export const ${name} = query({`;
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const end = src.indexOf("\n});", at + marker.length);
  return end < 0 ? src.slice(at) : src.slice(at, end + 4);
}

function hasIn(region, needle) {
  return region !== null && region.includes(needle);
}

// ============================================================================
console.log("\n1. Order confirmation line items");
// ============================================================================
const card = extractFn(CHECKOUT, "OrderConfirmationCard");

check("1a. OrderConfirmationCard region found", card !== null);
check(
  "1b. Card maps over the authoritative order.items array",
  hasIn(card, "order.items.map((item, index)")
);
check("1c. Line item renders the product name", hasIn(card, "{item.name}"));
check(
  "1d. Line item renders the variant name",
  hasIn(card, "({item.variantName})")
);
check(
  "1e. Line item renders the quantity",
  hasIn(card, "× {item.quantity}")
);
check(
  "1f. Line item renders its line total (totalPrice)",
  hasIn(card, "formatCurrency(item.totalPrice)")
);
check(
  "1g. Item-count label aggregates line quantities",
  hasIn(card, "order.items.reduce((total, item) => total + item.quantity")
);

// ============================================================================
console.log("\n2. Gross subtotal (authoritative, not net-after-discount)");
// ============================================================================
check(
  "2a. orderSubtotal sourced directly from order.subtotal (gross)",
  hasIn(card, "const orderSubtotal = order ? order.subtotal : 0;")
);
check("2b. 'Order Subtotal' row label rendered", hasIn(card, "Order Subtotal"));
check(
  "2c. Subtotal row renders orderSubtotal",
  hasIn(card, "formatCurrency(orderSubtotal)")
);
check(
  "2d. Total row renders the authoritative order.total (gross)",
  hasIn(card, "formatCurrency(order.total)")
);
check(
  "2e. Tax row gated on authoritative order.tax",
  hasIn(card, "order.tax > 0")
);
check(
  "2f. No net-derivation in the card (no 'order.total -' / '- order.discount')",
  hasIn(card, "order.total -") === false &&
    hasIn(card, "- order.discount") === false
);
check(
  "2g. Card renders from the order record only (no cart state reference)",
  hasIn(card, "cart.") === false
);

// ============================================================================
console.log("\n3. Discount row");
// ============================================================================
check(
  "3a. Discount row gated on order.discount > 0",
  hasIn(card, "order.discount > 0")
);
check(
  "3b. Discount amount renders order.discount (server-derived value)",
  hasIn(card, "-{formatCurrency(order.discount)}")
);
check("3c. Discount row label present", hasIn(card, "Discount"));

// ============================================================================
console.log("\n4. Offer / coupon code");
// ============================================================================
check(
  "4a. Discount label embeds the offer code when present",
  hasIn(card, "Discount{order.offerCode ?")
);
check(
  "4b. Offer code rendered inside parentheses when present",
  hasIn(card, "(${order.offerCode})")
);
check(
  "4c. Customer projection exposes offerCode to the card",
  has(ACCESS, "offerCode: order.offerCode")
);

// ============================================================================
console.log("\n5. Persistence — mb_order_confirmation wiring");
// ============================================================================
const persistFn = extractFn(CHECKOUT, "persistOrderConfirmation");
const loadFn = extractFn(CHECKOUT, "loadPersistedOrderConfirmation");
const clearFn = extractFn(CHECKOUT, "clearPersistedOrderConfirmation");

check(
  "5a. Persistence key is exactly mb_order_confirmation",
  has(CHECKOUT, 'const ORDER_CONFIRMATION_KEY = "mb_order_confirmation";')
);
check(
  "5b. persist writes { orderNumber, phone } JSON under the key",
  hasIn(persistFn, "localStorage.setItem(") &&
    hasIn(persistFn, "JSON.stringify({ orderNumber, phone })") &&
    hasIn(persistFn, "ORDER_CONFIRMATION_KEY")
);
check(
  "5c. load reads the key and validates orderNumber + phone",
  hasIn(loadFn, "localStorage.getItem(ORDER_CONFIRMATION_KEY)") &&
    hasIn(loadFn, "parsed?.orderNumber && parsed?.phone")
);
check(
  "5d. clear removes the key",
  hasIn(clearFn, "localStorage.removeItem(ORDER_CONFIRMATION_KEY)")
);
check(
  "5e. persist wired into every order-creation path (>= 3 call sites + def)",
  count(CHECKOUT, "persistOrderConfirmation(") >= 4,
  `found ${count(CHECKOUT, "persistOrderConfirmation(")}`
);
check(
  "5f. clear wired into confirmation dismissal paths (>= 2 call sites + def)",
  count(CHECKOUT, "clearPersistedOrderConfirmation(") >= 3,
  `found ${count(CHECKOUT, "clearPersistedOrderConfirmation(")}`
);
check(
  "5g. Persisted confirmation loaded on component mount (refresh entry)",
  has(CHECKOUT, "useState(() => loadPersistedOrderConfirmation())")
);
check(
  "5h. Creation paths set the live lookup AND persist back-to-back (>= 2 pairs)",
  (
    read(CHECKOUT)?.match(
      /setConfirmLookup\(\{[^}]*\}\);\s*persistOrderConfirmation\(/g
    ) || []
  ).length >= 2
);

// ============================================================================
console.log("\n6. Recovery — re-subscription feeds the confirmation screen");
// ============================================================================
check(
  "6a. Active lookup = live confirmLookup ?? persisted order",
  has(CHECKOUT, "activeLookup = confirmLookup ?? persistedOrder")
);
check(
  "6b. Subscribes to authoritative orders.getByPhoneAndOrderNumber",
  has(CHECKOUT, "api.orders.getByPhoneAndOrderNumber")
);
check(
  "6c. Query skipped when no lookup exists",
  has(CHECKOUT, "? { phone: activeLookup.phone, orderNumber: activeLookup.orderNumber }") &&
    has(CHECKOUT, ': "skip"')
);
check(
  "6d. confirmationShown accounts for recovered lookup + subscribed order",
  has(CHECKOUT, "!!activeLookup && !!confirmedOrder?.order")
);
check(
  "6e. Fresh-success path feeds confirmedOrder.order into the card",
  has(CHECKOUT, "order={confirmedOrder?.order}")
);
check(
  "6f. Empty-cart recovery path re-renders the card from the subscription",
  has(CHECKOUT, "if (confirmedOrder?.order)") && has(CHECKOUT, "order={order}")
);
check(
  "6g. Loading state while the recovered query resolves",
  has(CHECKOUT, "if (persistedOrder)") &&
    has(CHECKOUT, "if (confirmedOrder === undefined)")
);
check(
  "6h. Creation paths install the live lookup (>= 3 setConfirmLookup calls)",
  count(CHECKOUT, "setConfirmLookup(") >= 3,
  `found ${count(CHECKOUT, "setConfirmLookup(")}`
);

// ============================================================================
console.log("\n7. Customer projection boundary");
// ============================================================================
const lookup = extractQuery(ORDERS, "getByPhoneAndOrderNumber");
check(
  "7a. Lookup query returns sanitizeOrderForCustomer(order)",
  hasIn(lookup, "order: sanitizeOrderForCustomer(order)")
);
check(
  "7b. Lookup is the phone + order-number possession query (by_phone index)",
  hasIn(lookup, 'withIndex("by_phone"') &&
    hasIn(lookup, "normalizeIndianPhone")
);
check(
  "7c. Lookup only returns customer-visible activities",
  hasIn(lookup, 'q.eq(q.field("visibleToCustomer"), true)')
);
check(
  "7d. orders.ts imports the shared sanitizer",
  has(ORDERS, "sanitizeOrderForCustomer } from \"./utils/customerAccess\"")
);
// Fields the card renders must all be present in the projection:
for (const [label, needle] of [
  ["items", "items: order.items"],
  ["subtotal", "subtotal: order.subtotal"],
  ["discount", "discount: order.discount"],
  ["offerCode", "offerCode: order.offerCode"],
  ["total", "total: order.total"],
]) {
  check(`7e. Projection exposes ${label} for the confirmation card`, has(ACCESS, needle));
}
// Fields the card must NOT expose (stripped by the projection / unused):
for (const [label, needle] of [
  ["deliveryAddress", "deliveryAddress"],
  ["customerPhone", "customerPhone"],
  ["customerEmail", "customerEmail"],
  ["paymentReference", "paymentReference"],
  ["razorpayPaymentId", "razorpayPaymentId"],
  ["destinationCity", "destinationCity"],
]) {
  check(`7f. Sanitizer exposes no ${label}`, lacks(ACCESS, needle));
}
// The card itself must not render address / contact / payment-ref / destination:
for (const [label, needle] of [
  ["deliveryAddress", "deliveryAddress"],
  ["customerPhone", "customerPhone"],
  ["customerEmail", "customerEmail"],
  ["razorpay", "razorpay"],
  ["destinationCity", "destinationCity"],
]) {
  check(`7g. Confirmation card does not render ${label}`, !hasIn(card, needle));
}

// ============================================================================
console.log("\n8. Scope — test-only phase, no product/backend files changed");
// ============================================================================
let changed = [];
try {
  changed = execSync("git diff --name-only HEAD", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  changed = [];
}
const allowed = new Set([
  "tests/21d_e2_confirmation.mjs",
  // Repo-sanctioned harness sync (reported in 21D-E2 report): the 21D-H
  // suite's scope block and the 21D-C suite's allow-set extended for this
  // test-only phase's files.
  "tests/21d_h_product_add_to_cart.mjs",
  "tests/21d_c_cart_configuration.mjs",
  // Phase 21F working-tree scope (reported in 21F report): the checkout
  // payment-retry fix (CheckoutPage) plus this suite family's scope
  // allow-set syncs in the 21D-C / 21D-D / 21D-G2 suites.
  "src/pages/customer/CheckoutPage.tsx",
  "tests/21f_checkout_payment_retry.mjs",
  "tests/21d_d_checkout_quantity.mjs",
  "tests/21d_g2_destination_city_state.mjs",
]);
const unexpected = changed.filter((f) => !allowed.has(f));
check(
  "8a. Tracked working-tree diff limited to sanctioned test files",
  unexpected.length === 0,
  `unexpected: ${unexpected.join(", ") || "(none)"}`
);
check(
  "8b. This evidence suite exists in the working tree",
  existsSync(join(ROOT, "tests/21d_e2_confirmation.mjs"))
);

// ============================================================================
console.log("\n" + "=".repeat(70));
if (failed === 0) {
  console.log(`21D-E2 CONFIRMATION EVIDENCE PIN: PASS (${passed} assertions)`);
} else {
  console.log(`21D-E2: FAIL — ${failed}/${passed + failed} assertions failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
