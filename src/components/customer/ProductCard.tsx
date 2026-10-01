import { useState, useCallback, useMemo, memo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Heart, ImageOff, Star, Minus, Plus, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  calculateDiscount,
  buildBusinessUnitUrl,
  buildCategoryUrl,
  buildProductUrl,
} from "@/utils";
import { getDefaultActiveVariant } from "@/utils/product-variants";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessUnitSlugById } from "@/hooks/use-product-routes";

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
  onAddToCart?: (product: CardProduct | CatalogItem) => void | Promise<void>;
  onFavorite?: (product: CardProduct | CatalogItem) => void;
  isFavorited?: boolean;
  showDescription?: boolean;
  className?: string;
  compact?: boolean;
  stockInfo?: StockInfo;
  /** Optional rating summary (average + count) */
  rating?: { average: number; count: number };
  /**
   * Quick-view handler — opens the Item Details Modal.
   * When the card also resolves to a PDP link, this is surfaced as an explicit
   * "Quick view" control so the modal stays reachable (Phase 21B).
   */
  onOpenItemDetails?: (item: CatalogItem) => void;
  /**
   * Contain-fit imagery for packaged goods (Phase 4D) — visual only.
   * Default "cover" preserves existing behavior; "contain" renders the
   * image uncropped in a light padded well (Mart grid).
   */
  imageFit?: "cover" | "contain";
  /**
   * Canonical default variant name resolved from this product's variants
   * (the quick-add identity) — threaded by the parent when the card item is
   * a plain CatalogItem with no inline variants (Phase 21C-FIX). Inline
   * variants always win; this is the fallback.
   */
  defaultVariantName?: string;
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
  imageFit = "cover",
  defaultVariantName,
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const [hoverImageError, setHoverImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
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

  // Check if this product is in the cart and get its quantity.
  // Identity must be the SAME line quick-add writes: catalogItemId + the
  // CANONICAL default active variant (21D-B rule — getDefaultActiveVariant,
  // never position, never an inactive variant). Inline variants resolve on
  // the card; plain CatalogItems carry none, so the parent threads the
  // fetched canonical name through `defaultVariantName` (Phase 21C-FIX).
  const inlineDefaultVariantName = hasVariants
    ? getDefaultActiveVariant(product.variants)?.optionValue ?? "Default"
    : undefined;
  // Mirrors quick-add's getInlineVariants-first resolution order.
  const cartVariantName = inlineDefaultVariantName ?? defaultVariantName ?? "Default";
  const cartItem = cart.items.find(
    (item) => item.catalogItemId === product._id && item.variantName === cartVariantName
  );
  const cartQuantity = cartItem?.quantity ?? 0;

  // Veg/Non-veg indicator
  const vegNonVeg = "vegNonVeg" in product ? (product as CardProduct).vegNonVeg as "veg" | "nonveg" | undefined : undefined;

  const handleAdd = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock || isAdding) return;
    setIsAdding(true);
    try {
      await onAddToCart?.(product);
    } finally {
      setIsAdding(false);
    }
  }, [isOutOfStock, isAdding, onAddToCart, product]);

  // cartItemId is guaranteed by the cart store's migration logic,
  // but TypeScript doesn't know this invariant. Generate one if missing.
  // `cartItem` is a dependency of BOTH handlers — without it the callbacks
  // close over the first-render line (quantity 0/1) and go stale: the
  // stepper froze at 2 and the final minus removed the line entirely
  // (Phase 21C-FIX defect 1B).
  const handleIncrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItem) {
      const cartItemId = cartItem.cartItemId ?? `cl_${Date.now().toString(36)}_${(Math.random()*1e8>>>0).toString(36)}`;
      updateQuantity(cartItemId, cartItem.quantity + 1);
    }
  }, [updateQuantity, cartItem]);

  const handleDecrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItem) {
      const cartItemId = cartItem.cartItemId ?? `cl_${Date.now().toString(36)}_${(Math.random()*1e8>>>0).toString(36)}`;
      const newQty = cartItem.quantity - 1;
      if (newQty <= 0) {
        updateQuantity(cartItemId, 0);
      } else {
        updateQuantity(cartItemId, newQty);
      }
    }
  }, [updateQuantity, cartItem]);

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

  const itemType = "itemType" in product ? product.itemType : "product";
  const isProductCard = itemType === "product";

  // Sections usually pass the store slug, but their maps are built from
  // homepage-visible stores only. Resolve it from the live store list as a
  // fallback so a card can never end up without a destination (Phase 21B).
  const businessUnitSlugById = useBusinessUnitSlugById();
  const buSlug =
    businessUnitSlug ??
    ("businessUnitId" in product
      ? businessUnitSlugById.get(product.businessUnitId)
      : undefined);

  // Canonical destination for the card's primary area (Phase 21B):
  //  - product with a resolved category slug -> /{bu}/{category}/{product}
  //  - product whose category slug can't be resolved -> /{bu}/{productSlug}
  //    (CategoryPage already redirects that segment to the canonical PDP)
  //  - combo/partyPack have no PDP, so they keep quick-view as their primary
  //    interaction and fall back to the store page when no modal is wired up.
  const navPath = useMemo(() => {
    if (!buSlug || !product.slug) return undefined;
    if (isProductCard) {
      return categorySlug
        ? buildProductUrl(buSlug, categorySlug, product.slug)
        : buildCategoryUrl(buSlug, product.slug);
    }
    return onOpenItemDetails ? undefined : buildBusinessUnitUrl(buSlug);
  }, [buSlug, categorySlug, product.slug, isProductCard, onOpenItemDetails]);

  // Card body click — opens modal when the card has no PDP link to follow
  const cardOnClick = () => {
    if (onOpenItemDetails) {
      onOpenItemDetails(product as CatalogItem);
    }
  };

  // Explicit quick-view control — keeps the modal reachable when the card's
  // primary area now navigates to the PDP.
  const handleQuickView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenItemDetails?.(product as CatalogItem);
    },
    [onOpenItemDetails, product]
  );

  const inner = (
    <Card
      className={cn(
        // Culinary Tier 1 glass, Stitch card composition (Phase 4C):
        // rounded-3xl shell, explicit compact padding (overrides Card base
        // py-6/gap-6), Tier 2 hover lift. Desktop spacing grows at sm/lg.
        // All cart/stock/variant behavior unchanged.
        "group relative overflow-hidden glass-tier-1 rounded-3xl glass-lift",
        "border border-border/50 px-2.5 py-2.5 sm:px-4 sm:py-4 gap-3 lg:gap-4",
        onOpenItemDetails && "cursor-pointer",
        navPath && "cursor-pointer",
        isOutOfStock && "opacity-70",
        className
      )}
      onClick={onOpenItemDetails ? cardOnClick : undefined}
    >
          {/* Image well — inset rounded container (Phase 4C).
              Desktop uses a fixed h-52 well; mobile keeps aspect ratio.
              "contain" renders packaged goods uncropped (Phase 4D Mart).
              Badges, favorite, and quick-add stay positioned in the well. */}
          <div
            className={cn(
              "relative aspect-[4/3] overflow-hidden rounded-2xl bg-secondary/50 lg:aspect-auto lg:h-52",
              imageFit === "contain" && "bg-white/70 p-3 lg:h-48",
            )}
          >
            {coverSrc && !imageError ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-secondary" />
                )}
                <img
                  src={coverSrc}
                  alt={product.name}
                  className={cn(
                    "h-full w-full transition-all duration-500",
                    imageFit === "contain" ? "object-contain" : "object-cover",
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
                    className={cn(
                      "absolute inset-0 h-full w-full opacity-0 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100",
                      imageFit === "contain" ? "object-contain" : "object-cover",
                    )}
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
              <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col items-start gap-1">
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
                    variant="special"
                    className="rounded-none rounded-br-lg text-[10px] font-bold px-2 py-1 h-auto gap-0.5"
                  >
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Best Seller
                  </Badge>
                )}
                {isNewArrival && (
                  <Badge
                    variant="glass"
                    className="rounded-none rounded-br-lg text-[10px] font-bold px-2 py-1 h-auto"
                  >
                    New Arrival
                  </Badge>
                )}
              </div>
            )}

            {/* Featured Badge */}
            {"featured" in product && product.featured && (
              <div className="pointer-events-none absolute right-0 top-0">
                <Badge
                  variant="special"
                  className="rounded-none rounded-bl-lg text-[10px] font-bold px-2 py-1 h-auto gap-0.5"
                >
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Featured
                </Badge>
              </div>
            )}

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
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

            {/* Quick View — explicit modal control; the card's primary area
                now navigates to the PDP, so quick-view gets its own affordance */}
            {onOpenItemDetails && navPath && (
              <button
                type="button"
                onClick={handleQuickView}
                className="absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-all hover:bg-background hover:scale-110"
                aria-label={`Quick view ${product.name}`}
              >
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}

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
                    disabled={isAdding}
                    aria-label={isAdding ? `Adding ${product.name} to cart` : `Add ${product.name} to cart`}
                    // Culinary glass quick-add disk, 44x44 (Phase 4).
                    // Add/stepper state machine unchanged.
                    className="btn-glass btn-culinary-icon flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-70"
                  >
                    {isAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
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

              {/* Name — stretched link: the text is the semantic link and its
                  ::after covers the whole card, so image/body clicks navigate
                  to the canonical PDP while action buttons stay above it */}
              <h3 className="line-clamp-2 text-[13px] lg:text-lg font-semibold leading-tight lg:leading-snug group-hover:text-culinary-primary transition-colors font-culinary-heading">
                {navPath ? (
                  <Link
                    to={navPath}
                    onClick={(e) => e.stopPropagation()}
                    className="text-inherit after:absolute after:inset-0 after:content-['']"
                  >
                    {product.name}
                  </Link>
                ) : (
                  product.name
                )}
              </h3>
            </div>

            {/* Description — list mode (existing) */}
            {showDescription && "description" in product && product.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {product.description}
              </p>
            )}

            {/* Description — desktop grid (Phase 4C, data-driven only) */}
            {!showDescription && "description" in product && product.description && (
              <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground lg:line-clamp-2">
                {product.description}
              </p>
            )}

            {/* Price + Rating row — separated Stitch-style price row */}
            <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border/40 pt-2.5 lg:mt-3 lg:pt-3">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] lg:text-xl font-bold tracking-tight text-foreground font-culinary-heading">
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
                {/* Savings — derived display from existing price data only */}
                {compareAtPrice && compareAtPrice > minPrice && (
                  <p className="mt-0.5 hidden text-[11px] font-bold text-emerald-600 lg:block">
                    Save {formatCurrency(compareAtPrice - minPrice)}
                  </p>
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

            {/* Variant strip — mobile hint (existing) + desktop
                Stitch-style strip from existing variant data (Phase 4C).
                No selection logic changed. */}
            {hasVariants && product.variants!.length > 1 && (
              <p className="mt-1 text-[10px] text-muted-foreground lg:hidden">
                {product.variants!.length} options available
              </p>
            )}
            {hasVariants && product.variants!.length > 1 && (
              <div className="mt-2 hidden items-center justify-between gap-2 rounded-lg border border-border/50 bg-secondary/30 px-2 py-1 text-[11px] lg:flex">
                <span className="truncate text-muted-foreground">
                  {inlineDefaultVariantName && inlineDefaultVariantName !== "Default"
                    ? inlineDefaultVariantName
                    : "Multiple variants"}
                </span>
                <span className="shrink-0 font-semibold text-culinary-primary">
                  {product.variants!.length} options
                </span>
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
      {inner}
    </motion.div>
  );
});

/**
 * ProductCardSkeleton — loading placeholder
 */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="overflow-hidden border border-border/50 rounded-3xl">
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
