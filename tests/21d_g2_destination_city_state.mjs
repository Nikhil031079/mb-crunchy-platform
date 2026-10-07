// ============================================================================
// Phase 21D-G2 — destination city/state data-flow (D7)
//
// Verifies the narrow address-completeness implementation:
//   - saved-address city/state is carried into the checkout form and payload
//   - CustomerLocation city/state is used only when it cannot contradict the
//     destination pincode (existing geocoding foundation, no new API)
//   - absent city/state stay undefined — never fabricated for free-text flow
//   - orders.create still receives the same address/pincode fields as before
//   - the customer sanitizer, Shiprocket adapter and protected systems are
//     untouched (D6 address exposure stays a separate decision)
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/21d_g2_destination_city_state.mjs
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

function matches(rel, re) {
  const src = code(rel);
  return src !== null && re.test(src);
}

function diffOf(rel) {
  try {
    return execSync(`git diff HEAD -- "${rel}"`, { cwd: ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const DESTINATION_UTIL = "src/utils/destinationCityState.ts";
const CUSTOMER_ACCESS = "convex/utils/customerAccess.ts";
const ORDERS = "convex/orders.ts";
const BOOKING = "convex/courier/bookingWorkflow.ts";
const ADAPTER = "convex/courier/shiprocketAdapter.ts";
const SCHEMA = "convex/schema.ts";
const ADAPTER_TEST = "tests/26f5_shiprocket_adapter_rewrite.test.ts";
const SANITIZER_PIN_TEST = "tests/10k_order_number_entropy.test.ts";

console.log("\n=== PHASE 21D-G2 DESTINATION CITY/STATE (D7) TESTS ===\n");

// ---------------------------------------------------------------------------
console.log("1. resolveDestinationCityState — saved-address path");
// ---------------------------------------------------------------------------
const resolve = (await import(`../${DESTINATION_UTIL}`)).resolveDestinationCityState;

check(
  "1a. Helper module exists and exports the resolver",
  typeof resolve === "function",
);

const savedAddress = resolve({
  orderType: "delivery",
  formCity: "Pune",
  formState: "Maharashtra",
  destinationPincode: "411038",
});
check(
  "1b. Saved-address city reaches the payload value",
  savedAddress.destinationCity === "Pune",
  `got ${JSON.stringify(savedAddress.destinationCity)}`,
);
check(
  "1c. Saved-address state reaches the payload value",
  savedAddress.destinationState === "Maharashtra",
  `got ${JSON.stringify(savedAddress.destinationState)}`,
);

const savedNoCity = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "411038",
  locationCity: "Pune",
  locationState: "Maharashtra",
  locationZipCode: "999999",
});
check(
  "1d. Saved address without city + mismatched location pincode stays undefined",
  savedNoCity.destinationCity === undefined && savedNoCity.destinationState === undefined,
  JSON.stringify(savedNoCity),
);

// ---------------------------------------------------------------------------
console.log("2. resolveDestinationCityState — location-derived path");
// ---------------------------------------------------------------------------
const locationNoPincode = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "",
  locationCity: "Pune",
  locationState: "Maharashtra",
  locationZipCode: "411038",
});
check(
  "2a. No pincode entered — location city/state used",
  locationNoPincode.destinationCity === "Pune" &&
    locationNoPincode.destinationState === "Maharashtra",
  JSON.stringify(locationNoPincode),
);

const locationMatchingPincode = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "411038",
  locationCity: "Pune",
  locationState: "Maharashtra",
  locationZipCode: "411038",
});
check(
  "2b. Location pincode matches destination pincode — city/state used",
  locationMatchingPincode.destinationCity === "Pune" &&
    locationMatchingPincode.destinationState === "Maharashtra",
  JSON.stringify(locationMatchingPincode),
);

