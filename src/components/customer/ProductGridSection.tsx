import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { LucideIcon } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { cn } from "@/lib/utils";

import { SectionHeader } from "./SectionHeader";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

import type { CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// ProductGridSection — shared labeled product row used by merchandising
// sections (recently viewed, continue shopping, recommendations, trending…).
// ============================================================================

interface ProductGridSectionProps {
  id?: string;
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  items: CatalogItem[];
  buSlugsById: Map<string, string>;
  onAddToCart: (product: CatalogItem | CardProduct) => void;
  loading?: boolean;
  skeletonCount?: number;
  variant?: "default" | "secondary";
}

export function ProductGridSection({
  id,
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
  action,
  items,
  buSlugsById,
  onAddToCart,
  loading = false,
  skeletonCount = 5,
  variant = "default",
}: ProductGridSectionProps) {
  const itemIds = useMemo(
    () => items.map((item) => item._id as Id<"catalogItems">),
    [items],
  );

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    !loading && itemIds.length > 0 ? { ids: itemIds } : "skip",
  ) as Record<string, { average: number; count: number }> | undefined;

  if (loading) {
    return (
      <section id={id} className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: skeletonCount }, (_, i) => (
              <ProductCardSkeleton key={i} compact />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section
      id={id}
      className={cn(
        "py-12 sm:py-16",
        variant === "secondary" && "bg-secondary/20"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {eyebrow && EyebrowIcon && (
          <div className="mb-2 flex items-center gap-2">
            <EyebrowIcon className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              {eyebrow}
            </span>
          </div>
        )}
        <SectionHeader title={title} subtitle={subtitle} action={action} size="sm" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item, index) => (
            <ProductCard
              key={item._id}
              product={item}
              businessUnitSlug={buSlugsById.get(item.businessUnitId)}
              index={index}
              compact
              onAddToCart={onAddToCart}
              rating={ratingsMap?.[item._id]}
              className={cn(index >= 4 && "hidden sm:block")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
