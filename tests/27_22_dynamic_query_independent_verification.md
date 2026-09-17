# PHASE 27-22 — DYNAMIC QUERY INDEPENDENT VERIFICATION

**Date**: 2026-09-16  
**Verifier**: Independent verification agent  
**Subject**: Phase 27-21 Dynamic Store Query Foundation

---

## 1. Executive Summary

Phase 27-21 replaces fixed-N business unit query slots (48 `useQuery` calls across 8 components) with 12 aggregated queries backed by 9 new Convex cross-BU endpoints. The migration is **structurally sound** with respect to React hook safety, diff integrity, and data isolation. However, independent verification identified **1 BLOCKER** (meal deal enrichment gap), **1 MINOR** (offers time-window), **2 N+1 concerns**, and **2 minor code hygiene issues** that must be addressed before deployment.

**Final Verdict: VERIFICATION FAILED — CHANGES REQUIRED**

---

## 2. Diff Integrity

### 2.1 File Inventory

`git diff --name-only HEAD` reports exactly **14 files**:

| # | File | Type |
|---|------|------|
| 1 | `convex/catalogItems.ts` | Convex query |
| 2 | `convex/categories.ts` | Convex query |
| 3 | `convex/combos.ts` | Convex query |
| 4 | `convex/mealDeals.ts` | Convex query |
| 5 | `convex/offers.ts` | Convex query |
| 6 | `convex/partyPacks.ts` | Convex query |
| 7 | `src/components/customer/BestSellersSection.tsx` | Frontend component |
| 8 | `src/components/customer/ComboOffersSection.tsx` | Frontend component |
| 9 | `src/components/customer/FeaturedOffersSection.tsx` | Frontend component |
| 10 | `src/components/customer/PartyPacksSection.tsx` | Frontend component |
| 11 | `src/components/customer/RecommendedForYouSection.tsx` | Frontend component |
| 12 | `src/components/customer/TodaySpecialsSection.tsx` | Frontend component |
| 13 | `src/hooks/use-catalog-map.ts` | Frontend hook |
| 14 | `src/pages/customer/HomePage.tsx` | Frontend page |

**Matches report claim**: ✅ 14 files

### 2.2 Unrelated Changes

No unrelated changes detected. Every modified file is directly related to the fixed-slot → aggregated query migration. No schema changes, no mutation changes, no protected system files touched.

### 2.3 Report vs Implementation Mismatch

| Claim | Actual | Match? |
|-------|--------|--------|
| 14 files changed | 14 files | ✅ |
| 48 fixed-slot useQuery calls replaced | See Part 3 (48 confirmed) | ✅ |
| 12 aggregated queries now used | 12 unique useQuery endpoints in migrated code | ✅ |
| 9 new Convex cross-BU queries | 9 new query exports across 6 files | ✅ |
| 7 customer components/hooks migrated | 7 components + 1 hook = 8 items (report says "7 customer components/hooks") | ⚠️ Miscount — actual is 8 items (7 components + 1 hook) |
| 75% reduction in query calls | 48 → 12 = 75% | ✅ |
| MAX_BUSINESS_UNITS = 4 removed | Removed from `useCatalogItemMap` and `FeaturedOffersSection`. Still present in `PartyPacksSection` (display cap) and 2 non-migrated files. | ⚠️ Partial — see Part 3 |
| TypeScript PASS | `tsc --noEmit` exits 0 | ✅ |
| Build PASS | `vite build` succeeds | ✅ |
| 154/154 tests PASS | 154 passed, 61 pre-existing failures (shiprocket adapter) | ✅ |

---

## 3. Fixed-Slot Removal Verification

### 3.1 Source Tree Search Results

| Pattern | Customer Homepage Code | Other Code |
|---------|----------------------|------------|
| `MAX_BUSINESS_UNITS` | `FeaturedOffersSection.tsx` (dead constant — defined, never referenced in logic). `PartyPacksSection.tsx` (used as display cap `slice(0, 4)`, NOT query limit). | `HomepageSectionsPage.tsx` (admin UI), `CartPage.tsx` (cart meal deals — not migrated) |
| `useQuery.*b[0-3]` | **NONE** | N/A |
| `useMealDeals(b[0-3])` | **NONE** | N/A |
| `[r0...r3]` spread pattern | **NONE** | N/A |
| `businessUnit[1-4]` | **NONE** | N/A |
| `fixed-slot` / `fixed slot` | **NONE** | N/A |

