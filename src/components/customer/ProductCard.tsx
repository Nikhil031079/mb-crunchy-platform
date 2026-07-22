import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, Heart, ImageOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";
import { StockBadge } from "./StockBadge";

import type { Product, CatalogItem } from "@/types";
import type { StockInfo } from "./StockBadge";

type CardProduct = Pick<
  Product,
  "_id" | "name" | "slug" | "coverImage" | "images" | "variants" | "tags"
> &
  Partial<Pick<Product, "description" | "status" | "featured">>;

interface ProductCardProps {
  product: CardProduct | CatalogItem;
  businessUnitSlug?: string;
  categorySlug?: string;
  index?: number;
  onAddToCart?: (product: CardProduct | CatalogItem) => void;
  onFavorite?: (product: CardProduct | CatalogItem) => void;
  isFavorited?: boolean;
  showDescription?: boolean;
  className?: string;
  compact?: boolean;
  stockInfo?: StockInfo;
}

export function ProductCard({
  product,
  businessUnitSlug,
  categorySlug,
  index = 0,
  onAddToCart,
  onFavorite,
  isFavorited = false,
  showDescription = false,
  className,
  compact = false,
  stockInfo,
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const hasVariants = "variants" in product && product.variants && product.variants.length > 0;
  const minPrice = hasVariants
    ? Math.min(...product.variants!.map((v) => v.price))
    : "price" in product
    ? (product as CatalogItem).price
    : 0;

  const maxPrice = hasVariants
    ? Math.max(...product.variants!.map((v) => v.price))
    : minPrice;

  const compareAtPrice = "compareAtPrice" in product
    ? (product as CatalogItem).compareAtPrice
    : hasVariants
    ? product.variants![0].compareAtPrice
    : undefined;

  const discount = compareAtPrice ? calculateDiscount(minPrice, compareAtPrice) : 0;
  const coverSrc = product.coverImage || ('images' in product ? product.images?.[0] : undefined);

  const isOutOfStock = stockInfo?.status === "out_of_stock";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOutOfStock) {
      onAddToCart?.(product);
    }
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFavorite?.(product);
  };

  const productUrl = businessUnitSlug && categorySlug
    ? `/${businessUnitSlug}/${categorySlug}/${product.slug}`
    : null;

  const Wrapper = productUrl ? "a" : "div";
  const wrapperProps = productUrl
    ? { href: productUrl, className: "group block" }
    : { className: "group block" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <Wrapper {...wrapperProps}>
        <Card
          className={cn(
            "overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
            compact ? "max-w-[200px]" : "",
            className
          )}
        >
          {/* Image Container */}
          <div className="relative aspect-square overflow-hidden bg-secondary">
            {coverSrc && !imageError ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-secondary" />
                )}
                <img
                  src={coverSrc}
                  alt={product.name}
                  className={cn(
                    "h-full w-full object-cover transition-all duration-500 group-hover:scale-105",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}

            {/* Discount Badge */}
            {discount > 0 && (
              <Badge
                variant="default"
                className="absolute left-2 top-2 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5"
              >
                -{discount}%
              </Badge>
            )}

            {/* Stock Badge */}
            {stockInfo && stockInfo.status !== "unknown" && (
              <StockBadge
                stockInfo={stockInfo}
                className={cn(
                  "absolute left-2",
                  discount > 0 ? "top-8" : "top-2"
                )}
              />
            )}

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                <Badge
                  variant="destructive"
                  className="text-xs font-semibold px-3 py-1"
                >
                  Out of Stock
                </Badge>
              </div>
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

            {/* Add to Cart Overlay */}
            {onAddToCart && (
              <div className="absolute bottom-0 left-0 right-0 translate-y-full p-2 transition-transform duration-300 group-hover:translate-y-0">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddToCart}
                  className="w-full gap-1.5 rounded-lg text-xs shadow-lg"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Add to Cart
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          <CardContent className={cn("p-3", compact ? "p-2.5" : "p-3")}>
            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {product.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Name */}
            <h3 className="line-clamp-1 text-sm font-medium group-hover:text-accent transition-colors">
              {product.name}
            </h3>

            {/* Description */}
            {showDescription && "description" in product && product.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {product.description}
              </p>
            )}

            {/* Price */}
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-sm font-bold">
                {formatCurrency(minPrice)}
              </span>
              {maxPrice > minPrice && (
                <span className="text-xs text-muted-foreground">
                  – {formatCurrency(maxPrice)}
                </span>
              )}
              {compareAtPrice && compareAtPrice > minPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatCurrency(compareAtPrice)}
                </span>
              )}
            </div>

            {/* Variant hint */}
            {hasVariants && compact && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {product.variants!.length} sizes
              </p>
            )}
          </CardContent>
        </Card>
      </Wrapper>
    </motion.div>
  );
}

/**
 * ProductCardSkeleton — loading placeholder
 */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card className={compact ? "max-w-[200px]" : ""}>
      <div className="aspect-square animate-pulse bg-secondary" />
      <CardContent className={compact ? "p-2.5" : "p-3"}>
        <div className="mb-1.5 flex gap-1">
          <div className="h-4 w-12 animate-pulse rounded-full bg-secondary" />
        </div>
        <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded bg-secondary" />
          <div className="h-4 w-12 animate-pulse rounded bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
