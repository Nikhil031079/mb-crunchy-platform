// ============================================================================
// Phase 21G-B — Merchandising Placement Structural Tests
//
// Run:  node tests/21g_merchandising_placement.mjs
//
// WHAT THIS PINS (placement / structural guarantees ONLY - no new logic):
//   1. RecommendedForYouSection renders nothing for a signal-less visitor
//      (categoryIds.length === 0) instead of duplicating BestSellersSection,
//      while the active (signal-bearing) recommendation path is unchanged.
//   2. ProductPage no longer carries a store-generic "Trending Now" rail or
//      a getTrending subscription; FBT, CrossSellSections and Related
//      Products all remain.
//   3. CrossSellSections keeps product-level "You May Also Like" (data flow,
//      useDefaultVariantNames(mayAlsoLike), ProductCard) and has dropped the
//      storefront-level Recommended Combo / Party Packs blocks plus every
//      query / handler / import that existed only for them.
//   4. P2 (PromoRibbon / InfoStrip promo-chip overlap) is INTENTIONALLY
//      DEFERRED - both files are proven untouched.
//   5. Frozen customer pages (Cart / Checkout / Category / BusinessUnit /
//      Home) are untouched; Cart's RecentlyViewedSection is an accepted
//      deviation and must remain.
//   6. Scope: the tracked diff is limited to the approved 21G-B file set
//      (3 source files + this suite + the sanctioned harness syncs) and no
//      protected file is modified.
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// plain-Node tests/*.mjs structural/source-test convention used by the
// 21B-21F suites.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

const RFY = "src/components/customer/RecommendedForYouSection.tsx";
const XSELL = "src/components/customer/CrossSellSections.tsx";
const PDP = "src/pages/customer/ProductPage.tsx";
const INFO_STRIP = "src/components/customer/HomepageInfoStrip.tsx";
const PROMO_RIBBON = "src/components/customer/PromoRibbonSection.tsx";
const BEST_SELLERS = "src/components/customer/BestSellersSection.tsx";

const FROZEN_PAGES = [
  "src/pages/customer/CartPage.tsx",
  "src/pages/customer/CheckoutPage.tsx",
  "src/pages/customer/CategoryPage.tsx",
  "src/pages/customer/BusinessUnitPage.tsx",
  "src/pages/customer/HomePage.tsx",
];

// The exact set of tracked files Phase 21G-B is permitted to modify.
const APPROVED_21G = new Set([
  // Approved 21G-B implementation (per the phase brief).
  "src/components/customer/RecommendedForYouSection.tsx",
  "src/components/customer/CrossSellSections.tsx",
  "src/pages/customer/ProductPage.tsx",
  // This suite (untracked while in flight, listed for completeness).
  "tests/21g_merchandising_placement.mjs",
  // Repo-sanctioned harness sync (explicitly reported in the 21G-B report):
  // earlier phase suites assert an explicit changed-file allow-list / a
  // phase-specific committed-scope state, so the 21G-B file set is appended.
  // No functional assertion in those suites is weakened, deleted or made
  // unconditional - only the sanctioned file list / phase branch is extended.
  "tests/21d_c_cart_configuration.mjs",
  "tests/21d_d_checkout_quantity.mjs",
  "tests/21d_e2_confirmation.mjs",
  "tests/21d_g2_destination_city_state.mjs",
  "tests/21d_h_product_add_to_cart.mjs",
  "tests/21f_checkout_payment_retry.mjs",
  // The 21D-B suite's scope-block edit, required because the sanctioned 21F
  // harness path above matches its /payment/ filename keyword.
  "tests/21d_b_variant_safety.mjs",
]);

const PROTECTED_FILES = [
  "convex/schema.ts",
  "convex/orders.ts",
  "convex/razorpay.ts",
  "convex/razorpayWebhook.ts",
  "convex/orderWorkflow.ts",
  "convex/notificationService.ts",
  "convex/catalogItems.ts",
  "src/hooks/use-razorpay.ts",
  "src/components/customer/RazorpayPayment.tsx",
  "src/stores/cart.ts",
  "src/components/customer/ProductCard.tsx",
  "src/components/customer/ComboCard.tsx",
  "src/components/customer/PartyPackCard.tsx",
  "src/components/customer/ComboOffersSection.tsx",
  "src/components/customer/PartyPacksSection.tsx",
  "src/components/customer/BestSellersSection.tsx",
  "src/components/customer/TrendingRailSection.tsx",
  "src/pages/customer/CartPage.tsx",
  "src/pages/customer/CheckoutPage.tsx",
  "src/pages/customer/CategoryPage.tsx",
  "src/pages/customer/BusinessUnitPage.tsx",
  "src/pages/customer/HomePage.tsx",
];

let passed = 0;
let failed = 0;
const failures = [];

