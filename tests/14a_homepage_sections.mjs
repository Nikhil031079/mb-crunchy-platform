// ============================================================================
// Phase 14A — Admin Homepage Sections -> storefront wiring (structural tests)
//
// Run:  node tests/14a_homepage_sections.mjs
//
// WHAT THIS PINS (approved Phase 14A merge rules):
//   1. Visibility is AND across active-store rows: any `visible: false` hides
//      the mapped type; a missing row is never treated as false, and a type
//      with no rows keeps its default (visible) state.
//   2. `displayOrder` is the single source of truth: `settings.priority` is
//      neither written by the admin save nor read by the sorter, and the
//      merged order for a type is the MINIMUM displayOrder across stores
//      (deterministic tie-break).
//   3. No configuration -> the pre-existing homepage composition and order are
//      preserved exactly; partial configuration never displaces a component
//      into a slot it does not own, and every mapped type occupies exactly one
//      slot (no duplicates, no disappearances).
//   4. Only featuredProducts / combos / partyPacks are mapped (slots 7/9/10);
//      an explicitly hidden mapped type renders nothing in its slot.
//   5. hero / businessUnits / offers / content / testimonials / footer stay
//      inert and HomepageSectionRenderer stays unmounted.
//   6. Admin copy no longer claims instant updates, live previews or enforced
//      schedules.
//   7. Scope: no Convex/schema file changed and the tracked diff is limited to
//      the approved Phase 14A file set.
//
// Repo has no installed test runner (no vitest/jest), so this follows the
// plain-Node tests/*.mjs structural/source-test convention used by the
// 21B-21G suites. Section 10 additionally EXECUTES the shipped merge
// function (transpiled with the repo's own TypeScript) for runtime proof.
// ============================================================================

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

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
    console.log(`  [FAIL] ${name}${detail ? " -- " + detail : ""}`);
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

const HOOK = "src/hooks/use-homepage-sections.ts";
const HOME = "src/pages/customer/HomePage.tsx";
const ADMIN = "src/pages/admin/HomepageSectionsPage.tsx";
const PERSONALIZATION = "src/utils/personalization.ts";
const TOOLBAR = "src/components/admin/homepage-sections/HomepageSectionToolbar.tsx";
const PREVIEW = "src/components/admin/homepage-sections/HomepageSectionPreview.tsx";
const FORM_DIALOG = "src/components/admin/homepage-sections/HomepageSectionFormDialog.tsx";
const TABLE = "src/components/admin/homepage-sections/HomepageSectionTable.tsx";
const MAIN = "src/main.tsx";
const RENDERER = "src/components/customer/HomepageSectionRenderer.tsx";
const CUSTOMER_BARREL = "src/components/customer/index.ts";

// The exact set of tracked files Phase 14A is permitted to modify.
const APPROVED_14A = new Set([
  "src/pages/customer/HomePage.tsx",
  "src/pages/admin/HomepageSectionsPage.tsx",
  "src/utils/personalization.ts",
  "src/components/admin/homepage-sections/HomepageSectionToolbar.tsx",
  "src/components/admin/homepage-sections/HomepageSectionPreview.tsx",
  "src/components/admin/homepage-sections/HomepageSectionFormDialog.tsx",
  "src/components/admin/homepage-sections/HomepageSectionTable.tsx",
  // Repo-sanctioned harness sync (explicitly reported): the 21G suite's
  // HomePage byte-freeze / allow-list / protected-list assertions predate
  // Phase 14A, so they were synced (freeze -> behavioural placement guard,
  // 14A files allow-listed). No 21G functional assertion was weakened,
  // deleted, or made unconditional.
  "tests/21g_merchandising_placement.mjs",
]);

// New files created by Phase 14A (untracked while in flight).
const NEW_14A = [HOOK, "tests/14a_homepage_sections.mjs"];

