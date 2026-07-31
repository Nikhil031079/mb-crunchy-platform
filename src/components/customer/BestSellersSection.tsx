import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";

import { SectionHeader } from "./SectionHeader";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// BestSellersSection — global "Best Sellers" row across active business units
// ============================================================================

interface BestSellersSectionProps {
  businessUnits: BusinessUnit[];
}

export function BestSellersSection({ businessUnits }: BestSellersSectionProps) {
  const navigate = useNavigate();
  const { addItem } = useCart();

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  const b0 = businessUnits[0]?._id;
  const b1 = businessUnits[1]?._id;
  const b2 = businessUnits[2]?._id;
  const b3 = businessUnits[3]?._id;

  const r0 = useQuery(
    api.catalogItems.getBestSellers,
    b0 ? { businessUnitId: b0, limit: 8 } : "skip",
  ) as CatalogItem[] | undefined;
  const r1 = useQuery(
    api.catalogItems.getBestSellers,
    b1 ? { businessUnitId: b1, limit: 8 } : "skip",
  ) as CatalogItem[] | undefined;
  const r2 = useQuery(
    api.catalogItems.getBestSellers,
    b2 ? { businessUnitId: b2, limit: 8 } : "skip",
  ) as CatalogItem[] | undefined;
  const r3 = useQuery(
    api.catalogItems.getBestSellers,
    b3 ? { businessUnitId: b3, limit: 8 } : "skip",
  ) as CatalogItem[] | undefined;

  const expectedCount = Math.min(businessUnits.length, 4);
  const isLoading =
    expectedCount > 0 &&
    [r0, r1, r2, r3].slice(0, expectedCount).some((result) => result === undefined);

  const bestSellers = useMemo(() => {
    const items = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    }).slice(0, 10);
  }, [r0, r1, r2, r3]);

  const firstBuSlug = businessUnits[0]?.slug;

  const handleAddToCart = useCallback(
    (product: CatalogItem | CardProduct) => {
      const item = product as CatalogItem;
      addItem({
        catalogItemId: item._id,
        itemType: "product",
        businessUnitId: item.businessUnitId,
        name: item.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: item.price ?? 0,
        image: item.coverImage || item.thumbnail,
      });
      toast.success("Added to cart", { description: item.name });
    },
    [addItem],
  );

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <ProductCardSkeleton key={i} compact />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (bestSellers.length === 0) return null;

  return (
    <section id="best-sellers" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Top Picks
          </span>
        </div>
        <SectionHeader
          title="Best Sellers"
          subtitle="The most-loved products our customers can't stop ordering"
          action={
            firstBuSlug
              ? {
                  label: "Browse All",
                  onClick: () => navigate(`/${firstBuSlug}`),
                }
              : undefined
          }
          size="sm"
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {bestSellers.map((item, index) => (
            <ProductCard
              key={item._id}
              product={item}
              businessUnitSlug={buSlugsById.get(item.businessUnitId)}
              index={index}
              compact
              onAddToCart={handleAddToCart}
              className={cn(index >= 4 && "hidden sm:block")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
