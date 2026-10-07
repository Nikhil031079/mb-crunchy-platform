// ============================================================================
// Phase 21D-H — Product Page Add-to-Cart Safety (undefined catalogItem)
//
// Run:  node tests/21d_h_product_add_to_cart.mjs
//
// ROOT CAUSE UNDER TEST (diagnosed against production d0be881):
//   ProductPage's handleAddToCart closed over `catalogItem` (the
//   catalogItems.getBySourceId query) WITHOUT listing it in the useCallback
//   dependency array. That query resolves AFTER products.getBySlug, so no
//   other dep changed afterwards and the callback stayed frozen with
//   `catalogItem === undefined`. The unguarded `catalogItem!._id` then threw
//   "TypeError: Cannot read properties of undefined (reading '_id')" on
//   every direct Add-to-Cart click. EMPIRICAL PROOF (production, pre-fix):
//     - direct click              -> TypeError, cart not persisted
//     - quantity bump then click  -> no error, cart persisted (dep change
//                                    recreated the callback with fresh data)
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// plain-Node `tests/*.mjs` convention. Assertions are structural proofs on
// the real source (deps array membership, guard ordering, button gating,
// canonical-variant preservation, protected-file scope) — the runtime proof
// is the production browser smoke (Product -> Add to Cart -> Cart ->
// Checkout) run in the same phase.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
// Phase baseline — diff scope is measured against this commit so the suite
// passes both before and after the 21D-H commit is created.
const BASELINE = "d0be8819e1964fec8e646c5a8086284489d75ff4";
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
 * Extract the body + dependency array of `const NAME = useCallback(fn, deps)`.
 * Returns { body, deps } (deps as the raw array source text), or null.
 */
function extractUseCallback(rel, name) {
  const src = read(rel);
  if (!src) return null;
  const marker = `const ${name} = useCallback(`;
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf("(", at + marker.length - 1);
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return null;
  const inner = src.slice(open + 1, close);

  // Find the top-level `, [` that separates the function arg from the deps.
  let d = 0;
  let depsStart = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if ("([{".includes(ch)) d++;
    else if (")]}".includes(ch)) d--;
    else if (ch === "," && d === 0 && inner.slice(i).match(/^\s*,\s*\[/)) {
      depsStart = i + 1;
      break;
    }
  }
  if (depsStart === null || depsStart < 0) return null;
  const depsRaw = inner.slice(depsStart);
  const body = inner.slice(0, depsStart);
  return { body: stripComments(body), deps: stripComments(depsRaw), raw: inner };
}

const PDP = "src/pages/customer/ProductPage.tsx";
const CHECKOUT = "src/pages/customer/CheckoutPage.tsx";
const VARIANTS = "src/utils/product-variants.ts";
const CART = "src/stores/cart.ts";

// ============================================================================
console.log("\nA. The actual defect — stale catalogItem closure + unguarded deref");
// ============================================================================

const cb = extractUseCallback(PDP, "handleAddToCart");
check("A1 handleAddToCart useCallback extracted from ProductPage", cb !== null);

if (cb) {
  check(
    "A2 ROOT-CAUSE FIX: catalogItem is in the handleAddToCart dependency array (callback recreated when the query resolves)",
    /(^|[,[])\s*catalogItem\s*([,\]])/.test(cb.deps),
    `deps = ${cb.deps.trim()}`
  );
  check(
    "A3 handler guards catalogItem before use (fail-closed for undefined/null)",
    cb.body.includes("if (!catalogItem)"),
  );
  check(
    "A4 missing-record (null) case surfaces a toast instead of failing silently",
    cb.body.includes("catalogItem === null")
  );
  check(
    "A5 no unguarded non-null assertion remains (catalogItem! removed)",
    cb.body.includes("catalogItem!") === false
  );
  check(
    "A6 guard is ordered BEFORE the cart write",
    cb.body.indexOf("if (!catalogItem)") !== -1 &&
      cb.body.indexOf("catalogItemId: catalogItem._id") !== -1 &&
      cb.body.indexOf("if (!catalogItem)") < cb.body.indexOf("catalogItemId: catalogItem._id")
  );
  check(
    "A7 store-closed and out-of-stock guards still run before the cart write",
    cb.body.indexOf("Store is currently closed") !== -1 &&
      cb.body.indexOf("Item is out of stock") !== -1 &&
      cb.body.indexOf("Store is currently closed") < cb.body.indexOf("if (!catalogItem)") &&
      cb.body.indexOf("Item is out of stock") < cb.body.indexOf("if (!catalogItem)")
  );
  check(
    "A8 cart line still writes canonical identity fields (variantName + unitPrice from selectedVariant)",
    cb.body.includes("variantName: selectedVariant.optionValue") &&
      cb.body.includes("unitPrice: selectedVariant.price")
  );
}

