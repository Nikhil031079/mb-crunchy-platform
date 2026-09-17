import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";

import type { BusinessUnit, CatalogItem } from "@/types";

// ============================================================================
// useCatalogItemMap — fetches ALL active catalog items across ALL active BUs
// in a single query. Combos and party packs are synced into the catalog with
// their own id as `sourceId`, so this lets those cards add the correct
// `catalogItems` id to the cart.
// ============================================================================

export function useCatalogItemMap(
  _businessUnits: BusinessUnit[] | undefined
): { bySource: Map<string, CatalogItem>; catalogItemMap: Map<string, CatalogItem>; isLoading: boolean } {
  // Single aggregated query — returns all active catalog items across ALL BUs
  const allItemsRaw = useQuery(
    api.catalogItems.getAllActiveAcrossBusinessUnits,
  ) as CatalogItem[] | undefined;

  const isLoading = allItemsRaw === undefined;

  const catalogItemMap = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    if (!allItemsRaw) return map;
    for (const item of allItemsRaw) {
      if (!map.has(item._id)) map.set(item._id, item);
    }
    return map;
  }, [allItemsRaw]);

  const bySource = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    if (!allItemsRaw) return map;
    for (const item of allItemsRaw) {
      if (!map.has(item.sourceId)) map.set(item.sourceId, item);
    }
    return map;
  }, [allItemsRaw]);

  return { bySource, catalogItemMap, isLoading };
}