### 3.2 Remaining MAX_BUSINESS_UNITS Instances

| File | Status | Query Limiting? | Classification |
|------|--------|----------------|----------------|
| `FeaturedOffersSection.tsx:26` | Dead constant — defined but never referenced | **NO** | MINOR — dead code, should remove |
| `PartyPacksSection.tsx:42` | Used as display cap: `.slice(0, 4)` | **NO** — display only, not query limit | ACCEPTABLE — intentional UI limit |
| `HomepageSectionsPage.tsx:24` | Admin page, not customer-facing | **NO** | ACCEPTABLE — outside migration scope |
| `CartPage.tsx:89-100` | Cart page meal deals, not migrated | **NO** — separate concern | ACCEPTABLE — outside migration scope |

### 3.3 Query Ceiling Verification

The old pattern `r0 = useQuery(getFeatured, b0 ? {businessUnitId: b0} : "skip")` through `r3` has been completely eliminated from all customer homepage components. The new pattern `useQuery(api.xxx.getAllActiveAcrossBusinessUnits)` has no BU parameter and returns all data. BU filtering happens client-side via `Set` intersection with capability flags.

**Verdict**: ✅ No hidden 2-BU or 4-BU query ceilings remain in migrated code.

---

## 4. React Hook Safety

### 4.1 Hook Pattern Used

All 8 migrated components/hooks follow the same safe pattern:

```
function Component(props) {
  // 1. Custom hooks (always called)
  // 2. useQuery (always called, may use "skip" sentinel)
  // 3. useMemo (always called, depends on query results)
  // 4. Early return (if loading/empty)
  // 5. JSX (may use .map() but NO hooks inside)
}
```

### 4.2 Per-Component Analysis

| Component | useQuery Count | Hook Stability | Hooks in Loops? | Conditional Hooks? |
|-----------|---------------|----------------|-----------------|-------------------|
| CategoriesSection | 1 | ✅ Stable (2 hooks total) | ❌ None | ❌ None |
| ComboOffersSection | 2 direct + 1 via useCatalogItemMap = 3 | ✅ Stable (16 total) | ❌ None | ❌ None |
| PartyPacksSection | 2 direct + 1 via useCatalogItemMap = 3 | ✅ Stable (17 total) | ❌ None | ❌ None |
| TodaySpecialsSection | 1 | ✅ Stable (5 total) | ❌ None | ❌ None |
| RecommendedForYouSection | 2 | ✅ Stable (14 total) | ❌ None | ❌ None (uses "skip" sentinel) |
| BestSellersSection | 1 | ✅ Stable (6 total) | ❌ None | ❌ None |
| FeaturedOffersSection | 1 | ✅ Stable (4 total) | ❌ None | ❌ None |
| useCatalogItemMap | 1 | ✅ Stable (3 total) | ❌ None | ❌ None |

### 4.3 Key Safety Observations

1. **All hooks are unconditionally called** before any early returns or conditional rendering.
2. **No `useQuery` inside `.map()`**, loops, or conditional blocks.
3. **No dynamic hook count** — every render path calls the same number of hooks.
4. **Convex `"skip"` sentinel** used in `RecommendedForYouSection` — this is the idiomatic Convex pattern where the hook is called but the query is not executed.
5. **Shared hook `useCatalogItemMap`** is called at the top of `ComboOffersSection` and `PartyPacksSection` — its internal hook count is also stable.

**Verdict**: ✅ All React hook safety rules satisfied.

---

## 5. Convex Query Review

### 5.1 Query Analysis Table

