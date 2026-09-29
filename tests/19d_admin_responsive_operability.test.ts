// ============================================================================
// MB CRUNCHY — 19D Admin Responsive / Mobile Operability Tests
//
// Verifies the Phase 19D fixes for the confirmed 19A mobile/admin usability
// issues, using the repo's readSource structural convention (tests
// 43/45/17C/19B/19C):
//  1-4. Products/Combos/Inventory/Offers tables scroll horizontally on
//       narrow screens (existing Banner/MealDeal table pattern).
//  5-6. MealDeal dialog has a responsive max-width and stacking form grid.
//  7.   BulkUpdate dialog scrolls without losing header/footer.
//  8-9. Shipment detail stacks on narrow screens and long AWB/order/
//       tracking identifiers wrap safely.
//
// Assertions target class tokens and structural markers — never exact
// generated class ordering. No backend, data, or behavioral changes are
// asserted here; those belong to the 17/18/19B/19C suites.
//
// RUN: SESSION_SECRET=<32+ char test secret> vitest run tests/19d_admin_responsive_operability.test.ts
// (SESSION_SECRET is required at import time by convex/utils/crypto.ts.)
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readSource(relativePath: string): string {
  // Normalize CRLF: the repo mixes line endings and markers assume "\n".
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8").replace(/\r\n/g, "\n");
}

/** The table renders inside a horizontal-scroll container. */
function expectHorizontalScrollTable(tablePath: string) {
  const src = readSource(tablePath);
  const scrollIdx = src.indexOf("overflow-x-auto");
  expect(scrollIdx).toBeGreaterThanOrEqual(0);
  // The scroll container wraps the table element itself.
  const tableIdx = src.indexOf("<Table>");
  expect(tableIdx).toBeGreaterThan(scrollIdx);
  // Table data behavior is untouched: headers, rows, and actions intact.
  expect(src).toContain("<TableHeader");
  expect(src).toContain("<TableBody");
}

describe("19D — admin table horizontal scroll", () => {
  it("TEST 1 — products table uses the horizontal overflow pattern", () => {
    expectHorizontalScrollTable("src/components/admin/products/ProductTable.tsx");
    const src = readSource("src/components/admin/products/ProductTable.tsx");
    expect(src).toContain("ProductRowActions");
  });

  it("TEST 2 — combos table uses the horizontal overflow pattern", () => {
    expectHorizontalScrollTable("src/components/admin/combos/ComboTable.tsx");
    const src = readSource("src/components/admin/combos/ComboTable.tsx");
    expect(src).toContain("ComboRowActions");
  });

  it("TEST 3 — inventory table uses the horizontal overflow pattern", () => {
    expectHorizontalScrollTable("src/components/admin/inventory/InventoryTable.tsx");
    const src = readSource("src/components/admin/inventory/InventoryTable.tsx");
    // Row actions (Adjust/Edit/Delete) remain in the markup, reachable via scroll.
    expect(src).toContain("onAdjust");
    expect(src).toContain("onEdit");
    expect(src).toContain("onDelete");
  });

  it("TEST 4 — offers table uses the horizontal overflow pattern", () => {
    expectHorizontalScrollTable("src/components/admin/offers/OfferTable.tsx");
    const src = readSource("src/components/admin/offers/OfferTable.tsx");
    expect(src).toContain("OfferRowActions");
  });

  it("reference pattern — Banner/MealDeal tables already scroll (unchanged)", () => {
    expect(readSource("src/components/admin/banners/BannerTable.tsx")).toContain("overflow-x-auto");
    expect(readSource("src/components/admin/meal-deals/MealDealTable.tsx")).toContain("overflow-x-auto");
  });
});

describe("19D — meal deal dialog + bulk update dialog", () => {
  it("TEST 5 — meal deal dialog has a responsive max-width", () => {
    const src = readSource("src/components/admin/meal-deals/MealDealFormDialog.tsx");
    expect(src).toContain("sm:max-w-2xl");
    // No unprefixed max-w-2xl remains on the dialog (space-prefixed match
    // avoids matching the `sm:` variant itself).
    expect(src).not.toContain(" max-w-2xl");
    // Dialog safeguards otherwise unchanged.
    expect(src).toContain("overflow-y-auto");
  });

  it("TEST 6 — meal deal form stacks on narrow screens", () => {
    const src = readSource("src/components/admin/meal-deals/MealDealFormDialog.tsx");
    expect(src).toContain("grid-cols-1");
    expect(src).toContain("sm:grid-cols-2");
    // The old unresponsive two-column-only layout is gone.
    expect(src).not.toContain("grid grid-cols-2 gap-4");
  });

  it("TEST 7 — bulk update dialog scrolls with header/footer accessible", () => {
    const src = readSource("src/components/admin/inventory/BulkUpdateDialog.tsx");
    expect(src).toContain("max-h-[calc(100vh-2rem)]");
    expect(src).toContain("overflow-y-auto");
    // Header, scrollable body, and footer actions all still present.
    expect(src).toContain("<DialogHeader");
    expect(src).toContain("ScrollArea");
    expect(src).toContain("<DialogFooter");
    expect(src).toContain('type="submit"');
    // Bulk-update logic untouched.
    expect(src).toContain("onConfirm(");
    expect(src).toContain("changedEntries");
  });
});

describe("19D — shipment detail responsiveness", () => {
  it("TEST 8 — shipment detail grids stack on narrow screens", () => {
    const src = readSource("src/pages/admin/ShipmentsPage.tsx");
    expect(src).toContain("grid-cols-1");
    expect(src).toContain("sm:grid-cols-2");
    // No inflexible two-column-only detail grid remains.
    expect(src).not.toContain("grid grid-cols-2 gap-x-4");
  });

  it("TEST 9 — AWB/order/tracking identifiers wrap safely", () => {
    const src = readSource("src/pages/admin/ShipmentsPage.tsx");
    // AWB value.
    expect(src).toContain("break-all font-mono");
    // Provider shipment ID value.
    expect(src).toContain("break-all font-mono text-xs");
    // Tracking keeps its safe link rendering (no raw long URL in a cell).
    expect(src).toContain("Open tracking");
    // Shipment data and tracking behavior untouched.
    expect(src).toContain("trackingEvents");
    expect(src).toContain("providerShipmentId");
  });
});
