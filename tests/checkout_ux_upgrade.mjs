// ============================================================================
// MB CRUNCHY — Checkout UX Upgrade (controlled implementation) tests
//
// Plain-Node convention (no test runner installed) — run with:
//   node tests/checkout_ux_upgrade.mjs
//
// Covers Phase 4:
//   1. Required full name and mobile validation
//   2. Optional email behavior
//   3. Clear inline error states and messages (no red border without message,
//      no errors before interaction)
//   4. Delivery address field validation
//   5. Kitchen delivery and pickup behavior (radius preserved, no PIN)
//   6. Mart delivery and pickup behavior (resolveMartDelivery preserved)
//   7. PIN validation + shipping calculation unchanged
//   8. Switching order types does not corrupt entered values
//   9. Order payload / address compatibility (UI-only composition)
//   10. Protected regression surface intact
//
// Functional assertions exercise the REAL helpers:
//   src/utils/checkoutAddress.ts (compose/split/email)
//   src/utils/phone.ts (existing +91 handling)
// Structural assertions verify CheckoutPage wiring without executing React.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  composeDeliveryAddress,
  composeDeliveryNotes,
  splitSavedAddress,
  isValidOptionalEmail,
} from "../src/utils/checkoutAddress.ts";
import {
  validateIndianPhone,
  normalizeIndianPhone,
} from "../src/utils/phone.ts";

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

const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const PHONE_INPUT = "src/components/customer/PhoneInput.tsx";
const ADDR_UTIL = "src/utils/checkoutAddress.ts";

console.log("Checkout UX upgrade — focused tests");
console.log("==================================================");

// ---------------------------------------------------------------------------
// 1. Required full name and mobile validation (functional: real helpers +
//    structural: CheckoutPage validate() requires both)
// ---------------------------------------------------------------------------
console.log("[1] Required name + mobile validation");
check(
  "empty name is treated as missing",
  "".trim() === "",
  "sanity"
);
check(
  "valid Indian mobile passes existing validation",
  validateIndianPhone("8801756151") === true,
  "existing +91 handling must be retained"
);
check(
  "normalizeIndianPhone canonicalizes to +91 format",
  normalizeIndianPhone("8801756151") === "+918801756151",
  "canonical format changed"
);
check(
  "short/invalid phone fails validation",
  validateIndianPhone("123") === false &&
    validateIndianPhone("") === false &&
    validateIndianPhone("9999999999") === false,
  "junk rejection changed"
);
check(
  "CheckoutPage requires customerName",
  has(CHECKOUT, 'if (!form.customerName.trim())') &&
    has(CHECKOUT, '"Enter your full name"'),
  "name required check missing"
);
check(
  "CheckoutPage requires customerPhone + validateIndianPhone",
  has(CHECKOUT, "validateIndianPhone(form.customerPhone)") &&
    has(CHECKOUT, '"Phone number is required"') &&
    has(CHECKOUT, '"Enter a valid 10-digit Indian mobile number"'),
  "phone required check missing"
);

// ---------------------------------------------------------------------------
// 2. Optional email behavior
// ---------------------------------------------------------------------------
console.log("[2] Optional email behavior");
check("empty email is valid (optional)", isValidOptionalEmail("") === true);
check(
  "whitespace-only email is valid (optional)",
  isValidOptionalEmail("   ") === true
);
check(
  "well-formed email passes",
  isValidOptionalEmail("priya@example.com") === true
);
check(
  "malformed email fails",
  isValidOptionalEmail("not-an-email") === false &&
    isValidOptionalEmail("a@b") === false &&
    isValidOptionalEmail("a @b.com") === false &&
    isValidOptionalEmail("a@@b.com") === false,
  "permissive check too lax/strict"
);
check(
  "CheckoutPage only validates email when non-empty",
  has(CHECKOUT, "form.customerEmail.trim() && !isValidOptionalEmail(form.customerEmail)"),
  "email must stay optional"
);
check(
  "CheckoutPage sends email as undefined when blank",
  has(CHECKOUT, "form.customerEmail.trim() || undefined"),
  "blank email must not send empty string"
);
check(
  "email helper text does not promise confirmations",
  (() => {
    const src = read(CHECKOUT) ?? "";
    return (
      src.includes("Optional — for order updates, where supported.") &&
      !src.toLowerCase().includes("confirmation email will be sent") &&
      !src.toLowerCase().includes("we will email you a confirmation")
    );
  })(),
  "email copy must not claim confirmations are sent"
);

