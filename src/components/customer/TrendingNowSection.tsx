import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { Flame } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAddToCart } from "@/hooks/use-add-to-cart";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// TrendingNowSection — ranked by admin featured flag, then order volume, then
// view counts (see catalogItems.getTrendingRanked).
// ============================================================================

interface TrendingNowSectionProps {
  businessUnits: BusinessUnit[];
  excludeIds?: string[];
}

export function TrendingNowSection({
  businessUnits,
  excludeIds = [],
}: TrendingNowSectionProps) {
  const handleAddToCart = useAddToCart();

  const targetBuIds = useMemo(() => {
    const buSet = new Set<string>();
    for (const bu of businessUnits) {
      buSet.add(bu._id);
      if (buSet.size >= 2) break;
    }
    return Array.from(buSet);
  }, [businessUnits]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const trending0 = useQuery(
    api.catalogItems.getTrendingRanked,
    targetBuIds[0]
      ? {
          businessUnitId: targetBuIds[0] as Id<"businessUnits">,
          excludeIds: excludeIds as Id<"catalogItems">[],
          limit: 8,
        }
      : "skip",
  ) as CatalogItem[] | undefined;
  const trending1 = useQuery(
    api.catalogItems.getTrendingRanked,
    targetBuIds[1]
      ? {
          businessUnitId: targetBuIds[1] as Id<"businessUnits">,
          excludeIds: excludeIds as Id<"catalogItems">[],
          limit: 8,
        }
      : "skip",
  ) as CatalogItem[] | undefined;

  const trendingItems = useMemo(() => {
    const all = [...(trending0 ?? []), ...(trending1 ?? [])];
    const seen = new Set<string>();
    return all.filter((item) => {
      if (excludeSet.has(item._id)) return false;
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    }).slice(0, 10);
  }, [trending0, trending1, excludeSet]);

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

  if (businessUnits.length === 0) return null;

  const isLoading =
    targetBuIds.length > 0 &&
    [trending0, trending1].slice(0, targetBuIds.length).some((result) => result === undefined);

  return (
    <ProductGridSection
      id="trending-now"
      eyebrow="Hot Right Now"
      eyebrowIcon={Flame}
      title="Trending Now"
      subtitle="What everyone's ordering this week"
      items={trendingItems}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      loading={isLoading}
      variant="secondary"
    />
  );
}