check(
  "A9 ProductPage contains ZERO remaining `catalogItem!` assertions",
  count(PDP, "catalogItem!") === 0,
  `found ${count(PDP, "catalogItem!")}`
);
check(
  "A10 both Add-to-Cart buttons gate on catalogItem still loading (disabled while undefined)",
  count(PDP, "catalogItem === undefined") === 2,
  `found ${count(PDP, "catalogItem === undefined")}`
);
check(
  "A11 both buttons still share the single fixed handler",
  count(PDP, "onClick={handleAddToCart}") === 2
);
check(
  "A12 root-cause comment retained in handler (documents the late-resolving query)",
  (read(PDP) ?? "").includes("It resolves AFTER the")
);

// ============================================================================
console.log("\nB. No-variant product path (verification matrix #2)");
// ============================================================================

check(
  "B1 zero-variant product resolves the canonical non-variant identity",
  has(PDP, 'optionValue: "Default"')
);
check(
  "B2 zero-variant identity is only used when variants.length === 0 (never overrides real variants)",
  has(PDP, "if (product.variants.length > 0)")
);
check(
  "B3 zero-variant identity is priced from the catalogItems record (matches orders.ts zero-ACTIVE pricing)",
  has(PDP, "price: catalogItem.price")
);
check(
  "B4 zero-variant identity is catalogItem-gated (stays undefined until the record resolves)",
  has(PDP, "return catalogItem")
);

// ============================================================================
console.log("\nC. Phase 21D-B canonical variant rule preserved (verification #3)");
// ============================================================================

check(
  "C1 PDP still resolves via findMatchingVariant + getDefaultVariant",
  has(PDP, "findMatchingVariant(product.variants, selections)") &&
    has(PDP, "getDefaultVariant(product.variants)")
);
check(
  "C2 canonical default = isDefault active variant, else first active by sortOrder",
  has(VARIANTS, "return active.find((v) => v.isDefault) ?? active[0];")
);
check(
  "C3 PDP all-inactive fallback to raw first entry unchanged",
  has(VARIANTS, "return getDefaultActiveVariant(variants) ?? (variants ?? [])[0];")
);
check(
  "C4 quick-add canonical line resolution untouched",
  has("src/hooks/use-add-to-cart.ts", "resolveQuickAddVariantLine")
);

// ============================================================================
console.log("\nD. Routing + commerce safety preservation (verification #9)");
// ============================================================================

check(
  "D1 ProductPage still resolves canonical route params (bu/category/product slugs)",
  has(PDP, "const { businessUnitSlug, categorySlug, productSlug } = useParams<")
);
check(
  "D2 canonical PDP slug helpers still wired",
  has(PDP, "useProductCategorySlugs, useBusinessUnitSlugById")
);
check(
  "D3 PRODUCT_ROUTE shape unchanged",
  has("src/constants/index.ts", "`/${buSlug}/${catSlug}/${productSlug}`")
);
check(
  "D4 cart store untouched (cart identity / merge / quantity editing)",
  !changedTrackedFiles().some((f) => f.startsWith("src/stores/cart"))
);
check(
  "D5 cart variant editing untouched (CartPage variant-change flow)",
  !changedTrackedFiles().includes("src/pages/customer/CartPage.tsx")
);
check(
  "D6 checkout quantity editing + mixed-BU checkout untouched (only a11y id added)",
  (() => {
    const diff = gitDiff("src/pages/customer/CheckoutPage.tsx");
    // Phase 21F (reported in the 21F report): the checkout payment-retry
    // guard adds isSubmitting / paymentStatus / pendingOrder / navigate to
    // the handleSubmit dependency array. That single +/- line legitimately
    // contains the destinationCityState / checkoutItems substrings without
    // touching the city/state, quantity, or mixed-BU logic these tokens
    // protect, so the deps-array line is exempted here.
    const material = (diff ?? "")
      .split("\n")
      .filter((l) => !l.includes("[validate, cart, form, pricing, createOrder"))
      .join("\n");
    return (
      diff !== null &&
      diff.trim().length > 0 &&
      !material.includes("destinationCity") &&
      !material.includes("destinationState") &&
      !material.includes("checkoutItems") &&
      !material.includes("businessUnitId")
    );
  })()
);
check(
  "D7 D7 destination city/state flow preserved in CheckoutPage",
  has(CHECKOUT, "destinationCity") && has(CHECKOUT, "destinationState")
);
check(
  "D8 no Convex backend files changed (schema / orders / Shiprocket / sanitizer)",
  changedTrackedFiles().every((f) => !f.startsWith("convex/"))
);
check(
  "D9 server-authoritative pricing + fail-closed variant validation untouched",
  changedTrackedFiles().every(
    (f) => f !== "convex/orders.ts" && f !== "convex/utils/variantHelper.ts"
  )
);

