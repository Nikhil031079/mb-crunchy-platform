import { useState, memo } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, Heart, ImageOff, Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";

import type { Combo } from "@/types";

interface ComboCardProps {
  combo: Combo;
  index?: number;
  onAddToCart?: (combo: Combo) => void;
  onFavorite?: (combo: Combo) => void;
  isFavorited?: boolean;
  className?: string;
}

export const ComboCard = memo(function ComboCard({
  combo,
  index = 0,
  onAddToCart,
  onFavorite,
  isFavorited = false,
  className,
}: ComboCardProps) {
  const [imageError, setImageError] = useState(false);

  const price = combo.price;
  const compareAtPrice = combo.compareAtPrice;
  const discount = combo.savingsPercentage ?? (compareAtPrice ? calculateDiscount(price, compareAtPrice) : 0);
  const itemCount = combo.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const coverSrc = combo.coverImage || combo.images?.[0];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    onAddToCart?.(combo);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFavorite?.(combo);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <Card
        className={cn(
          "group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
          className
        )}
      >
        <div className="flex flex-col sm:flex-row">
          {/* Image Section */}
          <div className="relative aspect-[4/3] sm:aspect-square sm:w-48 shrink-0 overflow-hidden bg-secondary">
            {coverSrc && !imageError ? (
              <img
                src={coverSrc}
                alt={combo.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}

            {/* Savings Badge */}
            {discount > 0 && (
              <Badge
                variant="default"
                className="absolute left-2 top-2 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5"
              >
                Save {discount}%
              </Badge>
            )}

            {/* Favorite Button */}
            {onFavorite && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFavorite}
                className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80"
                aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isFavorited ? "fill-accent text-accent" : "text-muted-foreground"
                  )}
                />
              </Button>
            )}
          </div>

          {/* Content Section */}
          <div className="flex flex-1 flex-col p-4">
            {/* Name */}
            <h3 className="font-semibold group-hover:text-accent transition-colors">
              {combo.name}
            </h3>

            {/* Description */}
            {combo.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {combo.description}
              </p>
            )}

            {/* Items List */}
            {combo.items && combo.items.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Includes ({itemCount} items)
                </p>
                <ul className="space-y-1">
                  {combo.items.slice(0, 4).map((item, i) => (
                    <li
                      key={item.catalogItemId}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span className="truncate">
                        {item.quantity}x Item {item.catalogItemId.slice(0, 8)}
                      </span>
                    </li>
                  ))}
                  {combo.items.length > 4 && (
                    <li className="text-[10px] text-muted-foreground">
                      +{combo.items.length - 4} more items
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bottom: Price + CTA */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold">{formatCurrency(price)}</span>
                {compareAtPrice && compareAtPrice > price && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(compareAtPrice)}
                  </span>
                )}
              </div>

              {onAddToCart && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddToCart}
                  className="gap-1.5 rounded-lg text-xs"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});

/**
 * ComboCardSkeleton — loading placeholder
 */
export function ComboCardSkeleton() {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row">
        <div className="aspect-[4/3] sm:aspect-square sm:w-48 animate-pulse bg-secondary" />
        <div className="flex-1 p-4 space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="space-y-1.5">
            <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-5 w-20 animate-pulse rounded bg-secondary" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-secondary" />
          </div>
        </div>
      </div>
    </Card>
  );
}
