// ============================================================================
// MB CRUNCHY — 19C Admin Save Reliability + Mutation Error UX Tests
//
// Verifies the Phase 19C fixes for two confirmed 19A admin issues:
//  1. Six save paths lacked duplicate-submit protection (Products,
//     Categories, Banners, Announcements/HappyHour, Inventory, Business
//     Units) — now guarded with the established isSaving re-entry pattern
//     from Offers/Combos/PartyPacks/MealDeals.
//  2. Mutation failures unmounted the entire list behind a misleading
//     "Could not load X" error state — mutations now report to a
//     dismissible actionError banner above the always-mounted list, while
//     the list-level load error remains reserved for query failures.
//
// Uses the repo's readSource structural convention (tests 43/45/17C/19B)
// plus the real exported validators to prove business logic is unchanged.
//
// RUN: SESSION_SECRET=<32+ char test secret> vitest run tests/19c_admin_save_reliability.test.ts
// (SESSION_SECRET is required at import time by convex/utils/crypto.ts.)
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { validateComboValues } from "../src/pages/admin/CombosPage";
import { validateOfferValues } from "../src/pages/admin/OffersPage";
import { validateMealDealValues } from "../src/pages/admin/MealDealsPage";
import { validatePartyPackValues } from "../src/pages/admin/PartyPacksPage";
import { validateFlashSaleValues } from "../src/pages/admin/FlashSalesPage";

function readSource(relativePath: string): string {
  // Normalize CRLF: the repo mixes line endings and markers assume "\n".
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8").replace(/\r\n/g, "\n");
}

/** Slice a source file from a start marker to an end marker (exclusive). */
function block(src: string, start: string, end: string): string {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`start marker not found: ${start}`);
  const to = src.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`end marker not found: ${end}`);
  return src.slice(from, to);
}

/** Assert the standard isSaving re-entry guard around a save handler. */
function expectSaveGuard(page: string, handlerName: string) {
  const src = readSource(page);
  expect(src).toContain("const [isSaving, setIsSaving] = useState(false);");
  const handler = block(src, `const ${handlerName} = async`, "};\n");
  expect(handler).toContain("if (isSaving) return;");
  expect(handler).toContain("setIsSaving(true);");
  expect(handler).toContain("finally {");
  expect(handler).toContain("setIsSaving(false);");
}

/** Assert a form dialog disables its submit control while saving. */
function expectDialogPendingState(dialog: string) {
  const src = readSource(dialog);
  expect(src).toContain("isSaving?: boolean");
  expect(src).toContain("disabled={isSaving}");
}

// ============================================================================
// PART 1 — duplicate-submit protection (tests 1-7)
// ============================================================================

describe("19C — duplicate-submit protection", () => {
  it("TEST 1 — products save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/ProductsPage.tsx", "saveProduct");
    const page = readSource("src/pages/admin/ProductsPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    expectDialogPendingState("src/components/admin/products/ProductFormDialog.tsx");
  });

  it("TEST 2 — categories save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/CategoriesPage.tsx", "saveCategory");
    const page = readSource("src/pages/admin/CategoriesPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    expectDialogPendingState("src/components/admin/categories/CategoryFormDialog.tsx");
  });

  it("TEST 3 — banners save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/BannersPage.tsx", "saveBanner");
    const page = readSource("src/pages/admin/BannersPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    expectDialogPendingState("src/components/admin/banners/BannerFormDialog.tsx");
  });

  it("TEST 4 — announcements save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/HappyHourPage.tsx", "saveBanner");
    const page = readSource("src/pages/admin/HappyHourPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    // HappyHour reuses the banner form with its type lock intact.
    expect(page).toContain('lockContentType="announcement"');
    expectDialogPendingState("src/components/admin/banners/BannerFormDialog.tsx");
  });

  it("TEST 5 — inventory save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/InventoryPage.tsx", "saveInventory");
    const page = readSource("src/pages/admin/InventoryPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    expectDialogPendingState("src/components/admin/inventory/InventoryFormDialog.tsx");
  });

  it("TEST 6 — business units save has re-entry guard + pending dialog state", () => {
    expectSaveGuard("src/pages/admin/BusinessUnitsPage.tsx", "saveBusinessUnit");
    const page = readSource("src/pages/admin/BusinessUnitsPage.tsx");
    expect(page).toContain("isSaving={isSaving}");
    expectDialogPendingState("src/components/admin/business-units/BusinessUnitFormDialog.tsx");
  });

  it("TEST 7 — every affected submit control receives the pending disabled state", () => {
    for (const dialog of [
      "src/components/admin/products/ProductFormDialog.tsx",
      "src/components/admin/categories/CategoryFormDialog.tsx",
      "src/components/admin/banners/BannerFormDialog.tsx",
      "src/components/admin/inventory/InventoryFormDialog.tsx",
      "src/components/admin/business-units/BusinessUnitFormDialog.tsx",
    ]) {
      expectDialogPendingState(dialog);
    }
    // The reference pages that established the pattern are unchanged.
    for (const page of [
      "src/pages/admin/OffersPage.tsx",
      "src/pages/admin/CombosPage.tsx",
      "src/pages/admin/PartyPacksPage.tsx",
      "src/pages/admin/MealDealsPage.tsx",
      "src/pages/admin/FlashSalesPage.tsx",
    ]) {
      expect(readSource(page)).toContain("if (isSaving) return;");
    }
  });
});

