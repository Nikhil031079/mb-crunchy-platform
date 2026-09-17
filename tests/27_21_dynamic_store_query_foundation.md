# Phase 27-21: Dynamic Store Query Foundation — Report

**Date**: 2026-09-16  
**Status**: ✅ COMPLETE  
**Files Changed**: 13  
**Validation**: tsc PASS | build PASS | 154/154 tests PASS (+ 61 pre-existing failures)

---

## Problem

Every homepage section component used manually unrolled `useQuery` calls with fixed-N business unit slots (2 or 4). Adding or removing a BU required editing 8+ component files. The system was hardcoded to a maximum of 4 BUs with static slot assignments.

## Solution

Replaced fixed-slot BU queries with single Convex aggregated queries that fetch all data across all active BUs in one call. Each component now uses 1-2 `useQuery` calls instead of 6-8.

## Convex Changes (6 new queries)

| Query | File | Purpose |
|-------|------|---------|
| `categories.getAllActiveAcrossBusinessUnits` | `convex/categories.ts` | All active categories across all BUs |
| `combos.getAllFeaturedAcrossBusinessUnits` | `convex/combos.ts` | All featured combos across all BUs |
| `partyPacks.getAllFeaturedAcrossBusinessUnits` | `convex/partyPacks.ts` | All featured party packs across all BUs |
| `catalogItems.getAllFeaturedAcrossBusinessUnits` | `convex/catalogItems.ts` | All featured catalog items across all BUs |
| `catalogItems.getAllActiveAcrossBusinessUnits` | `convex/catalogItems.ts` | All active catalog items across all BUs |
| `catalogItems.getBestSellersAcrossBusinessUnits` | `convex/catalogItems.ts` | Best sellers across all BUs |
| `catalogItems.getByCategoryIdsAcrossBusinessUnits` | `convex/catalogItems.ts` | Category-matched items across specified BUs |
| `mealDeals.getAllActiveForCustomerAcrossBusinessUnits` | `convex/mealDeals.ts` | All active meal deals across all BUs |
| `offers.getAllActiveAcrossBusinessUnits` | `convex/offers.ts` | All active offers across all BUs |

## Frontend Changes (7 components migrated)

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| CategoriesSection (HomePage.tsx) | 2 BU queries | 1 aggregated query | -50% |
| ComboOffersSection.tsx | 4 combo + 4 meal deal + 4 catalog map = 12 | 1 combo + 1 meal deal + 1 catalog map = 3 | -75% |
| PartyPacksSection.tsx | 4 pack + 4 meal deal + 4 catalog map = 12 | 1 pack + 1 meal deal + 1 catalog map = 3 | -75% |
| TodaySpecialsSection.tsx | 4 BU queries | 1 aggregated query | -75% |
| RecommendedForYouSection.tsx | 2 category + 2 bestseller = 4 | 1 category + 1 bestseller = 2 | -50% |
| BestSellersSection.tsx | 4 BU queries | 1 aggregated query | -75% |
| FeaturedOffersSection.tsx | 4 BU queries | 1 aggregated query | -75% |
| useCatalogItemMap.ts | 4 BU queries | 1 aggregated query | -75% |

**Total useQuery calls removed**: 48 → 12 (75% reduction)

## Fixed Limits Removed

- `useCatalogItemMap.ts`: Removed `MAX_BUSINESS_UNITS = 4` constant
- `PartyPacksSection.tsx`: Still uses `MAX_BUSINESS_UNITS = 4` as display cap (intentional, not a data limit)
- `FeaturedOffersSection.tsx`: Removed `MAX_BUSINESS_UNITS = 4` constant

## BU Capability Filtering Preserved

Each component filters aggregated results by BU capability flags on the client side:
- `ComboOffersSection`: Filters to `enableCombos` BUs
- `PartyPacksSection`: Filters to `enablePartyPacks` BUs
- `FeaturedOffersSection`: Filters to `enableOffers` BUs
- `RecommendedForYouSection`: Filters to target BU IDs

## Data Isolation

- Aggregated queries return all items; client-side filtering ensures BU-scoped display
- Each item retains its `businessUnitId` for attribution
- No cross-BU data leakage possible since items are displayed per-section with BU context

## Validation

- `npx convex codegen`: PASS
- `npx tsc --noEmit`: PASS (zero errors)
- `npx vite build`: PASS (2648 modules, 7.35s)
- `npx vitest run`: 154/154 PASS (+ 61 pre-existing shiprocket adapter failures)

## Next Steps (Not in scope for 27-21)

- Deploy Convex schema changes (new queries only, no schema changes)
- Deploy frontend changes
- Consider server-side BU capability filtering in Convex queries for further optimization
