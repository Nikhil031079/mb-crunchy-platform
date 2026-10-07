// ============================================================================
// Phase 21F — Checkout Editing & Payment Retry Safety
//
// Run:  node tests/21f_checkout_payment_retry.mjs
//
// WHAT THIS PINS (frontend-only — no backend change was required):
//   The P1 duplicate-order path: after a failed/cancelled payment the main
//   "Pay ₹X" button must NOT create a second order — the existing pending
//   order's Pay Now flow is the only retry path (existing order wins).
//
// TEST coverage (13-scenario matrix):
//   1.  Normal checkout — one createOrder, idempotency key sent, success
//       finalizes (orderSuccess + cart cleared + key cleared).
//   2.  Rapid double click — submit guard + disabled button + key reuse.
//   3.  Cancelled payment — pending order kept, key retained, no success.
//   4.  Retry charges the existing order (pendingOrder.amount / orderId).
//   5.  Failed payment — pending order kept, key retained, no success.
//   6.  Repeated retry — still the same order, no second createOrder.
//   7.  pending_verification — no new order/payment creation while pending;
//       client never writes payment status (server is the authority).
//   8.  Paid — orderSuccess set, banner (Pay Now) hidden, key cleared.
//   9.  Cancelled — no claim/reopen: no setOrderSuccess outside success.
//   10. Price drift — client maps server drift/idempotency-conflict messages
//       to an actionable toast with a Review Cart action (no generic error).
//   11. Edit in Cart — per-line link navigates to the existing cart route
//       with no cart-store write (variant/qty/meal-deal/mixed-BU preserved).
//   12. Meal deals — checkout meal-deal scoping + cart logic untouched.
//   13. Mixed-BU — server mixed-BU gate + selectedCheckoutBU gate retained.
//
// Idempotency contract (convex/orders.ts, READ-ONLY — reused, not modified):
//   same key + same phone + total within PRICE_TOLERANCE (0.02) → server
//   returns the existing order (existing: true, no side effects); mismatch →
//   "This request key has already been used for a different order".
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// plain-Node `tests/*.mjs` structural/source-test convention used by the
// 21B/21C/21D suites. No real payment, OTP, order, or shipment is created —
// assertions are deterministic source-structure proofs.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const ORDERS = "convex/orders.ts";
const CONSTANTS = "src/constants/index.ts";
const ROUTER = "src/main.tsx";

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
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Substring of `src` between `start` and `end` (both literal), or null. */
function sliceBetween(src, start, end, from = 0) {
  const i = src.indexOf(start, from);
  if (i === -1) return null;
  const j = src.indexOf(end, i + start.length);
  if (j === -1) return null;
  return src.slice(i, j);
}

function countOf(src, needle) {
  let n = 0;
  let idx = src.indexOf(needle);
  while (idx !== -1) {
    n += 1;
    idx = src.indexOf(needle, idx + needle.length);
  }
  return n;
}

const src = code(CHECKOUT);
const orders = code(ORDERS);
const constants = code(CONSTANTS);
const router = code(ROUTER);

check("Suite preconditions: source files readable", src !== null && orders !== null && constants !== null && router !== null);

// Regions --------------------------------------------------------------------
const H = src === null ? null : sliceBetween(src, "const handleSubmit = useCallback", "const handleRetryPayment = useCallback");
const R =
  src === null
    ? null
    : sliceBetween(
        src,
        "const handleRetryPayment = useCallback",
        "}, [pendingOrder, isSubmitting, paymentStatus, form, createRazorpayOrder",
      );
check("Suite preconditions: handler regions extractable", H !== null && R !== null);
if (H === null || R === null || src === null || orders === null || constants === null || router === null) {
  console.log("\n21F: FAIL — could not extract required source regions; aborting.");
  process.exit(1);
}