// ---------------------------------------------------------------------------
console.log("\n0. Phase 14A files present");
// ---------------------------------------------------------------------------
for (const rel of NEW_14A) {
  check(`0. ${rel} exists`, existsSync(join(ROOT, rel)));
}
const hookDoc = read(HOOK) ?? "";
check(
  "0. merge rules are documented in the hook",
  hookDoc.includes("APPROVED MERGE RULES") && hookDoc.includes("MINIMUM displayOrder wins"),
);

// ---------------------------------------------------------------------------
console.log("\n1. Visibility merge rule (AND across active-store rows)");
// ---------------------------------------------------------------------------
check(
  "1a. any hidden store row hides the mapped type",
  has(HOOK, "if (!row.visible) config.visible[row.sectionType] = false;"),
);
check(
  "1b. default visibility is visible (missing rows never hide)",
  has(HOOK, "visible: { featuredProducts: true, combos: true, partyPacks: true }"),
);
check(
  "1c. no code path can set visibility back to true from a row",
  countOf(HOOK, "config.visible[") === 1 &&
    lacks(HOOK, "config.visible[row.sectionType] = true"),
  "config.visible assignments=" + countOf(HOOK, "config.visible["),
);
check(
  "1d. soft-deleted rows are ignored",
  has(HOOK, "if (row.deletedAt) continue;"),
);
check(
  "1e. unmapped section types are ignored for visibility",
  has(HOOK, "if (!isMappedSectionType(row.sectionType)) continue;"),
);

// ---------------------------------------------------------------------------
console.log("\n2. Ordering merge rule (displayOrder authoritative, min wins)");
// ---------------------------------------------------------------------------
check(
  "2a. merged order is the minimum displayOrder across store rows",
  has(HOOK, "Math.min(min, row.displayOrder)"),
);
check(
  "2b. no maximum/last-write ordering fallback exists",
  lacks(HOOK, "Math.max("),
);
check(
  "2c. settings.priority is not read anywhere in the merge",
  lacks(HOOK, "priority"),
);
check(
  "2d. no configuration at all preserves the existing composition exactly",
  has(HOOK, "if (configured.length === 0) return config;") &&
    has(HOOK, "orderedTypes: [...MAPPED_SECTION_TYPES]"),
);
check(
  "2e. ties resolve deterministically (default slot, then type key)",
  has(HOOK, "MAPPED_DEFAULT_SLOTS[a] - MAPPED_DEFAULT_SLOTS[b]") &&
    has(HOOK, "return a.localeCompare(b);"),
);
check(
  "2f. while rows are still loading the baseline config is returned",
  has(HOOK, "if (stillLoading) return baselineHomepageSections();"),
);
check(
  "2g. all four business-unit subscriptions skip when the id is absent",
  countOf(HOOK, '"skip"') === 4,
  "skip count=" + countOf(HOOK, '"skip"'),
);

// ---------------------------------------------------------------------------
console.log("\n3. Partial configuration keeps every component in its own slot");
// ---------------------------------------------------------------------------
check(
  "3a. unconfigured types keep their default slot",
  has(HOOK, "if (!configured.includes(type)) slotByType.set(type, MAPPED_DEFAULT_SLOTS[type]);"),
);
check(
  "3b. configured types are placed only into slots they own",
  has(HOOK, "const freeSlots = configured") &&
    has(HOOK, "orderedConfigured.forEach((type, index) => slotByType.set(type, freeSlots[index]));"),
);
check(
  "3c. the result is always built from the canonical 3-type list (no dupes, none dropped)",
  has(HOOK, "config.orderedTypes = [...MAPPED_SECTION_TYPES].sort("),
);
check(
  "3d. result length can never exceed the three mapped types",
  countOf(HOOK, "config.orderedTypes = ") === 1,
);