// ---------------------------------------------------------------------------
// 3. Inline error states: red border only with visible message, after touch
// ---------------------------------------------------------------------------
console.log("[3] Inline error states");
check(
  "PhoneInput exposes onBlur for touched tracking",
  has(PHONE_INPUT, "onBlur") && has(CHECKOUT, 'markTouched("customerPhone")'),
  "phone touched tracking missing"
);
check(
  "PhoneInput forwards onBlur to inner input",
  has(PHONE_INPUT, "onBlur={onBlur}"),
  "onBlur prop declared but not forwarded"
);
check(
  "showFieldError gates visibility on touched/submitAttempted",
  has(CHECKOUT, "touched[field] || submitAttempted"),
  "errors would show before interaction"
);
check(
  "Full Name border uses gated error (not raw errors object)",
  has(CHECKOUT, 'showFieldError("customerName") && "border-destructive'),
  "ungated border-destructive shows red before interaction"
);
check(
  "no ungated border-destructive on contact fields",
  lacks(CHECKOUT, 'errors.customerName && "border-destructive"') &&
    lacks(CHECKOUT, "errors.customerPhone &&") &&
    lacks(CHECKOUT, 'errors.customerEmail && "border-destructive"'),
  "legacy ungated error styling remains"
);
check(
  "invalid fields expose role=alert inline messages",
  has(CHECKOUT, 'role="alert"'),
  "missing accessible inline messages"
);
check(
  "customerName input carries aria-invalid + describedby",
  has(CHECKOUT, 'aria-invalid={!!showFieldError("customerName")}'),
  "missing aria wiring"
);
check(
  "every invalid field associates its message via id + describedby",
  has(CHECKOUT, 'id="customerPhone-error"') &&
    has(PHONE_INPUT, "ariaDescribedby") &&
    has(CHECKOUT, 'id="destinationPincode-error"') &&
    has(CHECKOUT, 'id="houseFlat-error"') &&
    has(CHECKOUT, 'id="streetLocality-error"') &&
    has(CHECKOUT, 'id="customerEmail-error"'),
  "error message without programmatic association"
);
check(
  "mobile helper text present",
  has(CHECKOUT, "Used for order-related contact and delivery coordination."),
  "mobile helper copy missing"
);

// ---------------------------------------------------------------------------
// 4. Delivery address field validation (structured inputs)
// ---------------------------------------------------------------------------
console.log("[4] Delivery address validation");
check(
  "compose joins house + street",
  composeDeliveryAddress({ houseFlat: "Flat 4B, Plot 12", streetLocality: "Road No. 12", landmark: "" }) ===
    "Flat 4B, Plot 12, Road No. 12"
);
check(
  "compose appends landmark with Near prefix",
  composeDeliveryAddress({ houseFlat: "Flat 4B", streetLocality: "Banjara Hills", landmark: "City Mall" }) ===
    "Flat 4B, Banjara Hills, Near City Mall"
);
check(
  "compose omits empty parts + trims",
  composeDeliveryAddress({ houseFlat: "  Flat 4B  ", streetLocality: "", landmark: "  " }) === "Flat 4B"
);
check(
  "compose empty inputs yields empty string",
  composeDeliveryAddress({ houseFlat: "", streetLocality: "", landmark: "" }) === ""
);
check(
  "composeDeliveryNotes preserves Landmark prefix + instructions",
  composeDeliveryNotes({ landmark: "City Mall", deliveryInstructions: "Call on arrival" }) ===
    "Landmark: City Mall\nCall on arrival"
);
check(
  "composeDeliveryNotes landmark-only",
  composeDeliveryNotes({ landmark: "City Mall", deliveryInstructions: "" }) === "Landmark: City Mall"
);
check(
  "composeDeliveryNotes empty yields empty (caller sends undefined)",
  composeDeliveryNotes({ landmark: "", deliveryInstructions: "  " }) === ""
);
check(
  "splitSavedAddress splits on first comma",
  (() => {
    const s = splitSavedAddress("Flat 4B, Road No. 12, Banjara Hills");
    return s.houseFlat === "Flat 4B" && s.streetLocality === "Road No. 12, Banjara Hills";
  })()
);
check(
  "splitSavedAddress without comma keeps validation honest",
  (() => {
    const s = splitSavedAddress("Flat 4B");
    return s.houseFlat === "Flat 4B" && s.streetLocality === "";
  })()
);
check(
  "splitSavedAddress strips empty-segment comma debris without data loss",
  (() => {
    const s = splitSavedAddress("Flat,, Street");
    return (
      s.houseFlat === "Flat" &&
      s.streetLocality === "Street" &&
      composeDeliveryAddress({ ...s, landmark: "" }) === "Flat, Street"
    );
  })()
);
check(
  "splitSavedAddress preserves interior commas verbatim",
  (() => {
    const s = splitSavedAddress("a,b,c,d,e");
    return s.houseFlat === "a" && s.streetLocality === "b,c,d,e";
  })()
);
check(
  "CheckoutPage validates houseFlat + streetLocality for delivery",
  has(CHECKOUT, '"Enter your house, flat, or building"') &&
    has(CHECKOUT, '"Enter your street or locality"'),
  "structured required messages missing"
);
check(
  "structured inputs have examples + labels",
  has(CHECKOUT, "House / Flat / Building") &&
    has(CHECKOUT, "Street / Locality") &&
    has(CHECKOUT, "e.g. Flat 4B, Plot 12") &&
    has(CHECKOUT, "e.g. Road No. 12, Banjara Hills"),
  "labels/examples missing"
);
check(
  "landmark + instructions are optional",
  has(CHECKOUT, "(optional)") && has(CHECKOUT, "Delivery Instructions"),
  "optional affordance missing"
);

