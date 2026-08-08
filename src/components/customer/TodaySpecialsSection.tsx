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
}

export function TodaySpecialsSection({
  businessUnits,
}: TodaySpecialsSectionProps) {
  const handleAddToCart = useAddToCart();

  const b0 = businessUnits[0]?._id;
  const b1 = businessUnits[1]?._id;
  const b2 = businessUnits[2]?._id;
  const b3 = businessUnits[3]?._id;

  const r0 = useQuery(
    api.catalogItems.getFeatured,
    b0 ? { businessUnitId: b0 } : "skip",
  ) as CatalogItem[] | undefined;
  const r1 = useQuery(
    api.catalogItems.getFeatured,
    b1 ? { businessUnitId: b1 } : "skip",
  ) as CatalogItem[] | undefined;
  const r2 = useQuery(
    api.catalogItems.getFeatured,
    b2 ? { businessUnitId: b2 } : "skip",
  ) as CatalogItem[] | undefined;
  const r3 = useQuery(
    api.catalogItems.getFeatured,
    b3 ? { businessUnitId: b3 } : "skip",
  ) as CatalogItem[] | undefined;

  const expectedCount = Math.min(businessUnits.length, 4);
  const isLoading =
    expectedCount > 0 &&
    [r0, r1, r2, r3]
      .slice(0, expectedCount)
      .some((result) => result === undefined);

  const items = useMemo(() => {
    const all = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    return all
      .filter((item) => item.itemType === "product" && item.status === "active")
      .filter((item) => {
        if (seen.has(item._id)) return false;
        seen.add(item._id);
        return true;
      })
      .slice(0, 10);
  }, [r0, r1, r2, r3]);

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
      loading={isLoading}
    />
  );
}
