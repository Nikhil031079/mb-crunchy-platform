import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAddToCart } from "@/hooks/use-add-to-cart";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// FrequentlyBoughtTogetherSection — co-purchase data from past orders, with a
// best-seller fallback when order history is too thin to mine.
// ============================================================================

interface FrequentlyBoughtTogetherSectionProps {
  catalogItemId: string;
  businessUnitId: string;
  businessUnits: BusinessUnit[];
  productName: string;
}

export function FrequentlyBoughtTogetherSection({
  catalogItemId,
  businessUnitId,
  businessUnits,
  productName,
}: FrequentlyBoughtTogetherSectionProps) {
  const handleAddToCart = useAddToCart();

  const coPurchased = useQuery(
    api.catalogItems.getCoPurchased,
    {
      catalogItemId: catalogItemId as Id<"catalogItems">,
      businessUnitId: businessUnitId as Id<"businessUnits">,
      excludeIds: [catalogItemId as Id<"catalogItems">],
      limit: 4,
    },
  ) as CatalogItem[] | undefined;

  const fallbackBest = useQuery(
    api.catalogItems.getBestSellers,
    coPurchased !== undefined && coPurchased.length === 0
      ? {
          businessUnitId: businessUnitId as Id<"businessUnits">,
          limit: 4,
        }
      : "skip",
  ) as CatalogItem[] | undefined;

  const items = useMemo(() => {
    const candidates =
      coPurchased && coPurchased.length > 0 ? coPurchased : fallbackBest ?? [];
    return candidates.filter((item) => item._id !== catalogItemId);
  }, [coPurchased, fallbackBest, catalogItemId]);

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

  const handleAddAll = useCallback(() => {
    for (const item of items) handleAddToCart(item);
    toast.success("Bundle added to cart", {
      description: `${items.length} items added together`,
    });
  }, [items, handleAddToCart]);

  return (
    <ProductGridSection
      id="frequently-bought-together"
      eyebrow="Complete the Set"
      eyebrowIcon={PackagePlus}
      title="Frequently Bought Together"
      subtitle={`Perfect pairings for ${productName}`}
      items={items}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      loading={coPurchased === undefined}
      skeletonCount={4}
      action={
        items.length > 0
          ? { label: "Add All to Cart", onClick: handleAddAll }
          : undefined
      }
      variant="secondary"
    />
  );
}
