import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";

import type { BusinessUnit, CatalogItem } from "@/types";

// ============================================================================
// useCatalogItemMap — fetches catalog items for the given business units and
// returns a Map of `sourceId` → catalog item. Combos and party packs are synced
// into the catalog with their own id as `sourceId`, so this lets those cards
// add the correct `catalogItems` id to the cart.
// ============================================================================

const MAX_BUSINESS_UNITS = 4;

export function useCatalogItemMap(
  businessUnits: BusinessUnit[] | undefined
): { bySource: Map<string, CatalogItem>; isLoading: boolean } {
  const buIds = useMemo(
    () => (businessUnits ?? []).slice(0, MAX_BUSINESS_UNITS).map((bu) => bu._id),
    [businessUnits]
  );

  const r0 = useQuery(
    api.catalogItems.getByBusinessUnit,
    buIds[0] ? { businessUnitId: buIds[0] } : "skip",
  );
  const r1 = useQuery(
    api.catalogItems.getByBusinessUnit,
    buIds[1] ? { businessUnitId: buIds[1] } : "skip",
  );
  const r2 = useQuery(
    api.catalogItems.getByBusinessUnit,
    buIds[2] ? { businessUnitId: buIds[2] } : "skip",
  );
  const r3 = useQuery(
    api.catalogItems.getByBusinessUnit,
    buIds[3] ? { businessUnitId: buIds[3] } : "skip",
  );

  const results = [r0, r1, r2, r3];
  const expected = buIds.length;
  const isLoading =
    expected > 0 && results.slice(0, expected).some((result) => result === undefined);

  const bySource = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const result of results) {
      for (const item of result ?? []) {
        if (!map.has(item.sourceId)) map.set(item.sourceId, item);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r0, r1, r2, r3]);

  return { bySource, isLoading };
}
