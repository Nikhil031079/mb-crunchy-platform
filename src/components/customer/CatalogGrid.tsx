import { cn } from "@/lib/utils";

import { ProductCard } from "./ProductCard";
import { CardGridSkeleton } from "./Skeleton";

import type { StockInfo } from "./StockBadge";
import type { CardProduct } from "./ProductCard";
import type { CatalogItem } from "@/types";
import type { CatalogViewMode } from "./CatalogToolbar";

// ============================================================================
// CatalogGrid — the ONE product grid/list renderer for customer catalogs.
//
// Used by BusinessUnitPage (full store catalog) and CategoryPage (the same
// catalog with a category scope applied upstream). Owns only presentation:
// grid/list classes, ProductCard wiring, loading skeleton and empty handling.
// Filtering and sorting happen before this component is reached.
// ============================================================================

interface CatalogGridProps {
  items: CatalogItem[];
  viewMode: CatalogViewMode;
  /** Store slug — every card links inside this business unit only. */
  businessUnitSlug: string;
  /** Resolves the canonical category slug used for a product's PDP link. */
  categorySlugFor?: (item: CatalogItem) => string | undefined;
  onAddToCart: (product: CatalogItem | CardProduct) => void;
  /** Optional stock lookup for the default variant. */
  stockInfoFor?: (item: CatalogItem) => StockInfo | undefined;
  /** Ratings keyed by catalog item id. */
  ratingsMap?: Record<string, { average: number; count: number }>;
  onOpenItemDetails?: (item: CatalogItem) => void;
  /** Renders a skeleton grid instead of items. */
  loading?: boolean;
  skeletonCount?: number;
  /** Rendered only when not loading and there is nothing to show. */
  emptyState?: React.ReactNode;
}

export function CatalogGrid({
  items,
  viewMode,
  businessUnitSlug,
  categorySlugFor,
  onAddToCart,
  stockInfoFor,
  ratingsMap,
  onOpenItemDetails,
  loading = false,
  skeletonCount = 8,
  emptyState,
}: CatalogGridProps) {
  if (loading) {
    return <CardGridSkeleton count={skeletonCount} columns={4} type="product" />;
  }

  // Sparse-data rule: never render a grid shell with no products.
  if (items.length === 0) return emptyState ?? null;

  return (
    <div
      className={cn(
        viewMode === "grid"
          ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          : "space-y-3",
      )}
    >
      {items.map((item, index) => (
        <ProductCard
          key={item._id}
          product={item}
          businessUnitSlug={businessUnitSlug}
          categorySlug={categorySlugFor?.(item)}
          index={index}
          compact={viewMode === "grid"}
          showDescription={viewMode === "list"}
          onAddToCart={onAddToCart}
          stockInfo={stockInfoFor?.(item)}
          rating={ratingsMap?.[item._id]}
          onOpenItemDetails={onOpenItemDetails}
        />
      ))}
    </div>
  );
}