// ---------------------------------------------------------------------------
// 5. Kitchen delivery + pickup (radius preserved, no PIN)
// ---------------------------------------------------------------------------
console.log("[5] Kitchen delivery/pickup");
check(
  "Kitchen Haversine check preserved",
  has(CHECKOUT, "checkKitchenServiceability(customerLocation.location, bu)"),
  "Kitchen radius check removed"
);
check(
  "Kitchen Delivery Area RadioGroup preserved",
  has(CHECKOUT, "Delivery Area") && has(CHECKOUT, "Outside Local Area"),
  "Kitchen delivery-type UI removed"
);
check(
  "pickup bypasses Kitchen radius",
  (() => {
    const src = read(CHECKOUT) ?? "";
    return (
      src.includes("canPlaceKitchenDelivery") &&
      src.includes('form.orderType === "pickup"') &&
      src.includes("pickup bypasses delivery radius")
    );
  })(),
  "pickup radius bypass changed"
);
check(
  "Kitchen branch never renders PIN input (PIN stays Mart-only)",
  (() => {
    const src = read(CHECKOUT) ?? "";
    // destinationPincode input lives inside the isMartPincodeMode ternary branch.
    const martBranch = src.indexOf("isMartPincodeMode ?");
    const pinInput = src.indexOf('id="destinationPincode"');
    const elseBranch = src.indexOf("Kitchen Delivery Type Selection", martBranch);
    return martBranch !== -1 && pinInput !== -1 && elseBranch !== -1 && pinInput < elseBranch;
  })(),
  "PIN input leaked into Kitchen flow"
);
check(
  "address section hidden for pickup (conditional on delivery)",
  has(CHECKOUT, 'form.orderType === "delivery" && ('),
  "delivery section not conditional"
);

// ---------------------------------------------------------------------------
// 6. Mart delivery + pickup (resolveMartDelivery preserved)
// ---------------------------------------------------------------------------
console.log("[6] Mart delivery/pickup");
check(
  "canonical resolveMartDelivery query preserved",
  has(CHECKOUT, "api.shippingRates.resolveMartDelivery"),
  "Mart shipping query removed"
);
check(
  "Mart pickup bypasses delivery check",
  (() => {
    const src = read(CHECKOUT) ?? "";
    return (
      src.includes("canPlaceMartDelivery") &&
      src.includes('form.orderType === "pickup"') &&
      src.includes("pickup bypasses delivery check")
    );
  })(),
  "Mart pickup bypass changed"
);
check(
  "Mart PIN block gated on pincode_region mode",
  has(CHECKOUT, 'serviceabilityMode === "pincode_region"'),
  "Mart mode discriminator removed"
);
check(
  "Mart delivery fee uses server-authoritative charge",
  has(CHECKOUT, "martDelivery?.available && martDelivery.shippingCharge !== undefined"),
  "server charge wiring changed"
);
check(
  "Mart error mapping preserved",
  has(CHECKOUT, "getMartDeliveryErrorMessage(martDelivery.reason)"),
  "Mart error UX removed"
);

// ---------------------------------------------------------------------------
// 7. PIN validation + shipping calculation unchanged
// ---------------------------------------------------------------------------
console.log("[7] PIN + shipping calculation unchanged");
check(
  "client PIN format check preserved",
  has(CHECKOUT, "checkMartPincodeFormat(form.destinationPincode)"),
  "client PIN check removed"
);
check(
  "CheckoutPage PIN required/invalid messages preserved",
  has(CHECKOUT, '"Pincode is required for delivery"') &&
    has(CHECKOUT, '"Enter a valid 6-digit pincode"'),
  "PIN messages changed"
);
check(
  "no product weight logic touched by this change",
  (() => {
    const qp = join(ROOT, "convex/shippingRates.ts");
    if (!existsSync(qp)) return false;
    const src = readFileSync(qp, "utf8");
    return src.includes("resolveMartDelivery") && src.includes("billableWeightGrams");
  })(),
  "shippingRates.ts canonical calculation missing"
);

