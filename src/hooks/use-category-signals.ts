import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import type { CatalogItem, Product } from "@/types";
import { filterCatalogItemIds } from "@/utils";

// ============================================================================
// Category Signals — derive the categories that a set of catalog items belong
// to (cart items, recently viewed, …) so sections can surface related goods.
// ============================================================================

export function useCategorySignals(catalogItemIds: string[]) {
  // Only catalogItems references are valid here. A stale source-table ID (e.g.
  // a legacy `combos_...` cart entry) would fail Convex `v.id("catalogItems")`
  // validation and crash the whole homepage — filter before querying.
  const ids = useMemo(() => filterCatalogItemIds(catalogItemIds), [catalogItemIds]);

  const catalogItems = useQuery(
    api.catalogItems.getByIds,
    ids.length > 0 ? { ids: ids as Id<"catalogItems">[] } : "skip",
  ) as Array<CatalogItem | null> | undefined;

  const sourceIds = useMemo(() => {
    if (!catalogItems) return [];
    return (catalogItems as Array<CatalogItem | null>)
      .filter((item): item is CatalogItem => item !== null && item.itemType === "product")
      .map((item) => item.sourceId);
  }, [catalogItems]);

  const products = useQuery(
    api.products.getByIds,
    sourceIds.length > 0 ? { ids: sourceIds as Id<"products">[] } : "skip",
  ) as Array<Product | null> | undefined;

  const categoryIds = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    for (const product of products) {
      if (product) set.add(product.categoryId);
    }
    return Array.from(set).slice(0, 4);
  }, [products]);

  return {
    categoryIds,
    isLoading: ids.length > 0 && (catalogItems === undefined || products === undefined),
  };
}
