import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { Flame } from "lucide-react";

import { api } from "@convex/_generated/api";

import { useAddToCart } from "@/hooks/use-add-to-cart";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// TodaySpecialsSection — single deduped "Today's Specials" row built from
// featured products across active business units. Keeps identical products
// out of the homepage by collapsing all merchandising rows into one.
// ============================================================================

interface TodaySpecialsSectionProps {
  businessUnits: BusinessUnit[];
  onOpenItemDetails?: (item: CatalogItem) => void;
}

export function TodaySpecialsSection({
  businessUnits,
  onOpenItemDetails,
}: TodaySpecialsSectionProps) {
  const handleAddToCart = useAddToCart();

  // Single aggregated query — returns all featured catalog items across ALL BUs
  const allFeaturedRaw = useQuery(
    api.catalogItems.getAllFeaturedAcrossBusinessUnits,
  ) as CatalogItem[] | undefined;

  const isLoading = allFeaturedRaw === undefined;

  const items = useMemo(() => {
    if (!allFeaturedRaw) return [];
    const seen = new Set<string>();
    return allFeaturedRaw
      .filter((item) => item.itemType === "product" && item.status === "active")
      .filter((item) => {
        if (seen.has(item._id)) return false;
        seen.add(item._id);
        return true;
      })
      .slice(0, 10);
  }, [allFeaturedRaw]);

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

  return (
    <ProductGridSection
      id="today-specials"
      eyebrow="Today's Specials"
      eyebrowIcon={Flame}
      title="Today's Specials"
      subtitle="Featured picks, fresh across our stores"
      items={items}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      onOpenItemDetails={onOpenItemDetails}
      loading={isLoading}
    />
  );
}