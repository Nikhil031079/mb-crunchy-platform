# Phase 27-12 — Customer Terminology

**Date:** 2026-09-17
**Status:** CUSTOMER TERMINOLOGY COMPLETE — M-1/M-2/M-3/M-14 VERIFIED

---

## M-1 — "this business unit" Exposed to Customers

**Original:** Fallback text `"this business unit"` shown to customers when product/category not found
**Current:** Fallback text changed to `"this store"`
**Fix:** Replace developer terminology with customer-facing "store"

| File | Line | Before | After |
|------|------|--------|-------|
| `src/pages/customer/ProductPage.tsx` | 535 | `"this business unit"` | `"this store"` |
| `src/pages/customer/CategoryPage.tsx` | 517 | `"this business unit"` | `"this store"` |

---

## M-2 — `itemType` Raw Enum Rendered

**Original:** `item.itemType` displayed raw ("product", "combo", "partyPack")
**Current:** Customer-friendly labels: "Item", "Combo", "Party Pack"
**Fix:** Map enum values to customer-friendly text

| File | Line | Before | After |
|------|------|--------|-------|
| `src/components/customer/SearchPage.tsx` | 254-259 | Already customer-friendly ("Combo", "Party Pack") | No change needed |
| `src/components/customer/CollectionGrid.tsx` | 148 | `{item.itemType}` | `item.itemType === "partyPack" ? "Party Pack" : item.itemType === "combo" ? "Combo" : "Item"` |
| `src/pages/customer/account/FavouritesPage.tsx` | 143 | `${item.itemType}` | `${item.itemType === "partyPack" ? "Party Pack" : item.itemType === "combo" ? "Combo" : "item"}` |

**Note:** SearchPage.tsx already had proper customer-friendly labels — no change needed.

---

## M-3 — SKU/Barcode Displayed to Customers

**Original:** SKU, Barcode, and Variant SKU shown in product detail grid
**Current:** All three removed from customer view
**Fix:** Remove internal inventory identifiers from product details

| File | Lines | Before | After |
|------|-------|--------|-------|
| `src/pages/customer/ProductPage.tsx` | 1127 | `DetailFact label="SKU"` | Removed |
| `src/pages/customer/ProductPage.tsx` | 1128-1130 | `DetailFact label="Barcode"` | Removed |
| `src/pages/customer/ProductPage.tsx` | 1131 | `DetailFact label="Variant SKU"` | Removed |

**Note:** Unit, Category, Tax, and Tags remain visible — they are customer-relevant.

---

## M-14 — BU Logo Empty Alt Text (Accessibility)

**Original:** `<img src={bu.logo} alt="" .../>`
**Current:** `<img src={bu.logo} alt={bu.name} .../>`
**Fix:** Add meaningful alt text using business unit name

| File | Line | Before | After |
|------|------|--------|-------|
| `src/pages/customer/HomePage.tsx` | 317 | `alt=""` | `alt={bu.name}` |

---

## Customer Terminology Search

### Remaining "business unit" Occurrences

| File | Line | Context | Classification |
|------|------|---------|----------------|
| `ProductPage.tsx` | 1091 | `{/* Business Unit Link */}` | COMMENT — Keep |
| `CategoryPage.tsx` | 84 | `// All active categories of a business unit...` | COMMENT — Keep |
| `CategoryPage.tsx` | 413 | `// product in this business unit...` | COMMENT — Keep |
| `CartPage.tsx` | 88 | `// Derive distinct Business Unit IDs...` | COMMENT — Keep |
| `CartPage.tsx` | 161 | `// Active business units — used to link...` | COMMENT — Keep |
| `CartPage.tsx` | 172 | `// Fetch recommendations across all active...` | COMMENT — Keep |
| `BusinessUnitPage.tsx` | 106 | `// BusinessUnitPage — Fully dynamic...` | COMMENT — Keep |
| `BusinessUnitPage.tsx` | 140 | `// Load the specific business unit by slug` | COMMENT — Keep |
| `TodaySpecialsSection.tsx` | 16 | `// featured products across active business units` | COMMENT — Keep |
| `PartyPacksSection.tsx` | 32 | `// featured party packs across business units` | COMMENT — Keep |
| `HomepageSectionRenderer.tsx` | 17 | `// the homepageSections collection ordering...` | COMMENT — Keep |
| `FeaturedOffersSection.tsx` | 15 | `// active offers across business units` | COMMENT — Keep |
| `BestSellersSection.tsx` | 18 | `// global Best Sellers row across active business units` | COMMENT — Keep |
| `ComboOffersSection.tsx` | 32 | `// global Combo Offers row across active business units` | COMMENT — Keep |

### Remaining "itemType" Occurrences

All remaining `itemType` references are internal code:
- Variable comparisons (`item.itemType === "product"`)
- Object property assignments (`itemType: "product"`)
- Logic flow decisions

### Remaining "SKU" / "Barcode" Occurrences

**No customer-visible occurrences remain.** All remaining references are in comments or internal logic.

---

## Architecture Regression

- Mixed cart architecture: ✅ Unchanged
- Store selection: ✅ Unchanged
- Kitchen/Mart identification: ✅ Unchanged
- Checkout: ✅ Unchanged
- Pricing: ✅ Unchanged
- Shipping: ✅ Unchanged
- Serviceability: ✅ Unchanged
- Payment: ✅ Unchanged
- Order creation: ✅ Unchanged
- Order tracking: ✅ Unchanged

This phase was presentation-only. No business logic was modified.

---

## Tests

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ PASS (0 errors) |
| Vite build | ✅ PASS (3.67s) |
| Test suite | ✅ 142/142 relevant tests passed |
| Pre-existing failures | 61 (`26f5_shiprocket_adapter_rewrite.test.ts`) |

---

## Changed Files

| File | Change | Reason |
|------|--------|--------|
| `src/pages/customer/ProductPage.tsx` | "this business unit" → "this store", removed SKU/Barcode | M-1, M-3 |
| `src/pages/customer/CategoryPage.tsx` | "this business unit" → "this store" | M-1 |
| `src/components/customer/CollectionGrid.tsx` | Raw `itemType` → customer-friendly labels | M-2 |
| `src/pages/customer/HomePage.tsx` | `alt=""` → `alt={bu.name}` | M-14 |
| `src/pages/customer/account/FavouritesPage.tsx` | Raw `itemType` in toast → customer-friendly labels | M-2 |

---

## Production Safety

| Check | Result |
|-------|--------|
| COURIER_DRY_RUN | ✅ Unchanged |
| Razorpay | ✅ TEST mode |
| Shiprocket | ✅ No changes |
| Production data mutation | ✅ None |

---

## FINAL VERDICT

CUSTOMER TERMINOLOGY COMPLETE — M-1/M-2/M-3/M-14 VERIFIED
