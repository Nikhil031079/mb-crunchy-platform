import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { Sparkles } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useCart } from "@/stores/cart";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useBrowsingPreference } from "@/hooks/use-browsing-preference";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCategorySignals } from "@/hooks/use-category-signals";
import { filterCatalogItemIds, rankCatalogItems } from "@/utils";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// RecommendedForYouSection — deterministic, non-AI recommendations ranked from
// weighted signals: viewed items, cart items, category matches, best sellers.
// ============================================================================

interface RecommendedForYouSectionProps {
  businessUnits: BusinessUnit[];
  onOpenItemDetails?: (item: CatalogItem) => void;
}

export function RecommendedForYouSection({
  businessUnits,
  onOpenItemDetails,
}: RecommendedForYouSectionProps) {
  const { entries } = useRecentlyViewed();
  const { cart } = useCart();
  const { preferredBusinessUnitId } = useBrowsingPreference();
  const handleAddToCart = useAddToCart();

  const viewedIds = useMemo(
    () => entries.map((entry) => entry.catalogItemId),
    [entries],
  );
  const cartIds = useMemo(
    () => cart.items.map((item) => item.catalogItemId),
    [cart.items],
  );
  const signalIds = useMemo(
    () => filterCatalogItemIds(Array.from(new Set([...viewedIds, ...cartIds]))),
    [viewedIds, cartIds],
  );

  const { categoryIds, isLoading: categoryLoading } = useCategorySignals(signalIds);

  const targetBuIds = useMemo(() => {
    const buSet = new Set<string>();
    if (preferredBusinessUnitId) buSet.add(preferredBusinessUnitId);
    for (const bu of businessUnits) {
      buSet.add(bu._id);
      if (buSet.size >= 2) break;
    }
    return Array.from(buSet);
  }, [businessUnits, preferredBusinessUnitId]);

  const cat0 = useQuery(
    api.catalogItems.getByCategoryIds,
    targetBuIds[0] && categoryIds.length > 0
      ? {
          businessUnitId: targetBuIds[0] as Id<"businessUnits">,
          categoryIds: categoryIds as Id<"categories">[],
          excludeIds: signalIds as Id<"catalogItems">[],
          limit: 8,
        }
      : "skip",
  ) as CatalogItem[] | undefined;
  const cat1 = useQuery(
    api.catalogItems.getByCategoryIds,
    targetBuIds[1] && categoryIds.length > 0
      ? {
          businessUnitId: targetBuIds[1] as Id<"businessUnits">,
          categoryIds: categoryIds as Id<"categories">[],
          excludeIds: signalIds as Id<"catalogItems">[],
          limit: 8,
        }
      : "skip",
  ) as CatalogItem[] | undefined;

  const bestSellers0 = useQuery(
    api.catalogItems.getBestSellers,
    targetBuIds[0]
      ? { businessUnitId: targetBuIds[0] as Id<"businessUnits">, limit: 8 }
      : "skip",
  ) as CatalogItem[] | undefined;
  const bestSellers1 = useQuery(
    api.catalogItems.getBestSellers,
    targetBuIds[1]
      ? { businessUnitId: targetBuIds[1] as Id<"businessUnits">, limit: 8 }
      : "skip",
  ) as CatalogItem[] | undefined;

  const rankedItems = useMemo(() => {
    const excludeSet = new Set<string>(signalIds);
    return rankCatalogItems(
      [
        { items: [...(cat0 ?? []), ...(cat1 ?? [])], weight: 6 },
        { items: [...(bestSellers0 ?? []), ...(bestSellers1 ?? [])], weight: 4 },
      ],
      10,
    ).filter((item) => !excludeSet.has(item._id));
  }, [cat0, cat1, bestSellers0, bestSellers1, signalIds]);

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

  const isLoading = categoryLoading && signalIds.length > 0;

  return (
    <ProductGridSection
      id="recommended-for-you"
      eyebrow="Just For You"
      eyebrowIcon={Sparkles}
      title="Recommended for You"
      subtitle="Hand-picked picks based on what you browse and add to cart"
      items={rankedItems}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      onOpenItemDetails={onOpenItemDetails}
      loading={isLoading}
    />
  );
}