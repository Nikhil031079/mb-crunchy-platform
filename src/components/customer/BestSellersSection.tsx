import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { TrendingUp } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useProductCategorySlugs } from "@/hooks/use-product-routes";
import { useDefaultVariantNames } from "@/hooks/use-default-variant-names";

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
  const addCallback = useAddToCart();
  const handleAddToCart = useCallback(
    (product: CatalogItem | CardProduct) => addCallback(product as CatalogItem),
    [addCallback],
  );

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  // Single aggregated query — returns best sellers across ALL BUs
  const bestSellersRaw = useQuery(
    api.catalogItems.getBestSellersAcrossBusinessUnits,
    { limit: 16 },
  ) as CatalogItem[] | undefined;

  const isLoading = bestSellersRaw === undefined;

  const bestSellers = useMemo(() => {
    if (!bestSellersRaw) return [];
    const seen = new Set<string>();
    return bestSellersRaw.filter((item) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    }).slice(0, 10);
  }, [bestSellersRaw]);

  const firstBuSlug = businessUnits[0]?.slug;

  const categorySlugBySourceId = useProductCategorySlugs(bestSellers);
  const defaultVariantNameBySourceId = useDefaultVariantNames(bestSellers);

  if (isLoading) {
    return (
      <section className="py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
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
    <section id="best-sellers" className="py-10 sm:py-12 scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-culinary-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-culinary-primary">
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
        {/* Stitch 4-column desktop grid (Phase 4C); mobile grid unchanged */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
          {bestSellers.map((item, index) => (
            <ProductCard
              key={item._id}
              product={item}
              businessUnitSlug={buSlugsById.get(item.businessUnitId)}
              categorySlug={categorySlugBySourceId.get(item.sourceId)}
              index={index}
              compact
              onAddToCart={handleAddToCart}
              defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}
              className={cn(index >= 4 && "hidden sm:block")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