| Query | Tables | Indexes | N+1? | BU-safe? | Ordering | Notes |
|-------|--------|---------|------|----------|----------|-------|
| `categories.getAllActiveAcrossBusinessUnits` | categories | NONE (full scan) | ❌ No | ✅ Yes | asc (_creationTime) | Missing index on [status, displayOrder] |
| `combos.getAllFeaturedAcrossBusinessUnits` | combos | NONE (full scan) | ❌ No | ✅ Yes | asc | Missing index for cross-BU featured lookup |
| `partyPacks.getAllFeaturedAcrossBusinessUnits` | partyPacks | NONE (full scan) | ❌ No | ✅ Yes | asc | Same as combos |
| `catalogItems.getAllFeaturedAcrossBusinessUnits` | catalogItems | NONE (full scan) | ❌ No | ✅ Yes | asc | Largest table — full scan is wasteful |
| `catalogItems.getAllActiveAcrossBusinessUnits` | catalogItems | NONE (full scan) | ❌ No | ✅ Yes | asc | Returns entire active catalog |
| `catalogItems.getBestSellersAcrossBusinessUnits` | catalogItems | NONE (full scan) | ❌ No | ✅ Yes | asc + take(N) | **NOT actually best sellers** — see Part 6 |
| `catalogItems.getByCategoryIdsAcrossBusinessUnits` | products, catalogItems | products: by_category | ⚠️ YES | ✅ Yes | None explicit | N queries per category + full catalogItems scan |
| `mealDeals.getAllActiveForCustomerAcrossBusinessUnits` | mealDeals, catalogItems | NONE | ⚠️ YES | ✅ Yes | asc | **BLOCKER** — missing enrichment. N+1 on parentCatalogItemIds. |
| `offers.getAllActiveAcrossBusinessUnits` | offers | NONE (full scan) | ❌ No | ✅ Yes | asc | **Missing time-window filter** — see Part 6 |

### 5.2 Scaling Assessment

| BU Count | Simple Queries | getByCategoryIds | mealDeals enriched |
|----------|---------------|-------------------|-------------------|
| 2 | ✅ Fine | ✅ Fine | ✅ Fine |
| 5 | ✅ Fine | ✅ Acceptable | ✅ Acceptable |
| 10 | ✅ Fine | ⚠️ Noticeable | ⚠️ Noticeable |
| 50 | ⚠️ Full scans wasteful | ❌ Problematic | ❌ N+1 grows linearly |

### 5.3 Missing Indexes

All 9 cross-BU queries perform **full table scans** with `.filter()`. No `.withIndex()` calls. The single-BU counterparts use indexes like `by_business_unit`, `by_featured`, `by_status`. The cross-BU queries cannot use these because they don't have a BU prefix in the index predicate. A new composite index like `[status, featured]` would improve most of these.

---

## 6. Semantic Regression

### 6.1 Categories

| Aspect | Old (getByBusinessUnit) | New (getAllActiveAcrossBusinessUnits) | Equivalent? |
|--------|------------------------|--------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Deleted filter | deletedAt === undefined | deletedAt === undefined | ✅ |
| Ordering | asc | asc | ✅ |
| Enrichment | None | None | ✅ |
| BU scope | Per-BU (index) | All BUs (scan) | ✅ Functionally equivalent |

**Verdict**: ✅ No semantic regression.

### 6.2 Combo Offers

| Aspect | Old (getFeatured per BU) | New (getAllFeaturedAcrossBusinessUnits) | Equivalent? |
|--------|-------------------------|----------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Deleted filter | yes | yes | ✅ |
| Featured filter | featured=true | featured=true | ✅ |
| Ordering | asc | asc | ✅ |
| Enrichment | None | None | ✅ |

**Verdict**: ✅ No semantic regression. Client-side `combosEnabled` filter preserves BU capability filtering.

### 6.3 Party Packs

Same structure as combos.

**Verdict**: ✅ No semantic regression.

### 6.4 Today Specials

| Aspect | Old (getFeatured per BU) | New (getAllFeaturedAcrossBusinessUnits) | Equivalent? |
|--------|-------------------------|----------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Featured filter | featured=true | featured=true | ✅ |
| Dedup | By _id (seen Set) | By _id (seen Set) | ✅ |
| Slice | .slice(0, 10) | .slice(0, 10) | ✅ |

**Verdict**: ✅ No semantic regression.

### 6.5 Recommendations

| Aspect | Old (getByCategoryIds per BU + getBestSellers per BU) | New (aggregated) | Equivalent? |
|--------|------------------------------------------------------|-------------------|-------------|
| Category lookup | Per-BU via index | All BUs, filter in memory | ⚠️ Functionally same, less efficient |
| Best sellers | Per-BU via index | All BUs, no ranking | ⚠️ **SEMANTIC ISSUE** — see below |
| BU scoping | Per-BU query | In-memory Set filter | ✅ Functionally equivalent |
| Exclude IDs | Applied | Applied | ✅ |

**Best sellers semantic issue**: Both old and new `getBestSellers*` queries return items in `_creationTime` order (insertion order), NOT by actual popularity. The name "best sellers" is misleading. The new cross-BU version inherits this existing behavior — it is not a regression introduced by Phase 27-21. However, the old per-BU version would show "first N items per BU" while the new version shows "first N items globally", which means the global list may be dominated by a single BU's items.