// ---------------------------------------------------------------------------
console.log("\n4. HomePage wiring (slot order, single render, hidden => null)");
// ---------------------------------------------------------------------------
check(
  "4a. hidden mapped type renders nothing in place",
  has(HOME, "if (!homepageSections.visible[type]) return null;") &&
    idxOf(HOME, "if (!homepageSections.visible[type]) return null;") <
      idxOf(HOME, "switch (type)"),
);
check(
  "4b. exactly one render site per mapped component (no duplicates)",
  countOf(HOME, "<BestSellersSection") === 1 &&
    countOf(HOME, "<ComboOffersSection") === 1 &&
    countOf(HOME, "<PartyPacksSection") === 1,
  `best=${countOf(HOME, "<BestSellersSection")} combos=${countOf(HOME, "<ComboOffersSection")} packs=${countOf(HOME, "<PartyPacksSection")}`,
);
const slot0 = idxOf(HOME, "renderMappedSection(homepageSections.orderedTypes[0])");
const rec = idxOf(HOME, "<RecommendedForYouSection");
const slot1 = idxOf(HOME, "renderMappedSection(homepageSections.orderedTypes[1])");
const slot2 = idxOf(HOME, "renderMappedSection(homepageSections.orderedTypes[2])");
check(
  "4c. mapped slots keep their homepage positions (7 before Recommended, 9/10 after)",
  slot0 > 0 && rec > 0 && slot1 > rec && slot2 > slot1,
  `slot0=${slot0} rec=${rec} slot1=${slot1} slot2=${slot2}`,
);
check(
  "4d. the hook is subscribed with the active storefront business units",
  has(HOME, "useHomepageSections(activeBusinessUnits.map((bu) => bu._id))"),
);
check(
  "4e. pre-existing sections all still render once (composition untouched)",
  countOf(HOME, "<HomepageFilterRail") === 1 &&
    countOf(HOME, "<CategoryNavBar") === 1 &&
    countOf(HOME, "<CategoriesSection") === 1 &&
    countOf(HOME, "<TodaySpecialsSection") === 1 &&
    countOf(HOME, "<TrendingRailSection") === 1 &&
    countOf(HOME, "<RecommendedForYouSection") === 1 &&
    countOf(HOME, "<PromoRibbonSection") === 1 &&
    countOf(HOME, "<HomepageInfoStrip") === 1 &&
    countOf(HOME, "<ItemDetailsModal") === 1,
);

// ---------------------------------------------------------------------------
console.log("\n5. Only three mapped components; renderer stays unmounted");
// ---------------------------------------------------------------------------
check(
  "5a. mapped type list is exactly the three approved types",
  has(HOOK, 'export const MAPPED_SECTION_TYPES = ["featuredProducts", "combos", "partyPacks"] as const;'),
);
check(
  "5b. default slots are 7 / 9 / 10",
  has(HOOK, "featuredProducts: 7,") && has(HOOK, "combos: 9,") && has(HOOK, "partyPacks: 10,"),
);
check(
  "5c. no unmapped section component is rendered on the homepage",
  lacks(HOME, "<ContentSection") &&
    lacks(HOME, "BusinessUnitSections") &&
    lacks(HOME, "<TestimonialsSection") &&
    lacks(HOME, "<FooterSection") &&
    lacks(HOME, "<OffersSection"),
);
check(
  "5d. hero / trust / ribbon data flow untouched (still hardcoded slots)",
  has(HOME, 'api.content.getByType, { contentType: "hero" }') &&
    has(HOME, "<PromoRibbonSection") &&
    has(HOME, "<HomepageInfoStrip"),
);

// HomepageSectionRenderer must not be mounted by any route or page.
function walkSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSources(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}
const sources = walkSources(join(ROOT, "src")).map((p) => relative(ROOT, p).replace(/\\/g, "/"));
const rendererImporters = sources.filter((rel) => {
  if (rel === RENDERER || rel === CUSTOMER_BARREL) return false;
  const src = code(rel);
  return src !== null && src.includes("HomepageSectionRenderer");
});
check(
  "5e. HomepageSectionRenderer is imported by nothing (remains unmounted)",
  rendererImporters.length === 0,
  rendererImporters.join(", "),
);
check("5f. the renderer source file itself still exists (not deleted)", existsSync(join(ROOT, RENDERER)));