// ============================================================================
// PART 2 — mutation error UX (tests 8-10)
// ============================================================================

const LOAD_TITLES: Array<{ page: string; title: string; section: string }> = [
  { page: "src/pages/admin/OrdersPage.tsx", title: "Could not load orders", section: 'aria-label="Order management"' },
  { page: "src/pages/admin/ProductsPage.tsx", title: "Could not load products", section: 'aria-label="Product management"' },
  { page: "src/pages/admin/CombosPage.tsx", title: "Could not load combos", section: 'aria-label="Combo management"' },
  { page: "src/pages/admin/BannersPage.tsx", title: "Could not load banners", section: 'aria-label="Banner management"' },
  { page: "src/pages/admin/InventoryPage.tsx", title: "Could not load inventory", section: 'aria-label="Inventory management"' },
  { page: "src/pages/admin/MealDealsPage.tsx", title: "Could not load meal deals", section: 'aria-label="Meal deal management"' },
  { page: "src/pages/admin/OffersPage.tsx", title: "Could not load offers", section: 'aria-label="Offer management"' },
  { page: "src/pages/admin/CategoriesPage.tsx", title: "Could not load categories", section: 'aria-label="Category management"' },
  { page: "src/pages/admin/HappyHourPage.tsx", title: "Could not load announcements", section: 'aria-label="Happy hour management"' },
  { page: "src/pages/admin/BusinessUnitsPage.tsx", title: "Could not load business units", section: 'aria-label="Business unit management"' },
  { page: "src/pages/admin/PartyPacksPage.tsx", title: "Could not load party packs", section: 'aria-label="Party pack management"' },
  { page: "src/pages/admin/FlashSalesPage.tsx", title: "Could not load flash sales", section: 'aria-label="Flash sale management"' },
];

