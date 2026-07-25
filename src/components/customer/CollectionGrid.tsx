import { useCallback, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ShoppingCart, Trash2, ImageOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";

import type { CustomerCollection, CatalogItemType } from "@/types";

// ============================================================================
// CollectionGrid — Display collection items in a responsive grid
// ============================================================================

interface CollectionGridProps {
  items: CustomerCollection[];
  onAddToCart?: (item: CustomerCollection) => void;
  onRemove?: (item: CustomerCollection) => void;
  emptyMessage?: string;
  businessUnitSlug?: string;
  categorySlug?: string;
  loading?: boolean;
}

export function CollectionGrid({
  items,
  onAddToCart,
  onRemove,
  emptyMessage = "No items in this collection yet.",
  loading = false,
}: CollectionGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CollectionItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, index) => (
        <CollectionItemCard
          key={item._id}
          item={item}
          index={index}
          onAddToCart={onAddToCart}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

// ============================================================================
// CollectionItemCard — Single item in a collection
// ============================================================================

interface CollectionItemCardProps {
  item: CustomerCollection;
  index: number;
  onAddToCart?: (item: CustomerCollection) => void;
  onRemove?: (item: CustomerCollection) => void;
}

function CollectionItemCard({
  item,
  index,
  onAddToCart,
  onRemove,
}: CollectionItemCardProps) {
  const [imageError, setImageError] = useState(false);

  const itemName = (item as Record<string, unknown>).name as string | undefined;
  const itemPrice = (item as Record<string, unknown>).price as number | undefined;
  const itemImage = (item as Record<string, unknown>).image as string | undefined;
  const itemSlug = (item as Record<string, unknown>).slug as string | undefined;
  const buSlug = (item as Record<string, unknown>).businessUnitSlug as string | undefined;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddToCart?.(item);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.(item);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <div className="relative aspect-square overflow-hidden bg-secondary">
          {itemImage && !imageError ? (
            <img
              src={itemImage}
              alt={itemName ?? "Item"}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}

          {/* Remove button */}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove from collection"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {itemName ?? "Unknown Item"}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {item.itemType}
            </p>
          </div>

          {itemPrice !== undefined && (
            <p className="text-sm font-bold">{formatCurrency(itemPrice)}</p>
          )}

          <div className="flex items-center gap-2">
            {onAddToCart && (
              <Button
                variant="default"
                size="sm"
                onClick={handleAddToCart}
                className="flex-1 gap-1.5 rounded-lg text-xs"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Add to Cart
              </Button>
            )}
            {buSlug && itemSlug && (
              <Link
                to={`/${buSlug}/${itemSlug}`}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ============================================================================
// CollectionItemSkeleton — Loading placeholder
// ============================================================================

function CollectionItemSkeleton() {
  return (
    <Card>
      <div className="aspect-square animate-pulse bg-secondary" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-secondary" />
        <div className="flex gap-2">
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-secondary" />
          <div className="h-8 w-8 animate-pulse rounded-lg bg-secondary" />
        </div>
      </div>
    </Card>
  );
}