// ---------------------------------------------------------------------------
console.log("\n6. Admin: displayOrder is the single source of truth");
// ---------------------------------------------------------------------------
check(
  "6a. admin save no longer writes settings.priority",
  countOf(ADMIN, "priority:") === 0 && lacks(ADMIN, "priority: values.displayOrder"),
  "priority occurrences=" + countOf(ADMIN, "priority:"),
);
check(
  "6b. admin save still writes the authoritative displayOrder",
  has(ADMIN, "displayOrder: values.displayOrder"),
);
check(
  "6c. admin reorder writes displayOrder for every moved row",
  has(ADMIN, "displayOrder: orderIndex + 1"),
);
check(
  "6d. homepage sorter no longer consults settings.priority",
  lacks(PERSONALIZATION, ".priority") &&
    has(PERSONALIZATION, "return a.displayOrder - b.displayOrder;"),
);
check(
  "6e. no schema / Convex function changed",
  git("diff --name-only HEAD -- convex/") === "",
  git("diff --name-only HEAD -- convex/"),
);

// ---------------------------------------------------------------------------
console.log("\n7. Admin copy no longer over-promises");
// ---------------------------------------------------------------------------
check("7a. toolbar no longer claims changes apply instantly", lacks(TOOLBAR, "instantly"));
check(
  "7b. toolbar states which sections are wired and that dates are inert",
  has(TOOLBAR, "Featured Products, Combos and Party Packs") && has(TOOLBAR, "not enforced yet"),
);
check("7c. preview no longer claims to be a live preview", lacks(PREVIEW, "A live preview of"));
check(
  "7d. preview describes itself as a summary",
  has(PREVIEW, "not a live storefront preview") && has(PREVIEW, "Schedule (not enforced)"),
);
check("7e. page header no longer claims schedules", lacks(ADMIN, "set schedules"));
check(
  "7f. form states that start/end dates are not enforced",
  has(FORM_DIALOG, "not enforced") && has(FORM_DIALOG, "Start and end dates are saved for later use"),
);
check(
  "7g. form dialog describes fields, not storefront effect",
  lacks(FORM_DIALOG, "Control how this section appears"),
);
check(
  "7h. schedule badges describe the saved date window, not storefront state",
  lacks(TABLE, '"Live now"') &&
    lacks(TABLE, '"Scheduled"') &&
    lacks(TABLE, '"Always on"') &&
    has(TABLE, '<TableHead>Dates</TableHead>'),
);
check(
  "7i. preview schedule summary never claims the section is always on",
  lacks(PREVIEW, '"Always on"') && lacks(PREVIEW, "Hidden from homepage"),
);

// ---------------------------------------------------------------------------
console.log("\n8. Scope — only approved Phase 14A files changed");
// ---------------------------------------------------------------------------
const changed = git("diff --name-only HEAD")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const unexpected = changed.filter((f) => !APPROVED_14A.has(f));
check(
  "8a. tracked diff limited to the approved Phase 14A file set",
  unexpected.length === 0,
  "unexpected: " + (unexpected.join(", ") || "(none)"),
);
// Phase 14A is committed, so the HEAD worktree diff is empty by definition
// and can no longer prove the phase touched its files (the same reason the
// 21G suite anchors its committed-scope check to a baseline). 8b therefore
// measures baseline -> worktree, which spans committed AND uncommitted
// changes: it stays true for as long as the 14A edit is present and fails
// if any approved file is ever reverted. 8a above is intentionally
// unchanged and still guards uncommitted drift.
const BASELINE_14A = "2b09563"; // stable pre-Phase-14A parent commit
const sinceBaseline14A = git("diff --name-only " + BASELINE_14A)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
check(
  "8b. every approved tracked file is actually part of the change",
  [...APPROVED_14A].every((f) => sinceBaseline14A.includes(f)),
  "missing: " + [...APPROVED_14A].filter((f) => !sinceBaseline14A.includes(f)).join(", "),
);
const protectedHits = changed.filter((f) =>
  [
    "package.json",
    "convex/schema.ts",
    "src/stores/cart.ts",
    "src/pages/customer/CartPage.tsx",
    "src/pages/customer/CheckoutPage.tsx",
    "src/pages/customer/CategoryPage.tsx",
    "src/pages/customer/BusinessUnitPage.tsx",
    "src/pages/customer/ProductPage.tsx",
  ].includes(f),
);
check("8c. no protected file modified", protectedHits.length === 0, protectedHits.join(", "));
check(
  "8d. no checkout / payment / shipping / order / inventory source changed",
  !changed.some((f) => /(checkout|payment|razorpay|shiprocket|orders|inventory)/i.test(f)),
  changed.filter((f) => /(checkout|payment|razorpay|shiprocket|orders|inventory)/i.test(f)).join(", "),
);