const locationMismatch = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "560001",
  locationCity: "Pune",
  locationState: "Maharashtra",
  locationZipCode: "411038",
});
check(
  "2c. Conflicting pincode — no city/state invented from location",
  locationMismatch.destinationCity === undefined &&
    locationMismatch.destinationState === undefined,
  JSON.stringify(locationMismatch),
);

const locationUnverifiable = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "560001",
  locationCity: "Pune",
  locationState: "Maharashtra",
});
check(
  "2d. Pincode set but location has no pincode — no fallback",
  locationUnverifiable.destinationCity === undefined &&
    locationUnverifiable.destinationState === undefined,
  JSON.stringify(locationUnverifiable),
);

const formWins = resolve({
  orderType: "delivery",
  formCity: "Thane",
  formState: "Maharashtra",
  destinationPincode: "411038",
  locationCity: "Pune",
  locationState: "Maharashtra",
  locationZipCode: "411038",
});
check(
  "2e. Saved-address city wins over location city",
  formWins.destinationCity === "Thane",
  JSON.stringify(formWins),
);

const partial = resolve({
  orderType: "delivery",
  formCity: "Pune",
  formState: "",
  destinationPincode: "",
  locationCity: "Satara",
  locationState: "Maharashtra",
});
check(
  "2f. Fields resolve independently — form city + location state",
  partial.destinationCity === "Pune" && partial.destinationState === "Maharashtra",
  JSON.stringify(partial),
);

// ---------------------------------------------------------------------------
console.log("3. resolveDestinationCityState — no invention");
// ---------------------------------------------------------------------------
const empty = resolve({
  orderType: "delivery",
  formCity: "",
  formState: "",
  destinationPincode: "",
});
check(
  "3a. Nothing available — both stay undefined",
  empty.destinationCity === undefined && empty.destinationState === undefined,
  JSON.stringify(empty),
);

const whitespace = resolve({
  orderType: "delivery",
  formCity: "   ",
  formState: "\t",
  destinationPincode: "411038",
  locationCity: "  ",
  locationState: "",
});
check(
  "3b. Whitespace-only values stay undefined",
  whitespace.destinationCity === undefined && whitespace.destinationState === undefined,
  JSON.stringify(whitespace),
);

const pickup = resolve({
  orderType: "pickup",
  formCity: "Pune",
  formState: "Maharashtra",
  destinationPincode: "411038",
  locationCity: "Pune",
});
check(
  "3c. Pickup orders carry no destination city/state",
  pickup.destinationCity === undefined && pickup.destinationState === undefined,
  JSON.stringify(pickup),
);

// ---------------------------------------------------------------------------
console.log("4. CheckoutPage wiring — saved address → form → payload");
// ---------------------------------------------------------------------------
check(
  "4a. CheckoutForm declares destinationCity/destinationState",
  has(CHECKOUT, "destinationCity: string;") && has(CHECKOUT, "destinationState: string;"),
);
check(
  "4b. INITIAL_FORM starts both empty (no invented defaults)",
  has(CHECKOUT, 'destinationCity: "",') && has(CHECKOUT, 'destinationState: "",'),
);
check(
  "4c. Default-address auto-select carries saved city/state",
  has(CHECKOUT, "destinationCity: defaultAddr.city?.trim() || \"\",") &&
    has(CHECKOUT, "destinationState: defaultAddr.state?.trim() || \"\","),
);
check(
  "4d. Saved-address click handler carries saved city/state",
  has(CHECKOUT, "destinationCity: addr.city?.trim() || \"\",") &&
    has(CHECKOUT, "destinationState: addr.state?.trim() || \"\","),
);
check(
  "4e. Saved-address handlers keep existing address/notes/zip behavior",
  has(CHECKOUT, "deliveryAddress: addr.address,") &&
    has(CHECKOUT, "destinationPincode: addr.zipCode || prev.destinationPincode,") &&
    has(CHECKOUT, "deliveryAddress: defaultAddr.address,") &&
    has(CHECKOUT, "destinationPincode: defaultAddr.zipCode || prev.destinationPincode,"),
);
check(
  "4f. Payload sends the resolved destinationCity/destinationState",
  has(CHECKOUT, "destinationCity: destinationCityState.destinationCity,") &&
    has(CHECKOUT, "destinationState: destinationCityState.destinationState,"),
);
check(
  "4g. Resolution reads the existing form + location store only",
  has(CHECKOUT, "resolveDestinationCityState({") &&
    has(CHECKOUT, "formCity: form.destinationCity,") &&
    has(CHECKOUT, "locationCity: customerLocation.location?.city,") &&
    has(CHECKOUT, "locationState: customerLocation.location?.state,") &&
    has(CHECKOUT, "locationZipCode: customerLocation.location?.zipCode,"),
);
check(
  "4h. No new API/service call introduced for city/state",
  lacks(CHECKOUT, "geocode(") && lacks(DESTINATION_UTIL, "fetch("),
);

