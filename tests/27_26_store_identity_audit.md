# PHASE 27-26 — STORE IDENTITY AUDIT

**Date**: 2026-09-17
**Scope**: Full source tree scan for identity-based store assumptions

---

## Classification Key

| Code | Meaning |
|------|---------|
| A | Genuine store identity assumption — MUST FIX |
| B | Fallback/default that uses identity — SHOULD FIX |
| C | Test fixture / seed data — NO ACTION |
| D | Documentation — NO ACTION |
| E | Historical/dead code — NO ACTION |
| F | Legitimate business rule — NO ACTION |
| G | Already capability-driven — NO ACTION |

---

## Findings

### A. Genuine Identity Assumptions

| # | File | Line | Current Behavior | Classification | Proposed Action | Risk |
|---|------|------|-----------------|----------------|-----------------|------|
| A-1 | `src/pages/customer/BusinessUnitPage.tsx` | 914 | `bu.slug === "mb-kitchen" \|\| bu.slug === "kitchen"` → "Solo Meals" vs "Products" | A | Replace with capability config | LOW |
| A-2 | `src/layouts/customer/CustomerFooter.tsx` | 69-82 | `slug.includes("kitchen")` / `slug.includes("mart")` to find kitchenBu/martBu | A | Render dynamically from active BUs | MEDIUM |
| A-3 | `src/layouts/customer/CustomerFooter.tsx` | 136-198 | Hardcoded "Kitchen" and "Mart" sections with fixed fallback text | A | Dynamic BU column rendering | MEDIUM |
| A-4 | `src/data/categories.ts` | 393-401 | `getCategoryCatalog()` uses slug.includes("kitchen"/"mart") to pick catalog | A | Use BU's `catalogMode` or tag | LOW |
| A-5 | `src/pages/customer/HomePage.tsx` | 196-197 | `kitchenSlug = activeBusinessUnits[0]?.slug ?? "mb-kitchen"` fallback | B | Use actual BU data, remove hard fallback | LOW |

### B. Variable Naming (Identity-Based, But Logic Is Already Capability-Driven)

| # | File | Line | Current Behavior | Classification | Proposed Action | Risk |
|---|------|------|-----------------|----------------|-----------------|------|
| B-1 | `src/pages/customer/CheckoutPage.tsx` | 806 | `kitchenServiceability` variable name, but logic uses `serviceabilityMode` | B | Rename variable for clarity | LOW |
| B-2 | `src/pages/customer/CartPage.tsx` | 217 | `kitchenServiceability` variable name, but logic uses BU properties | B | Rename variable | LOW |
| B-3 | `src/utils/location.ts` | 93,136 | `NO_KITCHEN_ORIGIN` reason code | B | Rename to `NO_BU_ORIGIN` | LOW |
| B-4 | `src/pages/customer/CheckoutPage.tsx` | 1893 | `NO_KITCHEN_ORIGIN` reference in display logic | B | Update reference | LOW |

### C. Test Fixtures / Seed Data

| # | File | Line | Classification | Action |
|---|------|------|----------------|--------|
| C-1 | `src/components/admin/business-units/mock-data.ts` | 5-6 | C | NO ACTION |
| C-2 | `src/data/categories.ts` | 73-377 | C | NO ACTION (seed catalog keys) |

### D. Documentation / Comments

| # | File | Line | Classification | Action |
|---|------|------|----------------|--------|
| D-1 | `convex/schema.ts` | 42-44 | D | NO ACTION |
| D-2 | `src/constants/index.ts` | 25 | D | NO ACTION |
| D-3 | `src/pages/admin/OrdersPage.tsx` | 108,156,318,612-617 | D | NO ACTION (kitchen queue view label) |

### E. Dead/Historical Code

| # | File | Line | Classification | Action |
|---|------|------|----------------|--------|
| E-1 | `src/components/admin/homepage-sections/HomepageSectionFormDialog.tsx` | 182 | E | NO ACTION (placeholder text) |

### F. Legitimate Business Rules

| # | File | Line | Classification | Action |
|---|------|------|----------------|--------|
| F-1 | `convex/adminAuth.ts` | 111,470,555-693 | F | NO ACTION (kitchen staff role) |
| F-2 | `src/hooks/use-kitchen-auth.tsx` | 5-108 | F | NO ACTION (kitchen staff auth) |
| F-3 | `src/layouts/kitchen/KitchenLayout.tsx` | 2-17 | F | NO ACTION (kitchen staff layout) |
| F-4 | `src/pages/kitchen/KitchenLoginPage.tsx` | 8-51 | F | NO ACTION (kitchen staff login) |
| F-5 | `src/pages/kitchen/KitchenDashboardPage.tsx` | 31-105 | F | NO ACTION (kitchen staff dashboard) |
| F-6 | `src/constants/index.ts` | 55,70-72 | F | NO ACTION (kitchen staff routes) |

### G. Already Capability-Driven

| # | File | Line | Classification | Action |
|---|------|------|----------------|--------|
| G-1 | `src/pages/customer/CheckoutPage.tsx` | 806-820 | G | NO ACTION |
| G-2 | `src/pages/customer/CartPage.tsx` | 217-229 | G | NO ACTION |
| G-3 | `src/pages/customer/BusinessUnitPage.tsx` | 673-677 | G | NO ACTION (iconName-driven) |
| G-4 | `src/pages/customer/CategoryPage.tsx` | 530-535 | G | NO ACTION (iconName-driven) |
| G-5 | `convex/shippingRates.ts` | 95-96,306-307 | G | NO ACTION (serviceabilityMode-driven) |
| G-6 | `convex/martPincodeServiceability.ts` | 89 | G | NO ACTION (serviceabilityMode-driven) |
| G-7 | `convex/orders.ts` | 998-999 | G | NO ACTION (serviceabilityMode-driven) |

---

## Summary

| Category | Count | Action Required |
|----------|-------|----------------|
| A — Identity assumptions | 5 | FIX |
| B — Variable naming (logic OK) | 4 | RENAME |
| C — Test fixtures | 2 | None |
| D — Documentation | 3 | None |
| E — Dead code | 1 | None |
| F — Legitimate business rules | 6 | None |
| G — Already capability-driven | 7 | None |
| **Total** | **28** | **9 actionable** |

---

## Required Changes

1. **BusinessUnitPage.tsx:914** — Replace slug check with BU `catalogMode` field or admin-configurable label
2. **CustomerFooter.tsx:69-198** — Replace slug-based kitchenBu/martBu lookup with dynamic BU rendering
3. **HomePage.tsx:196-197** — Remove hardcoded slug fallbacks
4. **categories.ts:393-401** — Replace slug-based catalog selection with BU-driven approach
5. **CheckoutPage.tsx:806** — Rename `kitchenServiceability` → `coordinateRadiusServiceability`
6. **CartPage.tsx:217** — Rename `kitchenServiceability` → `coordinateRadiusServiceability`
7. **location.ts:93,136** — Rename `NO_KITCHEN_ORIGIN` → `NO_BU_ORIGIN`
8. **CheckoutPage.tsx:1893** — Update `NO_KITCHEN_ORIGIN` reference