// ---------------------------------------------------------------------------
console.log("\n9. Build artifact sanity (skipped when dist/ is absent)");
// ---------------------------------------------------------------------------
const distAssets = existsSync(join(ROOT, "dist/assets"))
  ? readdirSync(join(ROOT, "dist/assets")).filter((f) => f.endsWith(".js"))
  : [];
if (distAssets.length === 0) {
  console.log("  [NOTE] dist/assets not present or empty — bundle check skipped.");
} else {
  const bundled = distAssets.filter((f) =>
    readFileSync(join(ROOT, "dist/assets", f), "utf8").includes("HomepageSectionRenderer"),
  );
  check("9a. HomepageSectionRenderer is not in any built bundle", bundled.length === 0, bundled.join(", "));
}

// ---------------------------------------------------------------------------
console.log("\n10. Runtime merge behaviour (executes the shipped hook)");
// ---------------------------------------------------------------------------
// The structural checks above pin code patterns; these checks EXECUTE the
// shipped mergeHomepageSectionRows() (transpiled with the repo's own
// TypeScript, framework imports stubbed) so the approved runtime cases are
// proven, not just pattern-matched:
//   - no configuration -> baseline composition/ordering;
//   - Kitchen hidden + Mart missing -> hidden;
//   - Kitchen visible + Mart hidden -> hidden;
//   - conflicting displayOrder -> minimum wins (settings.priority ignored);
//   - one configured + two unconfigured -> all three preserved, no dupes;
//   - explicitly hidden -> omitted via the visible flag;
//   - unmapped types -> inert; soft-deleted rows ignored; ties deterministic.
let hookMod = null;
let hookLoadError = "";
try {
  const require14a = createRequire(import.meta.url);
  const ts = require14a("typescript");
  const hookSrc = read(HOOK);
  if (!hookSrc) throw new Error(HOOK + " not found");
  const js = ts.transpileModule(hookSrc, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const stubbed = js
    .replace(/import\s*\{[^}]*\}\s*from\s*"convex\/react"\s*;?/g, "const useQuery = () => undefined;")
    .replace(/import\s*\{[^}]*\}\s*from\s*"@convex\/_generated\/api"\s*;?/g, "const api = {};")
    .replace(/import\s*\{[^}]*\}\s*from\s*"@convex\/_generated\/dataModel"\s*;?/g, "");
  const tmpFile = join(tmpdir(), "mb14a-hook-runtime.mjs");
  writeFileSync(tmpFile, stubbed, "utf8");
  try {
    hookMod = await import(pathToFileURL(tmpFile).href);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore cleanup failure */ }
  }
} catch (err) {
  hookLoadError = err instanceof Error ? err.message : String(err);
}
check("10. shipped hook loads for runtime merge tests", hookMod !== null, hookLoadError);