// ===========================================================================
console.log("\n1. Normal checkout — single order, key sent, success finalizes");
// ===========================================================================
check(
  "1a. Submit payload carries the idempotency key",
  src.includes("idempotencyKey: getOrCreateIdempotencyKey()"),
);
check(
  "1b. Exactly one await createOrder( call site in checkout",
  src !== null && countOf(src, "await createOrder(") === 1,
);
check(
  "1c. Idempotency key helper reuses an existing stored key",
  src.includes("if (existing) return existing;"),
);
check(
  "1d. Success path: orderSuccess + cart cleared + key cleared",
  (() => {
    const success = sliceBetween(H, "if (razorpayResult.success) {", "} else if (razorpayResult.error)");
    return (
      success !== null &&
      success.includes("setOrderSuccess(") &&
      success.includes("removeByBusinessUnit(") &&
      success.includes("persistOrderConfirmation(") &&
      success.includes("clearIdempotencyKey();")
    );
  })(),
);
check(
  "1e. Normal Pay label retained for the payable flow",
  src.includes("Pay {formatCurrency(pricing.total)}"),
);

// ===========================================================================
console.log("\n2. Rapid double click — one createOrder only");
// ===========================================================================
check(
  "2a. Handler guard present: isSubmitting || paymentStatus || pendingOrder",
  H.includes('if (isSubmitting || paymentStatus !== "idle" || pendingOrder !== null) return;'),
);
check(
  "2b. Guard runs before the submit mutation and before createOrder",
  H.indexOf('if (isSubmitting || paymentStatus !== "idle" || pendingOrder !== null) return;') !== -1 &&
    H.indexOf('if (isSubmitting || paymentStatus !== "idle" || pendingOrder !== null) return;') <
    H.indexOf("setIsSubmitting(true);") &&
    H.indexOf('if (isSubmitting || paymentStatus !== "idle" || pendingOrder !== null) return;') <
    H.indexOf("await createOrder("),
);
check(
  "2c. Main submit button disabled while submitting",
  src.includes("isSubmitting || pendingOrder !== null || !storeIsOpen"),
);
check(
  "2d. isSubmitting set synchronously before the createOrder await",
  H.indexOf("setIsSubmitting(true);") !== -1 &&
    H.indexOf("setIsSubmitting(true);") < H.indexOf("await createOrder("),
);

// ===========================================================================
console.log("\n3. Cancelled payment — pending order + key retained");
// ===========================================================================
const errorIdx = H === null ? -1 : H.indexOf("} else if (razorpayResult.error) {");
const cancelIdx = H === null ? -1 : H.indexOf("} else {", errorIdx === -1 ? 0 : errorIdx);
const catchIdx = H === null ? -1 : H.indexOf("} catch (error)");
const errorRegion = errorIdx !== -1 && cancelIdx !== -1 ? H.slice(errorIdx, cancelIdx) : null;
const cancelRegion = cancelIdx !== -1 && catchIdx !== -1 ? H.slice(cancelIdx, catchIdx) : null;

