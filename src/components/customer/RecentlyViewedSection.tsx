import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { Clock } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useAddToCart } from "@/hooks/use-add-to-cart";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// RecentlyViewedSection — localStorage-powered, works for guests and signed-in
// shoppers alike. Shows the last 12 viewed items, deduped.
// ============================================================================

interface RecentlyViewedSectionProps {
  businessUnits: BusinessUnit[];
}

export function RecentlyViewedSection({
  businessUnits,
}: RecentlyViewedSectionProps) {
  const { entries } = useRecentlyViewed();
  const handleAddToCart = useAddToCart();

  const entryIds = useMemo(
    () => entries.map((entry) => entry.catalogItemId),
    [entries],
  );

  const fetchedItems = useQuery(
    api.catalogItems.getByIds,
    entryIds.length > 0
      ? { ids: entryIds as Id<"catalogItems">[] }
      : "skip",
  ) as Array<CatalogItem | null> | undefined;

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  const handleAdd = useCallback(
    (product: CatalogItem | CardProduct) =>
      handleAddToCart(product as CatalogItem),
    [handleAddToCart],
  );

  const items = useMemo(
    () => (fetchedItems ?? []).filter((item): item is CatalogItem => item !== null),
    [fetchedItems],
  );

  return (
    <ProductGridSection
      id="recently-viewed"
      eyebrow="Your Browsing"
      eyebrowIcon={Clock}
      title="Recently Viewed"
      subtitle="Pick up right where you left off"
      items={items}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      loading={entries.length > 0 && fetchedItems === undefined}
    />
  );
}
