import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { Store } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/use-add-to-cart";

import { SectionHeader } from "./SectionHeader";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// MartGridSection — dedicated Mart product grid (Phase 4D).
//
// Uses the SAME best-sellers query the homepage already fires and filters
// client-side to the Mart business unit — no new backend query, no fake
// products, no hardcoded prices. Cart interaction reuses the shared
// add-to-cart flow via the existing ProductCard.
// ============================================================================

interface MartGridSectionProps {
  martBU: BusinessUnit;
  onOpenItemDetails?: (item: CatalogItem) => void;
}

export function MartGridSection({ martBU, onOpenItemDetails }: MartGridSectionProps) {
  const navigate = useNavigate();
  const addCallback = useAddToCart();
  const handleAddToCart = useCallback(
    (product: CatalogItem | CardProduct) => addCallback(product as CatalogItem),
    [addCallback],
  );

  // Identical call to BestSellersSection — deduped by the Convex client.
  const bestSellersRaw = useQuery(
    api.catalogItems.getBestSellersAcrossBusinessUnits,
    { limit: 16 },
  ) as CatalogItem[] | undefined;

  const isLoading = bestSellersRaw === undefined;

  const martItems = useMemo(() => {
    if (!bestSellersRaw) return [];
    const seen = new Set<string>();
    return bestSellersRaw
      .filter((item) => {
        if (item.businessUnitId !== martBU._id) return false;
        if (seen.has(item._id)) return false;
        seen.add(item._id);
        return true;
      })
      .slice(0, 8);
  }, [bestSellersRaw, martBU._id]);

  if (isLoading) {
    return (
      <section className="py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} compact />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (martItems.length === 0) return null;

  return (
    <section id="mart-grid" className="scroll-mt-24 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <Store className="h-4 w-4 text-culinary-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-culinary-primary">
            {martBU.name}
          </span>
        </div>
        <SectionHeader
          title={`${martBU.catalogLabel ?? "Pantry"} Picks`}
          subtitle={martBU.description}
          action={{
            label: `Shop ${martBU.name}`,
            onClick: () => navigate(`/${martBU.slug}`),
          }}
          size="sm"
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {martItems.map((item, index) => (
            <ProductCard
              key={item._id}
              product={item}
              businessUnitSlug={martBU.slug}
              index={index}
              compact
              imageFit="contain"
              onAddToCart={handleAddToCart}
              onOpenItemDetails={onOpenItemDetails}
              className={cn(index >= 4 && "hidden sm:block")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