describe("19C — mutation error UX", () => {
  it("TEST 8 — query failure still renders the list-level load error", () => {
    for (const { page, title } of LOAD_TITLES) {
      const src = readSource(page);
      // The list-level branch is keyed on the query/load error state
      // (multi-line and single-line render styles both qualify).
      expect(src).toContain(title);
      expect(src).toContain("{error ?");
    }
  });

  it("TEST 9 — mutation errors no longer replace/unmount the list", () => {
    for (const { page, section } of LOAD_TITLES) {
      const src = readSource(page);
      // Mutation/validation failures route to the banner state…
      expect(src).toContain("setActionError(");
      // …rendered as a dismissible banner above the content…
      expect(src).toContain("{actionError ?");
      expect(src).toContain("onClick={() => setActionError(null)}");
      // …while the list section still exists and is still gated on the
      // load-error state, not on the mutation state (the banner sits
      // above that branch).
      const errorGate = src.indexOf("{error ?");
      const sectionIdx = src.indexOf(section);
      expect(errorGate).toBeGreaterThanOrEqual(0);
      expect(sectionIdx).toBeGreaterThan(errorGate);
      expect(src.indexOf("{actionError ?")).toBeLessThan(errorGate);
      // No mutation catch feeds the list-replacing load error anymore.
      const catches = src.split("} catch (err) {").slice(1);
      expect(catches.length).toBeGreaterThan(0);
      for (const c of catches) {
        const body = c.slice(0, c.indexOf("}"));
        expect(body).not.toContain("setError(");
      }
    }
  });

  it("TEST 10 — mutation errors are visibly distinct from query-load failures", () => {
    const expectations: Array<{ page: string; actionTitles: string[]; loadTitle: string }> = [
      { page: "src/pages/admin/OrdersPage.tsx", actionTitles: ["Could not update orders", "Could not cancel orders", "Could not refund orders", "Could not update order status"], loadTitle: "Could not load orders" },
      { page: "src/pages/admin/ProductsPage.tsx", actionTitles: ["Could not save product", "Could not delete product", "Could not restore product"], loadTitle: "Could not load products" },
      { page: "src/pages/admin/CombosPage.tsx", actionTitles: ["Could not save combo", "Could not delete combo", "Could not restore combo"], loadTitle: "Could not load combos" },
      { page: "src/pages/admin/BannersPage.tsx", actionTitles: ["Could not save banner", "Could not delete banner", "Could not restore banner"], loadTitle: "Could not load banners" },
      { page: "src/pages/admin/InventoryPage.tsx", actionTitles: ["Could not save inventory item", "Could not adjust stock", "Could not update stock", "Could not delete inventory item"], loadTitle: "Could not load inventory" },
      { page: "src/pages/admin/MealDealsPage.tsx", actionTitles: ["Could not save meal deal", "Could not delete meal deal", "Could not restore meal deal"], loadTitle: "Could not load meal deals" },
      { page: "src/pages/admin/OffersPage.tsx", actionTitles: ["Could not save offer", "Could not delete offer", "Could not restore offer"], loadTitle: "Could not load offers" },
      { page: "src/pages/admin/CategoriesPage.tsx", actionTitles: ["Could not save category", "Could not delete category", "Could not restore category"], loadTitle: "Could not load categories" },
      { page: "src/pages/admin/HappyHourPage.tsx", actionTitles: ["Could not save announcement", "Could not delete announcement", "Could not restore announcement"], loadTitle: "Could not load announcements" },
      { page: "src/pages/admin/BusinessUnitsPage.tsx", actionTitles: ["Could not save business unit", "Could not delete business unit", "Could not restore business unit"], loadTitle: "Could not load business units" },
      { page: "src/pages/admin/PartyPacksPage.tsx", actionTitles: ["Could not save party pack", "Could not delete party pack", "Could not restore party pack"], loadTitle: "Could not load party packs" },
      { page: "src/pages/admin/FlashSalesPage.tsx", actionTitles: ["Could not save flash sale", "Could not delete flash sale", "Could not restore flash sale"], loadTitle: "Could not load flash sales" },
    ];
    for (const { page, actionTitles, loadTitle } of expectations) {
      const src = readSource(page);
      for (const title of actionTitles) {
        expect(src).toContain(title);
        expect(title).not.toBe(loadTitle);
      }
      expect(src).toContain(loadTitle);
    }
  });
});

// ============================================================================
// PART 3 — draft preservation + retry (tests 11-12)
// ============================================================================

