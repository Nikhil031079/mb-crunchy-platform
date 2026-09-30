import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAllBusinessUnits } from "@/hooks/use-business-units";

import type { CatalogItem, Category, Product } from "@/types";

// ============================================================================
// use-product-routes — canonical customer route resolution (Phase 21B)
//
// ProductCard needs three pieces of data to build a canonical PDP URL
// (/{businessUnitSlug}/{categorySlug}/{productSlug}):
//
//   1. business unit slug  — from `businessUnits`
//   2. category slug       — from `products.categoryId` -> `categories.slug`
//   3. product slug        — already on the CatalogItem
//
// `catalogItems` has no `categoryId`, so product -> category resolution has to
// go through `products.getByIds`. All three hooks below are cheap and shared:
// Convex dedupes identical query args, so every screen using them reuses a
// single subscription instead of one per card.
// ============================================================================

/** Minimal shape a customer card needs to resolve its canonical route. */
export interface RoutableItem {
  itemType?: CatalogItem["itemType"];
  slug?: string;
  sourceId?: string;
  businessUnitId?: string;
}

/**
 * `businessUnits._id` -> `businessUnits.slug` for every non-deleted store.
 * Shared across the app (same args everywhere => one subscription).
 */
export function useBusinessUnitSlugById(): Map<string, string> {
  const businessUnits = useAllBusinessUnits();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits ?? []) {
      if (bu._id && bu.slug) map.set(bu._id, bu.slug);
    }
    return map;
  }, [businessUnits]);
}

/**
 * `categories._id` -> `categories.slug` for active categories only.
 * Inactive/archived categories are deliberately excluded so we never build a
 * URL that CategoryPage would resolve to "Category Not Found".
 */
export function useCategorySlugById(): Map<string, string> {
  const categories = useQuery(api.categories.getAllActiveAcrossBusinessUnits) as
    | Category[]
    | undefined;

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories ?? []) {
      if (category._id && category.slug) map.set(category._id, category.slug);
    }
    return map;
  }, [categories]);
}

/**
 * `products._id` (= `catalogItems.sourceId`) -> active category slug for the
 * given cards.
 *
 * @param items         the cards being rendered (used to collect product ids)
 * @param knownProducts optional products already loaded by the caller — ids
 *                      covered by this list are never refetched, so screens
 *                      that already query `products.*` pay nothing extra.
 */
export function useProductCategorySlugs(
  items: readonly RoutableItem[] | undefined,
  knownProducts?: readonly Pick<Product, "_id" | "categoryId">[]
): Map<string, string> {
  const categorySlugById = useCategorySlugById();

  const productSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items ?? []) {
      // Only `product` entries map to the products table — combo/partyPack
      // sourceIds live in their own tables and would fail id validation.
      if ((item.itemType ?? "product") !== "product") continue;
      if (item.sourceId) ids.add(item.sourceId);
    }
    // Sorted so the query args are value-stable across renders.
    return Array.from(ids).sort();
  }, [items]);

  const resolvedByCaller = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of knownProducts ?? []) {
      const slug = categorySlugById.get(product.categoryId);
      if (slug) map.set(product._id, slug);
    }
    return map;
  }, [knownProducts, categorySlugById]);

  const missingIds = useMemo(
    () =>
      productSourceIds.filter((id) => !resolvedByCaller.has(id)) as Id<"products">[],
    [productSourceIds, resolvedByCaller]
  );

  const fetchedProducts = useQuery(
    api.products.getByIds,
    missingIds.length > 0 ? { ids: missingIds } : "skip"
  ) as Product[] | undefined;

  return useMemo(() => {
    const map = new Map(resolvedByCaller);
    for (const product of fetchedProducts ?? []) {
      const slug = categorySlugById.get(product.categoryId);
      if (slug) map.set(product._id, slug);
    }
    return map;
  }, [resolvedByCaller, fetchedProducts, categorySlugById]);
}