**Verdict**: ⚠️ Acceptable regression — `getBestSellers` semantic is pre-existing issue, not introduced by this phase.

### 6.6b Meal Deals (BLOCKER)

| Aspect | Old (getActiveForCustomer per BU) | New (getAllActiveForCustomerAcrossBusinessUnits) | Equivalent? |
|--------|-----------------------------------|------------------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Deleted filter | yes | yes | ✅ |
| Qualifying item names | ✅ Resolved from catalogItems | ❌ **NOT RESOLVED** | ❌ |
| Qualifying item prices | ✅ Resolved | ❌ **NOT RESOLVED** | ❌ |
| Qualifying item variants | ✅ Resolved from source products | ❌ **NOT RESOLVED** | ❌ |
| Qualifying item alternatives | ✅ Resolved with names/prices | ❌ **NOT RESOLVED** | ❌ |
| individualTotal | ✅ Computed | ❌ **NOT COMPUTED** | ❌ |
| savings | ✅ Computed (individualTotal - dealPrice) | ❌ **NOT COMPUTED** | ❌ |
| parentCatalogItems | ✅ Resolved | ✅ Resolved | ✅ |

The old query resolves every qualifying item's name, price, variants, and alternatives via `ctx.db.get()` calls, and computes `individualTotal` and `savings`. The new query returns raw `qualifyingItems` (only `catalogItemId`, `quantity`, `alternatives?` IDs) without resolution. Frontend components `MealDealBadge.tsx:63` (`qi.name`), `MealDealBadge.tsx:29` (`mealDeal.savings`), and `MealDealVariantDialog.tsx:80` (`qi.variants`) depend on enriched data.

**Verdict**: ❌ **BLOCKER** — meal deal enrichment missing. Must fix before deployment.

### 6.6 Best Sellers Section

Same issue as Recommendations above. The `BestSellersSection` now shows global first-N items instead of per-BU first-N items. With 2 BUs and limit 8, old behavior was "up to 4 items from BU1 + up to 4 from BU2". New behavior is "8 items globally regardless of BU". If BU1 has 10 items and BU2 has 2, BU2 may get 0 representation.

**Verdict**: ⚠️ MINOR — display-level impact only; BUs are small (2 currently).

### 6.7 Featured Offers

| Aspect | Old (getActive per BU) | New (getAllActiveAcrossBusinessUnits) | Equivalent? |
|--------|------------------------|--------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Deleted filter | yes | yes | ✅ |
| Time window | startsAt<=now, endsAt>=now | **NOT FILTERED** | ⚠️ MINOR |
| Ordering | asc | asc | ✅ |

The old `getActive` query filtered `startsAt <= now` AND `endsAt >= now`. The new `getAllActiveAcrossBusinessUnits` does NOT check time windows. Expired or future offers will be returned. However, `FeaturedOffersSection.tsx:53` calls `isOfferActive(offer)` which filters client-side. This is functionally correct but returns unnecessary data.

**Verdict**: ⚠️ MINOR — time-window gap mitigated by client-side filter.

### 6.8 Catalog Item Map

| Aspect | Old (getByBusinessUnit per BU) | New (getAllActiveAcrossBusinessUnits) | Equivalent? |
|--------|-------------------------------|--------------------------------------|-------------|
| Status filter | active | active | ✅ |
| Deleted filter | yes | yes | ✅ |
| Ordering | asc | asc | ✅ |
| Map key (bySource) | sourceId | sourceId | ✅ |
| Map key (_id) | _id | _id | ✅ |

**Verdict**: ✅ No semantic regression. First-seen wins dedup is preserved.

---

## 7. Zero-Store Verification

With 0 active business units:

- `businessUnits` array is empty
- `CategoriesSection`: `allCategoriesRaw` returns `[]`, component returns `null` ✅
- `ComboOffersSection`: `combosEnabled = []`, `allCombosRaw = []`, component returns skeleton then null ✅
- `PartyPacksSection`: `packsEnabled = []`, `allPacksRaw = []`, returns null ✅
- `TodaySpecialsSection`: `allFeaturedRaw = []`, returns null ✅
- `RecommendedForYouSection`: `targetBuIds = []`, queries skip, returns null ✅
- `BestSellersSection`: `bestSellersRaw = []`, returns skeleton then null ✅
- `FeaturedOffersSection`: `offerEnabled = []`, `allOffersRaw = []`, returns null ✅
- `useCatalogItemMap`: `allItemsRaw = []`, returns empty maps ✅

