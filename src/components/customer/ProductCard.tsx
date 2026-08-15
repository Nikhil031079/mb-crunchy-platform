import { useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Heart, ImageOff, Star, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

import type { Product, CatalogItem } from "@/types";
import type { StockInfo } from "./StockBadge";

export type CardProduct = Pick<
  Product,
  "_id" | "name" | "slug" | "coverImage" | "images" | "variants" | "tags" | "thumbnail"
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
  /** Optional rating summary (average + count) */
  rating?: { average: number; count: number };
  /** Called when the card body is clicked - opens Item Details Modal */
  onOpenItemDetails?: (item: CatalogItem) => void;
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
  rating,
  onOpenItemDetails,
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const [hoverImageError, setHoverImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { cart, updateQuantity } = useCart();
  const { isAuthenticated } = useAuth();

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
  const productImages = "images" in product && Array.isArray(product.images) ? product.images : [];
  const coverSrc = product.coverImage || productImages[0];
  const hoverSrc = productImages.length > 1 ? productImages[1] : undefined;

  // Badge detection via tag conventions ("best-seller", "new-arrival", …)
  const tags = "tags" in product ? (product.tags ?? []) : [];
  const normalizedTags = tags.map((t) => t.toLowerCase().replace(/[\s_]+/g, "-"));
  const isBestSeller = normalizedTags.some((t) =>
    ["best-seller", "bestseller", "bestsellers", "top-rated", "popular"].includes(t)
  );
  const isNewArrival = normalizedTags.some((t) =>
    ["new", "new-arrival", "newly-added", "just-in"].includes(t)
  );

  const isOutOfStock = stockInfo?.status === "out_of_stock";
  const isLowStock = stockInfo?.status === "low_stock";

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
    if (onFavorite) {
      onFavorite(product);
      return;
    }
    if (!isAuthenticated) {
      toast.info("Sign in to save favourites", {
        description: "Create a free account to save your favourite items.",
      });
      return;
    }
    toast.info("Favourites coming soon", {
      description: "Favourite syncing will be available in the next update.",
    });
  }, [onFavorite, product, isAuthenticated]);

  // Card body click — opens modal if onOpenItemDetails is provided
  const cardOnClick = () => {
    if (onOpenItemDetails) {
      onOpenItemDetails(product as CatalogItem);
    }
  };

  const inner = (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "border border-border/50 hover:border-border",
        "hover:shadow-lg hover:-translate-y-0.5",
        onOpenItemDetails && "cursor-pointer",
        isOutOfStock && "opacity-70",
        className
      )}
      onClick={onOpenItemDetails ? cardOnClick : undefined}
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
                    hoverSrc && "group-hover:opacity-0",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
                {hoverSrc && !hoverImageError && (
                  <img
                    src={hoverSrc}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
                    onError={() => setHoverImageError(true)}
                  />
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="h-10 w-10 text-muted-foreground/20" />
              </div>
            )}

            {/* Badge stack — top-left */}
            {(discount > 0 || isBestSeller || isNewArrival) && (
              <div className="absolute left-0 top-0 z-10 flex flex-col items-start gap-1">
                {discount > 0 && (
                  <Badge
                    variant="default"
                    className="rounded-none rounded-br-lg bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 h-auto"
                  >
                    {discount}% OFF
                  </Badge>
                )}
                {isBestSeller && (
                  <Badge
                    variant="default"
                    className="rounded-none rounded-br-lg bg-orange-600 text-white text-[10px] font-bold px-2 py-1 h-auto gap-0.5"
                  >
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Best Seller
                  </Badge>
                )}
                {isNewArrival && (
                  <Badge
                    variant="default"
                    className="rounded-none rounded-br-lg bg-sky-600 text-white text-[10px] font-bold px-2 py-1 h-auto"
                  >
                    New Arrival
                  </Badge>
                )}
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

            {/* Favorite Button — placeholder for real favourites */}
            <button
              onClick={handleFavorite}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-all hover:bg-background hover:scale-110"
              aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  isFavorited ? "fill-red-500 text-red-500" : "text-muted-foreground"
                )}
              />
            </button>

            {/* Quick Add — floating circular button (Blinkit-style stepper) */}
            {onAddToCart && !isOutOfStock && (
              <div
                className={cn(
                  "absolute bottom-2 right-2 z-10",
                  cartQuantity === 0 &&
                    "lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-hover:opacity-100"
                )}
              >
                {cartQuantity === 0 ? (
                  <button
                    onClick={handleAdd}
                    aria-label={`Add ${product.name} to cart`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition-all duration-200 hover:bg-emerald-700 active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex h-8 items-center rounded-full bg-emerald-600 text-white shadow-md">
                    <button
                      onClick={handleDecrement}
                      aria-label={`Decrease quantity of ${product.name}`}
                      className="flex h-full w-7 items-center justify-center rounded-l-full transition-colors hover:bg-emerald-700"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-xs font-bold tabular-nums">
                      {cartQuantity}
                    </span>
                    <button
                      onClick={handleIncrement}
                      aria-label={`Increase quantity of ${product.name}`}
                      className="flex h-full w-7 items-center justify-center rounded-r-full transition-colors hover:bg-emerald-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
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
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-bold tracking-tight text-foreground">
                  {formatCurrency(minPrice)}
                </span>
                {maxPrice > minPrice && (
                  <span className="text-[11px] text-muted-foreground">
                    – {formatCurrency(maxPrice)}
                  </span>
                )}
                {compareAtPrice && compareAtPrice > minPrice && (
                  <span className="text-[11px] text-muted-foreground line-through">
                    {formatCurrency(compareAtPrice)}
                  </span>
                )}
              </div>

              {/* Rating — real summary when available, otherwise placeholder */}
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {rating && rating.count > 0 ? (
                  <>
                    <span className="font-semibold text-foreground">{rating.average.toFixed(1)}</span>
                    <span className="text-muted-foreground/70">({rating.count})</span>
                  </>
                ) : (
                  <span className="font-medium text-amber-600 dark:text-amber-400">New</span>
                )}
              </div>
            </div>

            {/* Low stock hint */}
            {isLowStock && !compact && (
              <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Only {stockInfo!.quantity} left
              </p>
            )}

            {/* Variant hint */}
            {hasVariants && product.variants!.length > 1 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {product.variants!.length} options available
              </p>
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
      {inner}
    </motion.div>
  );
});

/**
 * ProductCardSkeleton — loading placeholder
 */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="overflow-hidden border border-border/50">
      <div className="relative aspect-[4/3] animate-pulse bg-secondary/50">
        <div className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-secondary" />
      </div>
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
      </CardContent>
    </Card>
  );
}