function read(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

// Removes line + block comments (string-aware) so prose cannot satisfy an
// assertion. Written as a small state machine to keep this file regex-free.
function stripComments(src) {
  let out = "";
  let i = 0;
  let mode = "";
  let strCh = "";
  while (i < src.length) {
    const ch = src[i];
    const nx = i + 1 < src.length ? src[i + 1] : "";
    if (mode === "line") {
      if (ch === NL) {
        mode = "";
        out += ch;
      }
      i++;
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && nx === "/") {
        mode = "";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "str") {
      out += ch;
      if (ch === BS) {
        out += nx;
        i += 2;
        continue;
      }
      if (ch === strCh) mode = "";
      i++;
      continue;
    }
    if (ch === "/" && nx === "/") {
      mode = "line";
      i += 2;
      continue;
    }
    if (ch === "/" && nx === "*") {
      mode = "block";
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      mode = "str";
      strCh = ch;
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function code(rel) {
  const src = read(rel);
  return src === null ? null : stripComments(src);
}

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log("  [PASS] " + name);
  } else {
    failed++;
    failures.push(name);
    console.log("  [FAIL] " + name + (detail ? " -- " + detail : ""));
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

function countOf(rel, needle) {
  const src = code(rel);
  return src === null ? 0 : src.split(needle).length - 1;
}

function idxOf(rel, needle) {
  const src = code(rel);
  return src === null ? -1 : src.indexOf(needle);
}

function git(args) {
  try {
    return execSync("git " + args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function changedTracked() {
  return git("diff --name-only HEAD")
    .split(NL)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fileDiff(rel) {
  try {
    return execSync('git diff HEAD -- "' + rel + '"', {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// ============================================================================
console.log("\n1. RecommendedForYouSection - signal-less guard");
// ============================================================================

const GUARD = "if (!isLoading && categoryIds.length === 0) return null;";

check("1a. categoryIds.length === 0 guard exists", has(RFY, GUARD), "missing guard");

check(
  "1b. isLoading is false for a signal-less visitor (no ids => not loading)",
  has(RFY, "const isLoading = categoryLoading && signalIds.length > 0;"),
);

const guardAt = idxOf(RFY, GUARD);
const renderAt = idxOf(RFY, "<ProductGridSection");
check(
  "1c. signal-less path returns null before any section is rendered",
  guardAt > 0 && renderAt > 0 && guardAt < renderAt,
  "guardAt=" + guardAt + " renderAt=" + renderAt,
);

check(
  "1d. exactly two early null returns (businessUnits + no-signal)",
  countOf(RFY, "return null;") === 2,
  "count=" + countOf(RFY, "return null;"),
);

check(
  "1e. active recommendation path preserved (category query + ranking)",
  has(RFY, "api.catalogItems.getByCategoryIdsAcrossBusinessUnits") &&
    has(RFY, "rankCatalogItems(") &&
    has(RFY, "categoryIds.length > 0"),
);

check(
  "1f. loading handling preserved for the active path",
  has(RFY, "loading={isLoading}") &&
    has(RFY, "if (businessUnits.length === 0) return null;"),
);

check(
  "1g. no replacement dataset / algorithm introduced",
  lacks(RFY, "api.catalogItems.getRecommended") &&
    countOf(RFY, "api.catalogItems.getBestSellersAcrossBusinessUnits") === 1,
  "best-sellers weighting must remain exactly the pre-existing one",
);

check(
  "1h. BestSellersSection itself untouched (stays the canonical fallback rail)",
  fileDiff(BEST_SELLERS) === "",
);

// ============================================================================
console.log("\n2. ProductPage - store-generic trending removed, PDP rails kept");
// ============================================================================

check("2a. ProductPage no longer subscribes to getTrending", lacks(PDP, "api.catalogItems.getTrending"));
check("2b. ProductPage has no Trending Now section", lacks(PDP, "Trending Now"));
check("2c. ProductPage has no trending data wiring", lacks(PDP, "trendingItems"));
check("2d. ProductPage has no orphaned TrendingUp import", lacks(PDP, "TrendingUp"));
check("2e. Frequently Bought Together retained", has(PDP, "FrequentlyBoughtTogetherSection"));
check("2f. FBT still rendered in JSX", countOf(PDP, "<FrequentlyBoughtTogetherSection") >= 1);
check("2g. CrossSellSections retained and rendered exactly once", countOf(PDP, "<CrossSellSections") === 1);
check("2h. Related Products retained", has(PDP, "Related Products"));
check(
  "2i. related-product query retained",
  has(PDP, "api.catalogItems.getRelatedByTags") && has(PDP, "recommendationItems"),
);
check(
  "2j. Related Products still gated on real data",
  has(PDP, "relatedItems && relatedItems.length > 0"),
);
check(
  "2k. no replacement recommendation block was added",
  lacks(PDP, "api.catalogItems.getRecommended") &&
    lacks(PDP, "getRecommendedAcrossBusinessUnits"),
);

// ============================================================================
console.log("\n3. CrossSellSections - product rail kept, storefront rails removed");
// ============================================================================

check(
  "3a. mayAlsoLike data flow retained",
  has(XSELL, "api.catalogItems.getRecommended") && has(XSELL, "mayAlsoLike"),
);
check("3b. useDefaultVariantNames(mayAlsoLike) retained", has(XSELL, "useDefaultVariantNames(mayAlsoLike)"));
check("3c. ProductCard render site retained", countOf(XSELL, "<ProductCard") >= 1);
check("3d. ProductCard import + render both present", countOf(XSELL, "ProductCard") >= 2);
check(
  "3e. product-scoped card props retained (store slug)",
  has(XSELL, "businessUnitSlug={businessUnit.slug}"),
);
check("3f. no Recommended Combo block", lacks(XSELL, "Recommended Combo"));
check("3g. no Party Packs block", lacks(XSELL, "Party Packs"));
check(
  "3h. no Bundles / For Celebrations eyebrows",
  lacks(XSELL, "Bundles") && lacks(XSELL, "For Celebrations"),
);

const OBSOLETE = [
  ["combo query", "api.combos.getFeatured"],
  ["party pack query", "api.partyPacks.getFeatured"],
  ["combo handler", "handleAddCombo"],
  ["party pack handler", "handleAddPartyPack"],
  ["combo memo", "recommendedCombos"],
  ["party pack memo", "recommendedPacks"],
  ["ComboCard usage", "ComboCard"],
  ["PartyPackCard usage", "PartyPackCard"],
  ["toast import (bundle add only)", "toast"],
  ["useCart import (bundle add only)", "useCart"],
  ["useCatalogItemMap import (bundle add only)", "useCatalogItemMap"],
  ["Combine icon", "Combine"],
  ["PartyPopper icon", "PartyPopper"],
  ["Combo type import", "Combo"],
  ["PartyPack type import", "PartyPack"],
];
for (const [label, needle] of OBSOLETE) {
  check("3i. no obsolete " + label + " remains", lacks(XSELL, needle));
}

check("3j. empty guard still renders nothing when there is no data", has(XSELL, "if (!hasAny) return null;"));

// ============================================================================
console.log("\n4. P2 - PromoRibbon / InfoStrip overlap intentionally deferred");
// ============================================================================

check(
  "4a. P2 DEFERRED: HomepageInfoStrip.tsx is unchanged",
  fileDiff(INFO_STRIP) === "",
  "modified or missing",
);

check(
  "4b. P2 DEFERRED: promotion-chip behaviour still present in InfoStrip",
  has(INFO_STRIP, 'contentType: "promotion"') &&
    has(INFO_STRIP, "activePromos") &&
    has(INFO_STRIP, "PromoChip"),
);

check(
  "4c. P2 DEFERRED: PromoRibbonSection.tsx unchanged (overlap left in place)",
  fileDiff(PROMO_RIBBON) === "",
  "modified or missing",
);

console.log("  [NOTE] P2 (PromoRibbon / InfoStrip promo-chip overlap) is intentionally deferred.");

// ============================================================================
console.log("\n5. Frozen customer pages (Cart RecentlyViewed = accepted deviation)");
// ============================================================================

for (const rel of FROZEN_PAGES) {
  const d = fileDiff(rel);
  check("5. " + rel + " unchanged", d === "", d === null ? "diff error" : d.split(NL).length + " diff lines");
}

check(
  "5z. Cart RecentlyViewedSection intentionally retained (accepted deviation)",
  has("src/pages/customer/CartPage.tsx", "RecentlyViewedSection"),
);

// ============================================================================
console.log("\n6. Scope - only approved 21G-B files changed");
// ============================================================================

const changed = changedTracked();
const unexpected = changed.filter((f) => !APPROVED_21G.has(f));
check(
  "6a. tracked diff limited to the sanctioned 21G-B file set",
  unexpected.length === 0,
  "unexpected: " + (unexpected.join(", ") || "(none)"),
);

const dirtyProtected = PROTECTED_FILES.filter((f) => {
  const d = fileDiff(f);
  return d !== null && d !== "";
});
check(
  "6b. none of the protected files modified",
  dirtyProtected.length === 0,
  dirtyProtected.join(", "),
);

check("6c. no Convex backend files changed", git("diff --name-only HEAD -- convex/") === "");

check(
  "6d. this suite exists in the working tree",
  existsSync(join(ROOT, "tests/21g_merchandising_placement.mjs")),
);

const requiredSource = [
  "src/components/customer/RecommendedForYouSection.tsx",
  "src/components/customer/CrossSellSections.tsx",
  "src/pages/customer/ProductPage.tsx",
];
check(
  "6e. all three approved 21G-B source files are part of the change",
  requiredSource.every((f) => changed.includes(f)),
  "changed: " + (changed.join(", ") || "(none)"),
);

// ============================================================================
console.log("\n" + "=".repeat(70));
if (failed > 0) {
  console.log("\n  Failures (" + failed + "):");
  for (const f of failures) console.log("   - " + f);
  console.log("");
  process.exit(1);
}
console.log("\n=== Result: " + passed + " passed, " + failed + " failed ===\n");