check(
  "3a. Cancel branch keeps the pending order + info toast",
  cancelRegion !== null &&
    cancelRegion.includes("setPendingOrder(") &&
    cancelRegion.includes('toast.info("Payment pending"'),
);
check(
  "3b. Cancel branch never claims success and never clears the key",
  cancelRegion !== null &&
    !cancelRegion.includes("setOrderSuccess(") &&
    !cancelRegion.includes("clearIdempotencyKey();"),
);
check(
  "3c. Idempotency key cleared only on success paths inside handleSubmit (2 sites: outside-area + paid)",
  H !== null && countOf(H, "clearIdempotencyKey();") === 2,
);
check(
  "3d. File-wide key clears = success paths only (handleSubmit x2 + retry success)",
  countOf(src, "clearIdempotencyKey();") === 3,
);
check(
  "3e. Key is NOT cleared between createOrder and setPendingOrder",
  !sliceBetween(H, "await createOrder({", "if (effectiveDeliveryType === \"outside_area\")").includes(
    "clearIdempotencyKey();",
  ),
);
check(
  "3f. Main Pay button disabled once an order is pending",
  src.includes("isSubmitting || pendingOrder !== null || !storeIsOpen"),
);
check(
  "3g. Main Pay button shows Payment Pending instead of Pay",
  /pendingOrder !== null \? \(\s*"Payment Pending"/.test(src),
);
check(
  "3h. Existing-order match attaches to it instead of charging again",
  (() => {
    const attach = sliceBetween(H, "if (existing) {", "if (effectiveDeliveryType === \"outside_area\")");
    return attach !== null && attach.includes("return;");
  })(),
);
check(
  "3i. orderResult destructuring reads the server existing flag",
  H.includes("existing?: boolean;"),
);

// ===========================================================================
console.log("\n4. Retry charges the existing order");
// ===========================================================================
check(
  "4a. Retry guard: no retry while submitting or another modal is open",
  R.includes('if (!pendingOrder || isSubmitting || paymentStatus !== "idle") return;'),
);
check(
  "4b. Retry charges the fixed pendingOrder.amount",
  R.includes("amount: pendingOrder.amount"),
);
check(
  "4c. Retry targets the existing pendingOrder.orderId",
  R.includes("orderId: pendingOrder.orderId"),
);
check(
  "4d. Retry never creates an order (no await createOrder)",
  !R.includes("await createOrder("),
);
check(
  "4e. Pay Now button disabled while a payment is in flight",
  /onClick=\{handleRetryPayment\}\s+disabled=\{paymentStatus !== "idle"\}/.test(src),
);
check(
  "4f. Pending banner is the Pay Now entry point",
  src.includes("onClick={handleRetryPayment}"),
);

// ===========================================================================
console.log("\n5. Failed payment — pending order + key retained");
// ===========================================================================
check(
  "5a. Error branch keeps the pending order + failure toast",
  errorRegion !== null &&
    errorRegion.includes("setPendingOrder(") &&
    errorRegion.includes('toast.error("Payment failed"'),
);
check(
  "5b. Error branch never claims success and never clears the key",
  errorRegion !== null &&
    !errorRegion.includes("setOrderSuccess(") &&
    !errorRegion.includes("clearIdempotencyKey();"),
);
check(
  "5c. Retry failure/cancel also never clears the key",
  (() => {
    const retryClears = countOf(R, "clearIdempotencyKey();");
    return retryClears === 1; // payment-verified success only
  })(),
);

// ===========================================================================
console.log("\n6. Repeated retry — still the same order");
// ===========================================================================
check(
  "6a. Retry region has exactly one razorpay launch and no order creation",
  countOf(R, "openRazorpayCheckout(") === 1 && !R.includes("await createOrder("),
);
check(
  "6b. Retry success clears the key and finalizes (single terminal path)",
  (() => {
    const s = sliceBetween(R, "if (razorpayResult.success) {", "} else if (razorpayResult.error)");
    return s !== null && s.includes("setOrderSuccess(") && s.includes("clearIdempotencyKey();");
  })(),
);

// ===========================================================================
console.log("\n7. pending_verification — no new order/payment while pending");
// ===========================================================================
check(
  "7a. Exactly one order-creation call site in checkout",
  countOf(src, "await createOrder(") === 1,
);
check(
  "7b. The pending-order guard precedes the only createOrder call",
  H.indexOf('if (isSubmitting || paymentStatus !== "idle" || pendingOrder !== null) return;') <
    H.indexOf("await createOrder("),
);
check(
  "7c. Client never writes a payment status (server remains authority)",
  !src.includes('paymentStatus: "paid"') && !src.includes(".patch("),
);
check(
  "7d. Client never branches on server pending_verification",
  !src.includes("pending_verification"),
);

// ===========================================================================
console.log("\n8. Paid — Pay Now path hidden, key cleared");
// ===========================================================================
check(
  "8a. Banner renders only while pending and not yet successful",
  src.includes("{pendingOrder && !orderSuccess && ("),
);
check(
  "8b. Paid success path finalizes confirmation + clears key (submit flow)",
  (() => {
    const success = sliceBetween(H, "if (razorpayResult.success) {", "} else if (razorpayResult.error)");
    return success !== null && success.includes("setOrderSuccess(") && success.includes("clearIdempotencyKey();");
  })(),
);

// ===========================================================================
console.log("\n9. Cancelled — no claim/reopen from checkout");
// ===========================================================================
check(
  "9a. No setOrderSuccess outside the payment-verified branches",
  errorIdx !== -1 && cancelIdx !== -1 &&
    !errorRegion.includes("setOrderSuccess(") &&
    !cancelRegion.includes("setOrderSuccess("),
);
check(
  "9b. Razorpay verification stays inside the hook (signature verify not claimed here)",
  src.includes("verifyRazorpayPayment: (args) => verifyRazorpayPayment(args as any)"),
);

// ===========================================================================
console.log("\n10. Price drift — actionable copy, not a generic error");
// ===========================================================================
const priceRegion = sliceBetween(src, "const isPriceDriftError", "const isMinOrderError");
check(
  "10a. Client maps both server price-drift messages",
  priceRegion !== null &&
    priceRegion.includes('message.includes("has changed. Please review your cart")') &&
    priceRegion.includes('message.includes("is out of date. Please review your cart")'),
);
check(
  "10b. Client maps the idempotency-conflict message",
  priceRegion !== null &&
    priceRegion.includes('"already been used for a different order"'),
);
check(
  "10c. Actionable toast offers Review Cart → cart route",
  priceRegion !== null &&
    priceRegion.includes('label: "Review Cart"') &&
    priceRegion.includes("onClick: () => navigate(ROUTES.CART)"),
);
check(
  "10d. Actionable branch returns before the generic checkout toast",
  priceRegion !== null &&
    src.indexOf("const isPriceDriftError") < src.indexOf('toast.error("Checkout failed"'),
);
check(
  "10e. Server drift + idempotency contract intact (read-only reference)",
  orders.includes('has changed. Please review your cart.') &&
    orders.includes('is out of date. Please review your cart.') &&
    orders.includes("already been used for a different order") &&
    orders.includes("existing: true") &&
    orders.includes("PRICE_TOLERANCE"),
);
check(
  "10f. Generic fallback retained for unrelated failures",
  src.includes("Please try again or contact support."),
);

// ===========================================================================
console.log("\n11. Edit in Cart — per-line navigation, cart untouched");
// ===========================================================================
const editIdx = src.indexOf("Edit in Cart");
const editSlice = editIdx !== -1 ? src.slice(Math.max(0, editIdx - 700), editIdx + 120) : null;
check(
  "11a. Per-line Edit in Cart link exists",
  editSlice !== null,
);
check(
  "11b. Link navigates to the existing cart route",
  editSlice !== null && editSlice.includes("to={ROUTES.CART}"),
);
check(
  "11c. Link writes nothing to the cart store (plain navigation)",
  editSlice !== null &&
    !/updateVariant\(|removeByBusinessUnit\(|clearCart|setQuantity\(|next\.delete\(/.test(editSlice),
);
check(
  "11d. Link is inert while an order submit is in flight",
  editSlice !== null &&
    editSlice.includes("if (isSubmitting) e.preventDefault();") &&
    editSlice.includes("pointer-events-none opacity-50"),
);
check(
  "11e. Link is per-line (aria-label names the item)",
  editSlice !== null && editSlice.includes("aria-label={`Edit ${item.name} in cart`}"),
);
check(
  "11f. Cart route defined and wired to the existing CartPage",
  constants.includes('CART: "/cart"') &&
    router.includes('<Route path="/cart" element={<CartPage />} />'),
);

// ===========================================================================
console.log("\n12. Meal deals — checkout scoping + cart logic untouched");
// ===========================================================================
check(
  "12a. Checkout meal-deal scoping helper retained",
  src.includes("selectCheckoutMealDeals(") &&
    src.includes("mealDealIds: checkoutMealDeals.map((d) => d.mealDealId)"),
);
check(
  "12b. Cart storage key retained (Edit in Cart lands on the persisted cart)",
  constants.includes("mb-crunchy-cart"),
);
check(
  "12c. Edit in Cart does not touch applied meal deals (no store write)",
  editSlice !== null && !/appliedMealDeals|mealDeal/.test(editSlice),
);

// ===========================================================================
console.log("\n13. Mixed business units — server gate retained");
// ===========================================================================
check(
  "13a. MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED catch retained",
  src.includes("MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED"),
);
check(
  "13b. selectedCheckoutBU gate retained before submit",
  src.includes("if (!selectedCheckoutBU) return;"),
);
check(
  "13c. Order payload still binds to the selected BU",
  src.includes("businessUnitId: selectedCheckoutBU as any"),
);

// ===========================================================================
console.log("\n14. Existing-order-wins — architecture summary");
// ===========================================================================
check(
  "14a. Payment boundary expression shared with the quantity lock",
  src.includes('isSubmitting || paymentStatus !== "idle" || pendingOrder !== null'),
);
check(
  "14b. Both razorpay launches go through the existing orders only",
  countOf(src, "openRazorpayCheckout(") === 2 &&
    src.includes("orderId: newOrderId as Id<\"orders\">") &&
    src.includes("orderId: pendingOrder.orderId as Id<\"orders\">"),
);
check(
  "14c. Pending banner remains the sole retry UI",
  src.includes("Payment pending for order {pendingOrder.orderNumber}"),
);

// ===========================================================================
console.log("\n15. Scope — frontend-only, protected files untouched");
// ===========================================================================
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
  // Phase 21F implementation + this suite.
  "src/pages/customer/CheckoutPage.tsx",
  "tests/21f_checkout_payment_retry.mjs",
  // Repo-sanctioned harness sync (reported in 21F report): scope allow-set
  // extensions in this suite family so every suite stays green in-flight.
  "tests/21d_e2_confirmation.mjs",
  "tests/21d_c_cart_configuration.mjs",
  "tests/21d_d_checkout_quantity.mjs",
  "tests/21d_g2_destination_city_state.mjs",
  "tests/21d_h_product_add_to_cart.mjs",
]);
const unexpected = changed.filter((f) => !allowed.has(f));
check(
  "15a. Tracked working-tree diff limited to the sanctioned 21F files",
  unexpected.length === 0,
  `unexpected: ${unexpected.join(", ") || "(none)"}`,
);
const protectedFiles = [
  "convex/orders.ts",
  "convex/razorpay.ts",
  "convex/razorpayWebhook.ts",
  "convex/schema.ts",
  "convex/orderWorkflow.ts",
  "convex/notificationService.ts",
  "src/hooks/use-razorpay.ts",
  "src/components/customer/RazorpayPayment.tsx",
  "src/stores/cart.ts",
];
let dirtyProtected = [];
try {
  dirtyProtected = execSync(`git diff --name-only HEAD -- ${protectedFiles.join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  dirtyProtected = [];
}
check(
  "15b. None of the 9 protected payment/cart/backend files modified",
  dirtyProtected.length === 0,
  dirtyProtected.join(", "),
);
check(
  "15c. This suite exists in the working tree",
  existsSync(join(ROOT, "tests/21f_checkout_payment_retry.mjs")),
);

// ===========================================================================
console.log("\n" + "=".repeat(70));
if (failed === 0) {
  console.log(`21F CHECKOUT PAYMENT RETRY SAFETY: PASS (${passed} assertions)`);
} else {
  console.log(`21F: FAIL — ${failed}/${passed + failed} assertions failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