// ---------------------------------------------------------------------------
console.log("5. Manual/free-text flow — no fabricated city/state");
// ---------------------------------------------------------------------------
check(
  "5a. No manual city/state form inputs were added",
  lacks(CHECKOUT, 'updateField("destinationCity"') &&
    lacks(CHECKOUT, 'updateField("destinationState"') &&
    !matches(CHECKOUT, /destinationCity:\s*e\.target\.value/),
);
check(
  "5b. Editing the free-text address clears carried city/state",
  has(CHECKOUT, 'if (field === "deliveryAddress" || field === "destinationPincode") {') &&
    has(CHECKOUT, 'next.destinationCity = "";') &&
    has(CHECKOUT, 'next.destinationState = "";'),
);
check(
  "5c. Resolution helper never reads the free-text address",
  lacks(DESTINATION_UTIL, "deliveryAddress") && lacks(DESTINATION_UTIL, "formAddress"),
);

// ---------------------------------------------------------------------------
console.log("6. Existing address/pincode payload behavior unchanged");
// ---------------------------------------------------------------------------
check(
  "6a. destinationPincode payload line unchanged",
  has(CHECKOUT, "destinationPincode: form.destinationPincode.trim() || undefined,"),
);
check(
  "6b. deliveryAddress payload still gated on delivery orders",
  matches(
    CHECKOUT,
    /deliveryAddress:\s*\n\s*form\.orderType === "delivery"\s*\n\s*\? form\.deliveryAddress\.trim\(\)\s*\n\s*: undefined/,
  ),
);
check(
  "6c. Location coordinates still submitted as before",
  has(CHECKOUT, "customerLatitude: customerLocation.location?.latitude,") &&
    has(CHECKOUT, "customerLongitude: customerLocation.location?.longitude,"),
);
check(
  "6d. Validation rules untouched — no new required field",
  lacks(CHECKOUT, "destinationCity is required") &&
    lacks(CHECKOUT, "destinationState is required"),
);

// ---------------------------------------------------------------------------
console.log("7. Order create + Shiprocket consumption path");
// ---------------------------------------------------------------------------
check(
  "7a. orders.create still accepts destinationCity/destinationState",
  has(ORDERS, "destinationCity: v.optional(v.string()),") &&
    has(ORDERS, "destinationState: v.optional(v.string()),"),
);
check(
  "7b. orders.create still persists the existing fields",
  has(ORDERS, "destinationCity: args.destinationCity?.trim(),") &&
    has(ORDERS, "destinationState: args.destinationState?.trim(),"),
);
check(
  "7c. Shiprocket booking still reads order destination fields",
  has(BOOKING, "billing_city: order.destinationCity ?? \"\",") &&
    has(BOOKING, "shipping_city: order.destinationCity ?? \"\",") &&
    has(BOOKING, "billing_state: order.destinationState ?? \"\",") &&
    has(BOOKING, "shipping_state: order.destinationState ?? \"\","),
);
check(
  "7d. Shipment snapshot still copies destination fields",
  has(BOOKING, "destinationCity: order.destinationCity,") &&
    has(BOOKING, "destinationState: order.destinationState,"),
);
check(
  "7e. Shiprocket adapter mapping untouched",
  diffOf(ADAPTER) === "",
);
check(
  "7f. Adapter empty-string fallback for absent fields still pinned (26f5)",
  diffOf(ADAPTER_TEST) === "" && has(ADAPTER_TEST, 'expect(body.billing_city).toBe("")'),
);