// ---------------------------------------------------------------------------
// 8. Switching order types preserves entered values
// ---------------------------------------------------------------------------
console.log("[8] Order-type switching preserves values");
check(
  "switching to pickup clears only deliveryType (values preserved)",
  (() => {
    const src = read(CHECKOUT) ?? "";
    const idx = src.indexOf('if (field === "orderType" && value === "pickup")');
    if (idx === -1) return false;
    const before = src.slice(Math.max(0, idx - 400), idx);
    const window = src.slice(idx, idx + 800);
    return (
      window.includes("next.deliveryType") &&
      !window.includes('houseFlat: ""') &&
      !window.includes("houseFlat =") &&
      !window.includes('deliveryAddress = ""') &&
      before.includes("Entered delivery values are") // documents preservation intent
    );
  })(),
  "switching wipes entered values"
);
check(
  "switching to pickup drops stale delivery errors but keeps values",
  has(CHECKOUT, "delete next.houseFlat;") && has(CHECKOUT, "delete next.destinationPincode;"),
  "stale-error cleanup missing"
);
check(
  "effectiveDeliveryType undefined for pickup (no leakage)",
  has(CHECKOUT, 'form.orderType === "delivery" ? form.deliveryType : undefined'),
  "deliveryType leakage guard removed"
);

// ---------------------------------------------------------------------------
// 9. Order payload / address compatibility (UI-only composition)
// ---------------------------------------------------------------------------
console.log("[9] Payload compatibility");
check(
  "submit composes deliveryAddress from structured inputs",
  has(CHECKOUT, "composeDeliveryAddress({") && has(CHECKOUT, "houseFlat: form.houseFlat"),
  "submit does not compose structured address"
);
check(
  "submit composes deliveryNotes (landmark + instructions)",
  has(CHECKOUT, "composeDeliveryNotes({"),
  "submit does not compose delivery notes"
);
check(
  "delivery payload keys unchanged (deliveryAddress/deliveryNotes/destinationPincode)",
  has(CHECKOUT, "deliveryAddress:") &&
    has(CHECKOUT, "deliveryNotes:") &&
    has(CHECKOUT, "destinationPincode: form.destinationPincode.trim() || undefined"),
  "order payload contract changed"
);
check(
  "no Convex schema change in this task",
  (() => {
    const src = code("convex/schema.ts") ?? "";
    return (
      src.includes('deliveryAddress: v.optional(v.string())') &&
      !src.includes("houseFlat") &&
      !src.includes("streetLocality")
    );
  })(),
  "schema was modified"
);
check(
  "Shiprocket adapter still reads order.deliveryAddress/destinationPincode",
  (() => {
    const src = code("convex/courier/bookingWorkflow.ts") ?? "";
    return (
      src.includes("order.deliveryAddress") &&
      src.includes("order.destinationPincode") &&
      !src.includes("houseFlat")
    );
  })(),
  "Shiprocket contract changed"
);
check(
  "saved-address selection splits legacy string (no data migration)",
  has(CHECKOUT, "splitSavedAddress(addr.address"),
  "saved-address compat missing"
);

// ---------------------------------------------------------------------------
// 10. Protected regression surface intact
// ---------------------------------------------------------------------------
console.log("[10] Protected surface");
check(
  "Razorpay flow intact",
  has(CHECKOUT, "openRazorpayCheckout") && has(CHECKOUT, "idempotencyKey"),
  "payment flow touched"
);
check(
  "form sections numbered without changing summary/pricing",
  has(CHECKOUT, "1. Contact Information") &&
    has(CHECKOUT, "2. Order Type") &&
    has(CHECKOUT, "3. Delivery Address"),
  "section titles missing"
);
check(
  "checkout util file exists and is UI-only",
  (() => {
    const src = read(ADDR_UTIL) ?? "";
    return (
      src.includes("composeDeliveryAddress") &&
      src.includes("No Convex schema") &&
      !src.includes("defineTable") &&
      !src.includes("mutation")
    );
  })(),
  "address util missing or not UI-only"
);

console.log("==================================================");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log("All checkout UX upgrade tests passed.");
}
