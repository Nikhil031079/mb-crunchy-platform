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
    }
    return Array.from(buSet);
  }, [businessUnits, preferredBusinessUnitId]);

  // Single aggregated query — returns category-matched items across ALL target BUs
  const catItemsRaw = useQuery(
    api.catalogItems.getByCategoryIdsAcrossBusinessUnits,
    targetBuIds.length > 0 && categoryIds.length > 0
      ? {
          businessUnitIds: targetBuIds as Id<"businessUnits">[],
          categoryIds: categoryIds as Id<"categories">[],
          excludeIds: signalIds as Id<"catalogItems">[],
          limit: 16,
        }
      : "skip",
  ) as CatalogItem[] | undefined;

  // Single aggregated query — returns best sellers across ALL target BUs
  const bestSellersRaw = useQuery(
    api.catalogItems.getBestSellersAcrossBusinessUnits,
    targetBuIds.length > 0
      ? { limit: 16 }
      : "skip",
  ) as CatalogItem[] | undefined;

  const rankedItems = useMemo(() => {
    const excludeSet = new Set<string>(signalIds);
    const targetSet = new Set(targetBuIds);
    return rankCatalogItems(
      [
        { items: (catItemsRaw ?? []).filter((i) => targetSet.has(i.businessUnitId)), weight: 6 },
        { items: (bestSellersRaw ?? []).filter((i) => targetSet.has(i.businessUnitId)), weight: 4 },
      ],
      10,
    ).filter((item) => !excludeSet.has(item._id));
  }, [catItemsRaw, bestSellersRaw, targetBuIds, signalIds]);

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

  const isLoading = categoryLoading && signalIds.length > 0;

  if (businessUnits.length === 0) return null;

  // Phase 21G-B (P1) — no category signal means there is no basis for a
  // personal recommendation. Render nothing instead of falling through to the
  // best-sellers weighting, which for a signal-less visitor produced the exact
  // dataset/order already rendered by BestSellersSection. Best Sellers stays
  // the canonical fallback rail. While signals are still resolving we keep the
  // loading skeleton so the active path is unchanged.
  if (!isLoading && categoryIds.length === 0) return null;

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