if (hookMod) {
  const { mergeHomepageSectionRows, baselineHomepageSections, MAPPED_SECTION_TYPES, MAPPED_DEFAULT_SLOTS } = hookMod;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mkRow = (sectionType, opts = {}) => ({
    businessUnitId: opts.businessUnitId ?? "bu-kitchen",
    sectionType,
    title: sectionType,
    displayOrder: opts.displayOrder ?? 1,
    visible: opts.visible ?? true,
    settings: opts.settings,
    ...(opts.deletedAt !== undefined ? { deletedAt: opts.deletedAt } : {}),
  });

  // 10a. no configuration -> existing composition and ordering unchanged
  {
    const got = mergeHomepageSectionRows([]);
    check(
      "10a. no configuration -> baseline visibility",
      eq(got.visible, { featuredProducts: true, combos: true, partyPacks: true }),
      JSON.stringify(got.visible),
    );
    check(
      "10a. no configuration -> baseline ordering",
      eq(got.orderedTypes, ["featuredProducts", "combos", "partyPacks"]),
      JSON.stringify(got.orderedTypes),
    );
    check("10a. empty merge equals the baseline helper", eq(got, baselineHomepageSections()), JSON.stringify(got));
  }

  // 10b. Kitchen hidden + Mart missing row -> hidden (missing is not false)
  {
    const got = mergeHomepageSectionRows([
      mkRow("combos", { businessUnitId: "bu-kitchen", visible: false, displayOrder: 1 }),
    ]);
    check("10b. Kitchen hidden + Mart missing -> hidden", got.visible.combos === false, JSON.stringify(got.visible));
    check(
      "10b. sibling types unaffected",
      got.visible.featuredProducts === true && got.visible.partyPacks === true,
      JSON.stringify(got.visible),
    );
    check(
      "10b. all three components preserved",
      eq([...got.orderedTypes].sort(), ["combos", "featuredProducts", "partyPacks"]),
      JSON.stringify(got.orderedTypes),
    );
  }

  // 10c. Kitchen visible + Mart hidden -> hidden (AND semantics)
  {
    const got = mergeHomepageSectionRows([
      mkRow("combos", { businessUnitId: "bu-kitchen", visible: true, displayOrder: 1 }),
      mkRow("combos", { businessUnitId: "bu-mart", visible: false, displayOrder: 2 }),
    ]);
    check("10c. Kitchen visible + Mart hidden -> hidden", got.visible.combos === false, JSON.stringify(got.visible));
  }

  // 10d. conflicting displayOrder -> minimum wins; settings.priority ignored
  {
    const got = mergeHomepageSectionRows([
      mkRow("combos", { businessUnitId: "bu-kitchen", displayOrder: 9, settings: { priority: 0 } }),
      mkRow("combos", { businessUnitId: "bu-mart", displayOrder: 2, settings: { priority: 0 } }),
      mkRow("featuredProducts", { businessUnitId: "bu-kitchen", displayOrder: 5, settings: { priority: 999 } }),
    ]);
    check("10d. minimum displayOrder wins", got.orderedTypes[0] === "combos", JSON.stringify(got.orderedTypes));
    const flipped = mergeHomepageSectionRows([
      mkRow("combos", { businessUnitId: "bu-kitchen", displayOrder: 9, settings: { priority: 999 } }),
      mkRow("featuredProducts", { businessUnitId: "bu-kitchen", displayOrder: 5, settings: { priority: 0 } }),
    ]);
    check(
      "10d. settings.priority cannot override displayOrder",
      flipped.orderedTypes[0] === "featuredProducts",
      JSON.stringify(flipped.orderedTypes),
    );
  }

  // 10e. one configured + two unconfigured -> all preserved, no duplicates
  {
    const got = mergeHomepageSectionRows([mkRow("featuredProducts", { displayOrder: 99 })]);
    check(
      "10e. single-config keeps all three components in place",
      eq(got.orderedTypes, ["featuredProducts", "combos", "partyPacks"]),
      JSON.stringify(got.orderedTypes),
    );
    check("10e. no duplicates", new Set(got.orderedTypes).size === 3, JSON.stringify(got.orderedTypes));
  }

  // 10f. explicitly hidden type -> omitted (flag false; HomePage renders null
  // in place — pinned structurally in 4a — so siblings never shift)
  {
    const got = mergeHomepageSectionRows([mkRow("partyPacks", { visible: false, displayOrder: 1 })]);
    check("10f. explicitly hidden type flagged", got.visible.partyPacks === false, JSON.stringify(got.visible));
    check(
      "10f. hidden type keeps exactly one slot (no shift, no dupe)",
      eq([...got.orderedTypes].sort(), ["combos", "featuredProducts", "partyPacks"]) &&
        new Set(got.orderedTypes).size === 3,
      JSON.stringify(got.orderedTypes),
    );
  }

  // 10g. unmapped types -> inert, even with hidden/off-scale rows
  {
    const got = mergeHomepageSectionRows([
      mkRow("hero", { visible: false, displayOrder: -100 }),
      mkRow("businessUnits", { visible: false, displayOrder: -99 }),
      mkRow("offers", { visible: false, displayOrder: -98 }),
      mkRow("content", { visible: false, displayOrder: -97 }),
      mkRow("testimonials", { visible: false, displayOrder: -96 }),
      mkRow("footer", { visible: false, displayOrder: -95 }),
    ]);
    check(
      "10g. unmapped types leave visibility untouched",
      eq(got.visible, { featuredProducts: true, combos: true, partyPacks: true }),
      JSON.stringify(got.visible),
    );
    check(
      "10g. unmapped types leave ordering untouched",
      eq(got.orderedTypes, ["featuredProducts", "combos", "partyPacks"]),
      JSON.stringify(got.orderedTypes),
    );
  }

  // 10h. ties resolve deterministically (default slot, then type key)
  {
    const a = mergeHomepageSectionRows([
      mkRow("combos", { displayOrder: 5 }),
      mkRow("featuredProducts", { displayOrder: 5 }),
    ]);
    const b = mergeHomepageSectionRows([
      mkRow("featuredProducts", { displayOrder: 5 }),
      mkRow("combos", { displayOrder: 5 }),
    ]);
    check("10h. tie broken by default slot", a.orderedTypes[0] === "featuredProducts", JSON.stringify(a.orderedTypes));
    check("10h. tie-break independent of row order", eq(a, b), JSON.stringify([a.orderedTypes, b.orderedTypes]));
  }

  // 10i. soft-deleted rows ignored
  {
    const got = mergeHomepageSectionRows([
      mkRow("combos", { visible: false, displayOrder: 1, deletedAt: 123456789 }),
    ]);
    check("10i. soft-deleted hidden row does not hide", got.visible.combos === true, JSON.stringify(got.visible));
    check(
      "10i. soft-deleted row does not reorder",
      eq(got.orderedTypes, ["featuredProducts", "combos", "partyPacks"]),
      JSON.stringify(got.orderedTypes),
    );
  }

  // 10j. mapped-type / slot contract at runtime
  {
    check(
      "10j. exactly three mapped types",
      eq([...MAPPED_SECTION_TYPES], ["featuredProducts", "combos", "partyPacks"]),
      JSON.stringify(MAPPED_SECTION_TYPES),
    );
    check(
      "10j. default slots are 7 / 9 / 10",
      MAPPED_DEFAULT_SLOTS.featuredProducts === 7 &&
        MAPPED_DEFAULT_SLOTS.combos === 9 &&
        MAPPED_DEFAULT_SLOTS.partyPacks === 10,
      JSON.stringify(MAPPED_DEFAULT_SLOTS),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== Result:", passed, "passed,", failed, "failed ===");
if (failed > 0) {
  console.log("Failed checks:\n - " + failures.join("\n - "));
  process.exit(1);
}
