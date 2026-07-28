import { useState, useCallback, memo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ShoppingCart, Heart, ImageOff, Star, Minus, Plus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";
import { useCart } from "@/stores/cart";
import { StockBadge } from "./StockBadge";

import type { Product, CatalogItem } from "@/types";
import type { StockInfo } from "./StockBadge";

type CardProduct = Pick<
  Product,
  "_id" | "name" | "slug" | "coverImage" | "images" | "variants" | "tags"
> &
  Partial<Pick<Product, "description" | "status" | "featured">> &
  Partial<{ vegNonVeg: "veg" | "nonveg" }>;

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

export const ProductCard = memo(function ProductCard({
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
  const { cart, addItem, updateQuantity } = useCart();

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

  // Check if this product is in the cart and get its quantity
  const defaultVariantName = hasVariants ? product.variants![0].optionValue : "Default";
  const cartItem = cart.items.find(
    (item) => item.catalogItemId === product._id && item.variantName === defaultVariantName
  );
  const cartQuantity = cartItem?.quantity ?? 0;

  // Veg/Non-veg indicator
  const vegNonVeg = "vegNonVeg" in product ? (product as CardProduct).vegNonVeg as "veg" | "nonveg" | undefined : undefined;

  const handleAdd = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    onAddToCart?.(product);
  }, [isOutOfStock, onAddToCart, product]);

  const handleIncrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItem) {
      updateQuantity(product._id, defaultVariantName, cartItem.quantity + 1);
    }
  }, [cartItem, updateQuantity, product._id, defaultVariantName]);

  const handleDecrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItem) {
      const newQty = cartItem.quantity - 1;
      if (newQty <= 0) {
        updateQuantity(product._id, defaultVariantName, 0);
      } else {
        updateQuantity(product._id, defaultVariantName, newQty);
      }
    }
  }, [cartItem, updateQuantity, product._id, defaultVariantName]);

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFavorite?.(product);
  }, [onFavorite, product]);

  const productUrl = businessUnitSlug
    ? categorySlug
      ? `/${businessUnitSlug}/${categorySlug}/${product.slug}`
      : `/${businessUnitSlug}/${product.slug}`
    : null;

  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        "border border-border/50 hover:border-border",
        "hover:shadow-md",
        isOutOfStock && "opacity-70",
        className
      )}
    >
          {/* Image Container */}
          <div className="relative aspect-[4/3] overflow-hidden bg-secondary/50">
            {coverSrc && !imageError ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-secondary" />
                )}
                <img
                  src={coverSrc}
                  alt={product.name}
                  className={cn(
                    "h-full w-full object-cover transition-all duration-500",
                    "group-hover:scale-105",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="h-10 w-10 text-muted-foreground/20" />
              </div>
            )}

            {/* Discount Badge */}
            {discount > 0 && (
              <div className="absolute left-0 top-0">
                <Badge
                  variant="default"
                  className="rounded-none rounded-br-lg bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 h-auto"
                >
                  {discount}% OFF
                </Badge>
              </div>
            )}

            {/* Featured Badge */}
            {"featured" in product && product.featured && (
              <div className="absolute right-0 top-0">
                <Badge
                  variant="default"
                  className="rounded-none rounded-bl-lg bg-amber-500 text-white text-[10px] font-bold px-2 py-1 h-auto gap-0.5"
                >
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Featured
                </Badge>
              </div>
            )}

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
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
              <button
                onClick={handleFavorite}
                className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 backdrop-blur-sm transition-colors hover:bg-background/90"
                aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isFavorited ? "fill-red-500 text-red-500" : "text-muted-foreground"
                  )}
                />
              </button>
            )}
          </div>

          {/* Content */}
          <CardContent className={cn("p-3", compact ? "p-2.5" : "p-3")}>
            {/* Top row: Veg/Non-veg indicator + Name */}
            <div className="flex items-start gap-1.5">
              {/* Veg/Non-veg indicator */}
              {vegNonVeg && (
                <div
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-sm border-[1.5px] p-[2px]",
                    vegNonVeg === "veg"
                      ? "border-green-600"
                      : "border-red-600"
                  )}
                  title={vegNonVeg === "veg" ? "Vegetarian" : "Non-Vegetarian"}
                >
                  <div
                    className={cn(
                      "h-full w-full rounded-full",
                      vegNonVeg === "veg" ? "bg-green-600" : "bg-red-600"
                    )}
                  />
                </div>
              )}

              {/* Name */}
              <h3 className="line-clamp-2 text-[13px] font-medium leading-tight group-hover:text-accent transition-colors">
                {product.name}
              </h3>
            </div>

            {/* Description */}
            {showDescription && "description" in product && product.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {product.description}
              </p>
            )}

            {/* Price + Rating row */}
            <div className="mt-2 flex items-end justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold">
                  {formatCurrency(minPrice)}
                </span>
                {maxPrice > minPrice && (
                  <span className="text-[10px] text-muted-foreground">
                    – {formatCurrency(maxPrice)}
                  </span>
                )}
                {compareAtPrice && compareAtPrice > minPrice && (
                  <span className="text-[10px] text-muted-foreground line-through">
                    {formatCurrency(compareAtPrice)}
                  </span>
                )}
              </div>

              {/* Rating placeholder */}
              {!("featured" in product) && (
                <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  <span>New</span>
                </div>
              )}
            </div>

            {/* Variant hint */}
            {hasVariants && product.variants!.length > 1 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {product.variants!.length} options available
              </p>
            )}

            {/* Add to Cart / Quantity Selector — Blinkit-style */}
            {onAddToCart && !isOutOfStock && (
              <div className="mt-2.5">
                {cartQuantity === 0 ? (
                  /* ADD Button */
                  <button
                    onClick={handleAdd}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-lg",
                      "border-2 border-emerald-600 bg-white py-1.5 text-sm font-semibold",
                      "text-emerald-600 transition-all duration-200",
                      "hover:bg-emerald-50 hover:shadow-sm",
                      "active:scale-[0.98]",
                      "dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ADD
                  </button>
                ) : (
                  /* [-] Qty [+] Selector */
                  <div
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg",
                      "border-2 border-emerald-600 bg-emerald-600",
                      "text-white font-semibold",
                      "transition-all duration-200",
                      "dark:bg-emerald-700 dark:border-emerald-700"
                    )}
                  >
                    <button
                      onClick={handleDecrement}
                      className="flex h-full w-10 items-center justify-center transition-colors hover:bg-emerald-700 dark:hover:bg-emerald-600 rounded-l-lg"
                      aria-label={`Decrease quantity of ${product.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[2rem] text-center text-sm tabular-nums">
                      {cartQuantity}
                    </span>
                    <button
                      onClick={handleIncrement}
                      className="flex h-full w-10 items-center justify-center transition-colors hover:bg-emerald-700 dark:hover:bg-emerald-600 rounded-r-lg"
                      aria-label={`Increase quantity of ${product.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Out of stock CTA */}
            {isOutOfStock && (
              <div className="mt-2.5">
                <div className="flex w-full items-center justify-center rounded-lg border-2 border-border/60 bg-secondary/50 py-1.5 text-xs font-medium text-muted-foreground">
                  Out of Stock
                </div>
              </div>
            )}
          </CardContent>
        </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      {productUrl ? (
        <Link to={productUrl} className="group block">
          {inner}
        </Link>
      ) : (
        <div className="group block">{inner}</div>
      )}
    </motion.div>
  );
});

/**
 * ProductCardSkeleton — loading placeholder
 */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="overflow-hidden border border-border/50">
      <div className="aspect-[4/3] animate-pulse bg-secondary/50" />
      <CardContent className={cn("p-3", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-start gap-1.5">
          <div className="mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-secondary animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-full animate-pulse rounded bg-secondary" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-secondary" />
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-8 animate-pulse rounded bg-secondary" />
        </div>
        <div className="mt-2.5 h-8 w-full animate-pulse rounded-lg bg-secondary" />
      </CardContent>
    </Card>
  );
}