// ---------------------------------------------------------------------------
console.log("8. Customer projection / D6 untouched");
// ---------------------------------------------------------------------------
check(
  "8a. Sanitizer file untouched",
  diffOf(CUSTOMER_ACCESS) === "",
);
check(
  "8b. Sanitizer exposes no destination city/state/address keys",
  lacks(CUSTOMER_ACCESS, "destinationCity") &&
    lacks(CUSTOMER_ACCESS, "destinationState") &&
    lacks(CUSTOMER_ACCESS, "deliveryAddress"),
);
check(
  "8c. Sanitizer key-set pin test untouched",
  diffOf(SANITIZER_PIN_TEST) === "",
);

// ---------------------------------------------------------------------------
console.log("9. Protected files outside the phase diff");
// ---------------------------------------------------------------------------
const protectedFiles = [
  ORDERS,
  "convex/orderWorkflow.ts",
  "convex/inventory.ts",
  "convex/razorpay.ts",
  "convex/razorpayWebhook.ts",
  "convex/notificationService.ts",
  "src/stores/cart.ts",
  "src/hooks/use-razorpay.ts",
  "src/components/customer/CartVariantEditor.tsx",
  "src/components/customer/ProductCard.tsx",
  "src/pages/customer/CartPage.tsx",
  CUSTOMER_ACCESS,
  "src/hooks/use-auth.ts",
  "src/stores/location.ts",
  "convex/geocode.ts",
  ADAPTER,
  BOOKING,
  SCHEMA,
];
const dirtyProtected = protectedFiles.filter((f) => diffOf(f) !== "");
check(
  "9a. None of the 18 protected files modified",
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
  changed = [];
}
const allowed = new Set([
  CHECKOUT,
  DESTINATION_UTIL,
  "tests/21d_g2_destination_city_state.mjs",
  // Phase 21D-H working-tree scope (explicitly reported): ProductPage
  // add-to-cart fix + this suite family's harness sync.
  "src/pages/customer/ProductPage.tsx",
  "tests/21d_c_cart_configuration.mjs",
  "tests/21d_d_checkout_quantity.mjs",
  "tests/21c_catalog_ia.mjs",
  // Phase 21F working-tree scope (reported in 21F report): the checkout
  // payment-retry fix + this suite family's scope allow-set syncs.
  "tests/21d_e2_confirmation.mjs",
  "tests/21d_h_product_add_to_cart.mjs",
  "tests/21f_checkout_payment_retry.mjs",
]);
const unexpected = changed.filter((f) => !allowed.has(f));
// Post-commit / test-only baseline (21D-H harness sync): empty tracked diff
// or a test-harness-only diff means the phase's CheckoutPage changes are
// already committed; any dirty source file still requires CheckoutPage in
// the diff plus the allowed-set bound above.
const phaseCommitted = changed.every((f) => f.startsWith("tests/"));
check(
  "9b. Tracked phase diff limited to CheckoutPage (new files untracked)",
  phaseCommitted || (unexpected.length === 0 && changed.includes(CHECKOUT)),
  unexpected.join(", ") || "CheckoutPage missing from diff",
);
check(
  "9c. New D7 files present in the working tree",
  existsSync(join(ROOT, DESTINATION_UTIL)) &&
    existsSync(join(ROOT, "tests/21d_g2_destination_city_state.mjs")),
);

// ---------------------------------------------------------------------------
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("Failed:\n - " + failures.join("\n - "));
  process.exit(1);
}