No exceptions, no phantom data, no Kitchen/Mart fallback. All queries return empty arrays when no data exists.

**Verdict**: ✅ Zero-store behavior correct.

---

## 8. Store Count Matrix

| Store Count | Categories | Combos | Party Packs | Specials | Recommendations | Best Sellers | Offers |
|-------------|-----------|--------|-------------|----------|----------------|-------------|--------|
| 0 BUs | ✅ Empty | ✅ Empty | ✅ Empty | ✅ Empty | ✅ Empty | ✅ Empty | ✅ Empty |
| 1 BU | ✅ All from BU1 | ✅ All from BU1 | ✅ All from BU1 | ✅ All from BU1 | ✅ BU1 items | ✅ BU1 items | ✅ BU1 offers |
| 2 BUs | ✅ All from BU1+BU2 | ✅ All from BU1+BU2 | ✅ All from BU1+BU2 | ✅ All from BU1+BU2 | ✅ BU1+BU2 | ✅ BU1+BU2 | ✅ BU1+BU2 |
| 3 BUs | ✅ All from 3 BUs | ✅ All from 3 BUs | ✅ All from 3 BUs | ✅ All from 3 BUs | ✅ 3 BUs | ✅ 3 BUs | ✅ 3 BUs |
| 4 BUs | ✅ All from 4 BUs | ✅ All from 4 BUs | ✅ All from 4 BUs | ✅ All from 4 BUs | ✅ 4 BUs | ✅ 4 BUs | ✅ 4 BUs |
| 5 BUs | ✅ All from 5 BUs | ✅ All from 5 BUs | ✅ All from 5 BUs | ✅ All from 5 BUs | ✅ 5 BUs | ✅ 5 BUs | ✅ 5 BUs |
| 10 BUs | ✅ All from 10 BUs | ✅ All from 10 BUs | ✅ All from 10 BUs | ✅ All from 10 BUs | ✅ 10 BUs | ✅ 10 BUs | ✅ 10 BUs |

**Caveat for Best Sellers**: With 5+ BUs, the `limit: 16` on `getBestSellersAcrossBusinessUnits` may not evenly represent all BUs. A BU with fewer catalog items may be underrepresented. This is a display concern, not a data concern.

**Caveat for Party Packs**: `slice(0, 4)` caps display at 4 packs regardless of BU count. This is an intentional display limit, not a data limit.

**Verdict**: ✅ All eligible BUs are represented in query results. Display caps are intentional.

---

## 9. 5+ Store Verification

With 5 BUs (BU1-BU5), each with unique products:

| BU | Appears in Categories? | Appears in Combos? | Appears in Specials? | Appears in Catalog Map? |
|----|----------------------|--------------------|--------------------|----------------------|
| BU1 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| BU2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| BU3 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| BU4 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| BU5 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