describe("19C — draft preservation and retry", () => {
  it("TEST 11 — failed mutations preserve the form/dialog draft", () => {
    const saves: Array<{ page: string; handler: string }> = [
      { page: "src/pages/admin/ProductsPage.tsx", handler: "saveProduct" },
      { page: "src/pages/admin/CategoriesPage.tsx", handler: "saveCategory" },
      { page: "src/pages/admin/BannersPage.tsx", handler: "saveBanner" },
      { page: "src/pages/admin/HappyHourPage.tsx", handler: "saveBanner" },
      { page: "src/pages/admin/InventoryPage.tsx", handler: "saveInventory" },
      { page: "src/pages/admin/BusinessUnitsPage.tsx", handler: "saveBusinessUnit" },
      { page: "src/pages/admin/OffersPage.tsx", handler: "saveOffer" },
      { page: "src/pages/admin/CombosPage.tsx", handler: "saveCombo" },
      { page: "src/pages/admin/MealDealsPage.tsx", handler: "saveMealDeal" },
      { page: "src/pages/admin/PartyPacksPage.tsx", handler: "savePartyPack" },
      { page: "src/pages/admin/FlashSalesPage.tsx", handler: "saveOffer" },
    ];
    for (const { page, handler } of saves) {
      const src = readSource(page);
      const fn = block(src, `const ${handler} = async`, "};\n");
      // Success closes the dialog; failure leaves it open with values intact.
      expect(fn).toContain("setFormOpen(false);");
      const catchBody = fn.slice(fn.indexOf("} catch"));
      expect(catchBody).not.toContain("setFormOpen(false)");
      expect(catchBody).not.toContain("setEditing");
    }
    // Order status dialog stays open on failure so the admin can retry.
    const orders = readSource("src/pages/admin/OrdersPage.tsx");
    const confirm = block(orders, "const confirmStatusUpdate = async", "};\n");
    const confirmCatch = confirm.slice(confirm.indexOf("} catch"));
    expect(confirmCatch).toContain("setActionError(");
    expect(confirmCatch).not.toContain("setStatusTarget(null)");
    expect(confirmCatch).not.toContain("setStatusGoal(null)");
    // 13C dialog remount/key hygiene remains intact on every touched dialog.
    for (const dialog of [
      "src/components/admin/products/ProductFormDialog.tsx",
      "src/components/admin/categories/CategoryFormDialog.tsx",
      "src/components/admin/banners/BannerFormDialog.tsx",
      "src/components/admin/inventory/InventoryFormDialog.tsx",
      "src/components/admin/business-units/BusinessUnitFormDialog.tsx",
    ]) {
      expect(readSource(dialog)).toContain("dialogKey");
    }
  });

  it("TEST 12 — successful retry remains possible (guard resets, validators intact)", () => {
    // The re-entry guard is always released in `finally`, so a failed
    // attempt never wedges the form.
    for (const page of [
      "src/pages/admin/ProductsPage.tsx",
      "src/pages/admin/CategoriesPage.tsx",
      "src/pages/admin/BannersPage.tsx",
      "src/pages/admin/HappyHourPage.tsx",
      "src/pages/admin/InventoryPage.tsx",
      "src/pages/admin/BusinessUnitsPage.tsx",
    ]) {
      const src = readSource(page);
      expect(src).toContain("} finally {");
      expect(src).toContain("setIsSaving(false);");
    }
    // Backend validation semantics are unchanged (client mirrors server).
    expect(validateOfferValues({
      businessUnitId: "", title: "T", description: "", code: "",
      discountType: "percentage", discountValue: 10, minOrderValue: "",
      maxDiscount: "", startsAt: "2026-10-01T10:00", endsAt: "2026-10-02T10:00",
      usageLimit: "", status: "active", displayOrder: 1, banner: "",
      featured: false, homeVisible: true, categoryVisible: true,
      isFlashSale: false, flashSalePriority: 0, flashSaleFeatured: false,
    } as Parameters<typeof validateOfferValues>[0])).toMatch(/business unit/i);
    expect(validateComboValues({
      businessUnitId: "bu_1", name: "C", slug: "c", description: "",
      imageUrl: "", items: [{ catalogItemId: "ci_1", quantity: 1 }],
      price: 99, compareAtPrice: 0, savingsPercentage: 0,
      status: "active", featured: false, displayOrder: 1, highlightBadge: "",
    } as Parameters<typeof validateComboValues>[0])).toBeNull();
    expect(validateMealDealValues({
      businessUnitId: "bu_1", name: "M", status: "active", dealPrice: 99,
      qualifyingItems: [{ catalogItemId: "ci_1", quantity: 1 }],
      applyToCombos: false, applyToPartyPacks: false,
      cartSmartDetection: false, displayOrder: 1,
    } as Parameters<typeof validateMealDealValues>[0])).toBeNull();
    expect(validatePartyPackValues({
      businessUnitId: "bu_1", name: "P", slug: "p", description: "",
      imageUrl: "", items: [{ catalogItemId: "ci_1", quantity: 1 }],
      minServings: 2, maxServings: 4, price: 499, compareAtPrice: 0,
      status: "active", featured: false, displayOrder: 1,
    } as Parameters<typeof validatePartyPackValues>[0])).toBeNull();
    expect(validateFlashSaleValues({
      businessUnitId: "bu_1", title: "F", description: "", code: "",
      discountType: "percentage", discountValue: 20, minOrderValue: "",
      maxDiscount: "", startsAt: "2026-10-01T10:00", endsAt: "2026-10-02T10:00",
      usageLimit: "", status: "active", displayOrder: 1, banner: "",
      featured: false, homeVisible: true, categoryVisible: true,
      isFlashSale: true, flashSalePriority: 0, flashSaleFeatured: false,
    } as Parameters<typeof validateFlashSaleValues>[0])).toBeNull();
  });
});