// ============================================================================
console.log("\nE. Adjacent a11y correction — deliveryAddress label/id");
// ============================================================================

check(
  "E1 CheckoutPage textarea now carries id=\"deliveryAddress\"",
  count(CHECKOUT, 'id="deliveryAddress"') === 1,
  `found ${count(CHECKOUT, 'id="deliveryAddress"')}`
);
check(
  "E2 exactly one label points at it via htmlFor",
  count(CHECKOUT, 'htmlFor="deliveryAddress"') === 1
);
check(
  "E3 the id sits on the custom-address Textarea (adjacent to its label)",
  (() => {
    const src = code(CHECKOUT) ?? "";
    const at = src.indexOf('htmlFor="deliveryAddress"');
    if (at < 0) return false;
    const idAt = src.indexOf('id="deliveryAddress"');
    return idAt > at && idAt - at < 400;
  })()
);

// ============================================================================
console.log("\nF. Change scope — nothing beyond the phase's intended files");
// ============================================================================

const changed = changedTrackedFiles();
const allowed = new Set([
  "src/pages/customer/ProductPage.tsx",
  "src/pages/customer/CheckoutPage.tsx",
  "tests/21d_h_product_add_to_cart.mjs",
  // Repo-sanctioned harness sync: earlier suites' working-tree scope
  // allow-sets extended for this phase's files (reported in 21D-H report).
  "tests/21c_catalog_ia.mjs",
  "tests/21d_c_cart_configuration.mjs",
  "tests/21d_d_checkout_quantity.mjs",
  "tests/21d_g2_destination_city_state.mjs",
  // Repo-sanctioned harness sync: 21D-E2 evidence-pin suite (test-only).
  "tests/21d_e2_confirmation.mjs",
  // Repo-sanctioned harness sync (reported in 21F report): the 21F checkout
  // payment-retry suite, now part of the diff vs this suite's baseline.
  "tests/21f_checkout_payment_retry.mjs",
]);
const unexpected = changed.filter((f) => !allowed.has(f));
check(
  "F1 tracked diff limited to ProductPage + CheckoutPage",
  unexpected.length === 0,
  `unexpected: ${unexpected.join(", ") || "(none)"}`
);
check(
  "F2 ProductPage is part of the change (the fix itself)",
  changed.includes("src/pages/customer/ProductPage.tsx")
);
check(
  "F3 CheckoutPage is part of the change (the a11y correction)",
  changed.includes("src/pages/customer/CheckoutPage.tsx")
);
check(
  "F4 product-variants util untouched (canonical rule file)",
  !changed.includes("src/utils/product-variants.ts")
);

// ============================================================================
// Helpers used above (declared after use is fine — function hoisting)
// ============================================================================

function gitDiff(args) {
  try {
    return execSync(`git diff ${BASELINE} ${args}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function changedTrackedFiles() {
  const out = gitDiff("--name-only");
  if (out === null) return [];
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
console.log("\n" + "=".repeat(70));
if (failed === 0) {
  console.log(`21D-H PRODUCT ADD-TO-CART SAFETY: PASS (${passed} assertions)`);
} else {
  console.log(`21D-H: FAIL — ${failed}/${passed + failed} assertions failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