No truncation from `slice()`, `take()`, or frontend filtering. The queries return ALL matching items. Client-side filtering only removes inactive/deleted items and applies capability flags. The `slice()` calls are display-level (e.g., `.slice(0, 10)` for Today's Specials) and apply AFTER all BUs are aggregated.

**Verdict**: ✅ No 5+ store truncation.

---

## 10. Data Isolation

With BU-A containing Product-X and BU-B containing Product-Y:

- `getAllActiveAcrossBusinessUnits` returns both, each with their own `businessUnitId`
- Client-side `Set` intersection with `combosEnabled` / `packsEnabled` / `offerEnabled` ensures only capability-matching BUs are displayed
- `bySource` map uses `sourceId` as key — if BU-A and BU-B have the same source product, first-seen wins (standard dedup)
- `catalogItemMap` uses `_id` as key — each catalog item has a globally unique `_id`
- `getByCategoryIdsAcrossBusinessUnits` filters by `buSet.has(item.businessUnitId)` — BU-A's products won't appear in BU-B's section

**Verdict**: ✅ Data isolation maintained. Each item retains `businessUnitId` for attribution.

---

## 11. Duplicate / Collision Testing

### 11.1 Same Product Name Across BUs

If BU-A and BU-B both sell "Chicken Burger":
- `catalogItems` table: Two separate documents with different `_id`, same `name`, same `sourceId` (if synced from same product) or different `sourceId`
- `bySource` map: If same `sourceId`, first-seen wins (intentional dedup — same product across stores)
- Display: Both BU sections use the same `bySource` map, so the product appears once in the map but is referenced correctly by each BU's items

### 11.2 Same Category Name Across BUs

If BU-A and BU-B both have category "Burgers":
- `categories` table: Two documents with different `_id`, same `name`, different `businessUnitId`
- `getAllActiveAcrossBusinessUnits`: Returns both (no dedup by name)
- CategoriesSection renders all categories grouped by BU — same-named categories appear under different BU sections ✅

### 11.3 Same Offer Code Across BUs

If BU-A and BU-B both have offer code "SAVE20":
- `offers` table: Two documents with different `_id`, same `code`, different `businessUnitId`
- `getAllActiveAcrossBusinessUnits`: Returns both
- FeaturedOffersSection: Each offer retains its `businessUnitId` ✅

### 11.4 Collision Risk Assessment

| Key | Globally Unique? | Dedup Risk | Mitigation |
|-----|-----------------|------------|------------|
| `_id` | ✅ Yes | None | N/A |
| `sourceId` | ⚠️ Not guaranteed | Same product across BUs → first-seen wins in bySource map | Intentional — same product is same product |
| `name` | ❌ No | Same-named items from different BUs | No dedup by name — each retains BU context |
| `slug` | ⚠️ Unique per BU, not global | Same slug in different BUs | Queries don't dedup by slug |
| `code` (offers) | ⚠️ Not guaranteed | Same offer code in different BUs | No dedup by code |

**Verdict**: ✅ No incorrect deduplication. The aggregation does not collapse different stores' items. The only dedup is by `_id` (correct) and `sourceId` (intentional for cross-store product sync).

---

## 12. Loading / Error / Empty States

| State | CategoriesSection | ComboOffersSection | PartyPacksSection | TodaySpecialsSection | RecommendedForYou | BestSellersSection | FeaturedOffersSection | useCatalogItemMap |
|-------|------------------|-------------------|-------------------|---------------------|-------------------|-------------------|---------------------|------------------|
| **undefined (loading)** | Returns null | Returns skeleton (8 cards) | Returns skeleton (4 cards) | Returns skeleton (8 cards) | Returns null (via isLoading) | Returns skeleton (8 cards) | Returns skeleton (3 cards) | `isLoading: true` |
| **Empty array** | Returns null | Returns skeleton then null (combos.length === 0) | Returns skeleton then null | Returns null (items.length === 0) | Returns null | Returns skeleton then null | Returns null | Empty maps |
| **Populated** | Renders categories | Renders combos | Renders packs | Renders products | Renders recommendations | Renders best sellers | Renders offers | Populated maps |
| **Error** | Query returns undefined → treated as loading | Same | Same | Same | Same | Same | Same | `isLoading: true` |

**Observation**: Loading and empty state behavior is functionally equivalent to the old pattern. The old code used `[r0, r1, r2, r3].slice(0, expected).some(r => r === undefined)` to detect loading. The new code uses `allXxxRaw === undefined`. Both resolve to the same loading/loaded states.

**Verdict**: ✅ No unexpected changes to loading/empty/error behavior.

---

## 13. Performance Review

### 13.1 Database Work Estimates

| BU Count | Old Pattern (N queries) | New Pattern (1 query) | Net Change |
|----------|------------------------|----------------------|------------|
| **Categories** | 2 queries × ~50 rows each = ~100 rows scanned | 1 query × ~100 rows = ~100 rows scanned | Neutral |
| **Combos** | 2 queries × ~10 rows each = ~20 rows | 1 query × ~20 rows = ~20 rows | Neutral |
| **Party Packs** | 2 queries × ~5 rows each = ~10 rows | 1 query × ~10 rows = ~10 rows | Neutral |
| **Specials** | 4 queries × ~15 rows each = ~60 rows | 1 query × ~60 rows = ~60 rows | Neutral |
| **Best Sellers** | 4 queries × 8 rows each = 32 rows | 1 query × 16 rows = 16 rows | Improved |
| **Offers** | 4 queries × ~5 rows each = ~20 rows | 1 query × ~20 rows = ~20 rows | Neutral |
| **Catalog Map** | 4 queries × ~50 rows each = ~200 rows | 1 query × ~200 rows = ~200 rows | Neutral |
| **Meal Deals** | 4 queries × ~3 deals each = ~12 deals | 1 query × ~12 deals = ~12 deals | Neutral |

### 13.2 N+1 Query Inventory

| Query | N+1 Pattern | Severity | BU-Related? |
|-------|-------------|----------|-------------|
| `getByCategoryIdsAcrossBusinessUnits` | Loop over `categoryIds` → N products queries | ⚠️ Moderate | No — category-based |
| `getAllActiveForCustomerAcrossBusinessUnits` | Loop over deals × parentCatalogItemIds → `db.get()` | ⚠️ Moderate | No — deal-based |
| All other queries | None | ✅ | N/A |

### 13.3 Index Gap

All 9 cross-BU queries perform **full table scans** with `.filter()`. No `.withIndex()` calls. This is a known tradeoff — cross-BU queries cannot use BU-prefixed indexes. For current data volumes (~2 BUs, <500 items per table), this is negligible. At 50+ BUs or 10,000+ items, adding composite indexes like `[status, featured]` or `[status, deletedAt]` would become necessary.

### 13.4 Duplicate Queries

`useCatalogItemMap` (all active catalog items) is called by both `ComboOffersSection` and `PartyPacksSection`. Convex's reactive query system deduplicates identical queries with the same arguments, so this is a single server query shared across components. ✅

`getAllActiveForCustomerAcrossBusinessUnits` (meal deals) is called by both `ComboOffersSection` and `PartyPacksSection` — same dedup applies. ✅

**Verdict**: ⚠️ MINOR — missing indexes are acceptable for current scale but should be tracked as future debt.

---

## 14. Customer Flow Regression

| Flow Step | Query Migration Impact | Verified? |
|-----------|----------------------|-----------|
| Homepage → Store selection | `businessUnits.getActive` unchanged | ✅ |
| Homepage → Category click | Category links use `bu.slug` from `businessUnits` prop, not from query results | ✅ |
| Category → Product | Product links use catalog item's `businessUnitId` → slug resolution via `buSlugsById` map | ✅ |
| Product → Cart | Cart uses `catalogItemId` from `bySource` map — map is populated from same aggregated query | ✅ |
| Cart → Checkout | Checkout resolves BU from cart item's `businessUnitId` — server-authoritative | ✅ |
| Mixed-cart | Cart items retain per-item `businessUnitId` — unaffected by query migration | ✅ |
| BU identity in links | `buSlugsById` computed from `businessUnits` prop (unchanged), not from query results | ✅ |

**Verdict**: ✅ Customer flow preserved. BU identity maintained through entire funnel.

---

## 15. Capability Regression

### 15.1 Phase 27-20 Architecture Check

Phase 27-20 established `serviceabilityMode` field on `businessUnits` with values: `coordinate_radius`, `pincode_region`, `manual`.

| Check | Result |
|-------|--------|
| `slug.includes("kitchen")` in new code? | ❌ Not found |
| `name === "MB Kitchen"` in new code? | ❌ Not found |
| `serviceabilityMode` referenced in migrated code? | ❌ Not referenced (correct — serviceability is checkout concern, not homepage query concern) |
| `coordinate_radius` / `pincode_region` / `manual` preserved? | ✅ Not modified by Phase 27-21 |
| `iconName` field (Phase 27-20) preserved? | ✅ Not modified |

**Verdict**: ✅ Phase 27-20 capability architecture intact.

---

## 16. Protected Systems

| Protected File | Modified? | Notes |
|---------------|-----------|-------|
| `convex/geocode.ts` | ❌ No | |
| `src/utils/location.ts` | ❌ No | |
| `src/stores/location.ts` | ❌ No | |
| `src/hooks/use-razorpay.ts` | ❌ No | |
| `convex/razorpay.ts` | ❌ No | |
| `convex/razorpayWebhook.ts` | ❌ No | |
| `convex/orderWorkflow.ts` | ❌ No | |
| `convex/notificationService.ts` | ❌ No | |
| `src/stores/cart.ts` | ❌ No | |

| System | Unaffected? |
|--------|-------------|
| Meal-deal pricing | ✅ Query returns same data structure; enrichment differences noted in Part 6 |
| Mart shipping | ✅ Not modified |
| Shiprocket | ✅ Not modified |
| Razorpay | ✅ Not modified |
| Authentication | ✅ Not modified |
| Location | ✅ Not modified |
| Mixed-cart | ✅ Not modified |

**Verdict**: ✅ All protected systems untouched.

---

## 17. Test / Build Results

| Check | Result |
|-------|--------|
| `npx convex codegen` | ✅ PASS |
| `npx tsc --noEmit` | ✅ PASS (exit 0) |
| `npx vite build` | ✅ PASS (2648 modules, 7.35s) |
| `npx vitest run` | ✅ 154/154 PASS (+ 61 pre-existing shiprocket adapter failures) |

**Test count**: 154 passing (unchanged from Phase 27-21 report). No new tests were added in Phase 27-21. The 61 shiprocket adapter failures are pre-existing (`ERR_MODULE_NOT_FOUND` for `convex/courier/shiprocketAdapter`).

**Verdict**: ✅ All validation passes.

---

## 18. Findings

| # | Severity | Finding | File | Details |
|---|----------|---------|------|---------|
| F-1 | **MINOR** | Offers query missing time-window filter | `convex/offers.ts:63-77` | `getAllActiveAcrossBusinessUnits` does not check `startsAt <= now` and `endsAt >= now`. Expired/future offers returned. Frontend mitigates with `isOfferActive()` at `FeaturedOffersSection.tsx:53` — functionally correct but returns unnecessary data. |
| F-2 | **BLOCKER** | Meal deal enriched query missing qualifying item resolution | `convex/mealDeals.ts:211-244` | `getAllActiveForCustomerAcrossBusinessUnits` returns `deal.qualifyingItems` raw without resolving names/prices/variants/alternatives. The single-BU `getActiveForCustomer` computes `savings`, `individualTotal`, and enriches each qualifying item with `name`, `price`, `basePrice`, `compareAtPrice`, `defaultVariantName`, `variants`, and `alternatives`. Frontend components `MealDealBadge.tsx:63` accesses `qi.name`, `MealDealBadge.tsx:29` accesses `mealDeal.savings`, and `MealDealVariantDialog.tsx:80` accesses `qi.variants` — all will be `undefined`. The `savings` field is NOT stored on the `mealDeals` table (schema line 366-382) — it is computed as `individualTotal - deal.dealPrice`. |
| F-3 | **MINOR** | Dead `MAX_BUSINESS_UNITS` constant | `FeaturedOffersSection.tsx:26` | Constant defined but never referenced. Should be removed. |
| F-4 | **MINOR** | All cross-BU queries lack indexes | All 9 new queries | Full table scans. Acceptable at current scale (2 BUs, <500 items). Should be tracked as future debt. |
| F-5 | **MINOR** | `getBestSellersAcrossBusinessUnits` is not actually best sellers | `catalogItems.ts:552-568` | Returns first N items by insertion order, not by popularity. Pre-existing issue inherited from single-BU version. |
| F-6 | **MINOR** | Best sellers BU representation uneven | `BestSellersSection.tsx` | Global limit 16 may not evenly represent all BUs. BU with more items dominates. |
| F-7 | **ACCEPTABLE** | `useCatalogItemMap` ignores `businessUnits` param | `use-catalog-map.ts:22` | `_businessUnits` parameter unused. Intentional — query fetches all BUs globally. API kept for signature stability. |
| F-8 | **FUTURE DEBT** | Cross-BU queries need composite indexes | Convex schema | At 50+ BUs or 10K+ items, add `[status, featured]`, `[status, deletedAt]` indexes. |

---

## 19. Final Verdict

**VERIFICATION FAILED — CHANGES REQUIRED**

### Blocking Issues

1. **F-2 (BLOCKER)**: `getAllActiveForCustomerAcrossBusinessUnits` does not enrich qualifying items. Frontend components `MealDealBadge.tsx` and `MealDealVariantDialog.tsx` access `qi.name`, `qi.variants`, `qi.defaultVariantName`, and `mealDeal.savings` — all of which are `undefined` from the raw query. The `savings` field is not stored on the `mealDeals` table; it is computed by the old `getActiveForCustomer` as `individualTotal - deal.dealPrice`. **Fix required**: The cross-BU query must replicate the enrichment logic from `getActiveForCustomer` (lines 32-179), or the frontend must compute these fields client-side from catalog map data.

### Non-Blocking Issues (Can Address Post-Deploy)

- F-1 (MINOR): Offers time-window gap mitigated by `isOfferActive()` client-side
- F-3 through F-8: Minor hygiene and future debt items

### No Blockers in Other Areas

React hook safety, diff integrity, data isolation, zero-store behavior, store count matrix, customer flow, capability regression, and protected systems all pass verification.

---

*Verification complete. No source code, Convex code, database data, or deployment was modified during this phase. Only the verification report was created.*
