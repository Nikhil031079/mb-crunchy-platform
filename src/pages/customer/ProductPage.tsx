import { useState, useCallback, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ShoppingCart,
  ChevronRight,
  Tag,
  Star,
  ImageOff,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";

// Hooks
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

// Customer components
import { QuantitySelector } from "@/components/customer";

// Shared components
import { ErrorState } from "@/components/shared/ErrorState";

// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { BusinessUnit, Category, Product, BusinessUnitSettings, InventoryItem } from "@/types";
import { StockBadge, getStockStatus } from "@/components/customer/StockBadge";
import type { StockInfo } from "@/components/customer/StockBadge";

// ============================================================================
// ProductPage — Slug-driven product detail page with variant selection + cart
// ============================================================================

export default function ProductPage() {
  const { businessUnitSlug, categorySlug, productSlug } = useParams<{
    businessUnitSlug: string;
    categorySlug: string;
    productSlug: string;
  }>();

  // ==========================================================================
  // State
  // ==========================================================================

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Cart
  const { addItem, cart } = useCart();

  // Auth + Recently Viewed
  const { user } = useAuth();
  const customer = useQuery(api.customers.getByAuthUser, {});
  const recordRecentlyViewed = useMutation(api.collections.recordRecentlyViewed);

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  const businessUnit = useQuery(api.businessUnits.getBySlug, {
    slug: businessUnitSlug ?? "",
  }) as BusinessUnit | null | undefined;

  const isBuLoading = businessUnit === undefined;
  const isBuNotFound = businessUnit === null;

  const category = useQuery(
    api.categories.getBySlug,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any, slug: categorySlug ?? "" }
      : "skip"
  ) as Category | null | undefined;

  const product = useQuery(
    api.products.getBySlug,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any, slug: productSlug ?? "" }
      : "skip"
  ) as Product | null | undefined;

  const isProductLoading = product === undefined;
  const isProductNotFound = product === null && !isBuLoading;

  const buSettings = useQuery(api.settings.getBusinessUnitSettings, {
    businessUnitId: businessUnit?._id ?? ("" as any),
  }) as BusinessUnitSettings | null | undefined;

  const inventoryItems = useQuery(
    api.inventory.getByCatalogItem,
    product?._id ? { catalogItemId: product._id as any } : "skip"
  ) as InventoryItem[] | undefined;

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const buSlug = businessUnit?.slug ?? businessUnitSlug ?? "";
  const catSlug = category?.slug ?? categorySlug ?? "";

  const selectedVariant = product?.variants?.[selectedVariantIndex];
  const hasVariants = product?.variants && product.variants.length > 0;

  // Stock status for selected variant
  const stockInfo: StockInfo | undefined = selectedVariant
    ? getStockStatus(inventoryItems, selectedVariant.name)
    : undefined;
  const isOutOfStock = stockInfo?.status === "out_of_stock";

  const minPrice = hasVariants
    ? Math.min(...product.variants!.map((v) => v.price))
    : 0;
  const maxPrice = hasVariants
    ? Math.max(...product.variants!.map((v) => v.price))
    : minPrice;

  const compareAtPrice = selectedVariant?.compareAtPrice;
  const discount = compareAtPrice && compareAtPrice > (selectedVariant?.price ?? 0)
    ? calculateDiscount(selectedVariant!.price, compareAtPrice)
    : 0;

  const coverSrc = product?.coverImage || product?.images?.[0];
  const isItemInCart = cart.items.some(
    (item) => item.catalogItemId === product?._id && item.variantName === selectedVariant?.name
  );

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleAddToCart = useCallback(() => {
    if (!product || !selectedVariant || !businessUnit) return;
    if (!storeIsOpen) {
      toast.error("Store is currently closed", {
        description: nextOpenTime
          ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
          : "Please try again during business hours.",
      });
      return;
    }
    if (isOutOfStock) {
      toast.error("Item is out of stock", {
        description: `${product.name} (${selectedVariant.name}) is currently unavailable.`,
      });
      return;
    }

    addItem({
      catalogItemId: product._id,
      itemType: "product",
      businessUnitId: businessUnit._id,
      name: product.name,
      variantName: selectedVariant.name,
      quantity,
      unitPrice: selectedVariant.price,
      image: coverSrc,
    });

    toast.success("Added to cart", {
      description: `${product.name} (${selectedVariant.name}) x${quantity}`,
    });
  }, [product, selectedVariant, businessUnit, quantity, addItem, coverSrc, storeIsOpen, nextOpenTime, isOutOfStock]);

  // Reset variant selection when product changes
  useEffect(() => {
    setSelectedVariantIndex(0);
    setQuantity(1);
    setImageLoaded(false);
    setImageError(false);
  }, [productSlug]);

  // Record recently viewed
  useEffect(() => {
    if (customer?._id && product?._id) {
      recordRecentlyViewed({
        customerId: customer._id as Id<"customers">,
        itemType: "product",
        itemId: product._id as Id<"catalogItems">,
      }).catch(() => {});
    }
  }, [customer?._id, product?._id, recordRecentlyViewed]);

  // ==========================================================================
  // Page Title
  // ==========================================================================

  useEffect(() => {
    if (businessUnit && product) {
      document.title = `${product.name} | ${businessUnit.name} | ${SITE_NAME}`;
    }
  }, [businessUnit, product]);

  // ==========================================================================
  // Loading State
  // ==========================================================================

  if (isBuLoading || isProductLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            {/* Image skeleton */}
            <div className="aspect-square rounded-xl bg-secondary animate-pulse" />
            {/* Details skeleton */}
            <div className="space-y-6">
              <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
              <div className="h-8 w-64 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
              <div className="h-10 w-32 animate-pulse rounded bg-secondary" />
              <div className="space-y-3">
                <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-secondary" />
                  ))}
                </div>
              </div>
              <div className="h-12 w-full animate-pulse rounded-lg bg-secondary" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Not Found States
  // ==========================================================================

  if (isBuNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Business Unit Not Found"
          message={`The business unit "${businessUnitSlug}" doesn't exist or has been archived.`}
        />
      </div>
    );
  }

  if (isProductNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Product Not Found"
          message={`The product "${productSlug}" doesn't exist in ${businessUnit?.name ?? "this business unit"}.`}
          onRetry={() => window.location.href = `/${buSlug}${catSlug ? `/${catSlug}` : ""}`}
        />
      </div>
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const bu = businessUnit!;
  const prod = product!;

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================== */}
      {/* BREADCRUMBS                                                        */}
      {/* ================================================================== */}

      <div className="border-b border-border/40 bg-secondary/30 py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link to={`/${buSlug}`} className="transition-colors hover:text-foreground">
              {bu.name}
            </Link>
            {catSlug && (
              <>
                <ChevronRight className="h-3 w-3" />
                <Link
                  to={`/${buSlug}/${catSlug}`}
                  className="transition-colors hover:text-foreground"
                >
                  {category?.name ?? "Category"}
                </Link>
              </>
            )}
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{prod.name}</span>
          </nav>
        </div>
      </div>

      {/* ================================================================== */}
      {/* PRODUCT DETAIL                                                     */}
      {/* ================================================================== */}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid gap-10 lg:grid-cols-[1fr_1fr]"
        >
          {/* ================================================================ */}
          {/* PRODUCT IMAGE                                                   */}
          {/* ================================================================ */}

          <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
            {coverSrc && !imageError ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-secondary" />
                )}
                <img
                  src={coverSrc}
                  alt={prod.name}
                  className={cn(
                    "h-full w-full object-cover transition-opacity duration-500",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}

            {/* Discount Badge */}
            {discount > 0 && (
              <Badge
                variant="default"
                className="absolute left-4 top-4 bg-accent text-accent-foreground text-xs font-bold px-2 py-1"
              >
                -{discount}%
              </Badge>
            )}

            {/* Featured Badge */}
            {prod.featured && (
              <Badge
                variant="secondary"
                className="absolute right-4 top-4 gap-1 bg-background/80 backdrop-blur-sm text-xs"
              >
                <Star className="h-3 w-3 fill-accent text-accent" />
                Featured
              </Badge>
            )}
          </div>

          {/* ================================================================ */}
          {/* PRODUCT DETAILS                                                 */}
          {/* ================================================================ */}

          <div className="flex flex-col">
            {/* Tags */}
            {prod.tags && prod.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {prod.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Name */}
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {prod.name}
            </h1>

            {/* Description */}
            {prod.description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {prod.description}
              </p>
            )}

            <Separator className="my-6" />

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">
                {formatCurrency(selectedVariant?.price ?? minPrice)}
              </span>
              {hasVariants && maxPrice > minPrice && (
                <span className="text-sm text-muted-foreground">
                  – {formatCurrency(maxPrice)}
                </span>
              )}
              {compareAtPrice && compareAtPrice > (selectedVariant?.price ?? 0) && (
                <span className="text-lg text-muted-foreground line-through">
                  {formatCurrency(compareAtPrice)}
                </span>
              )}
            </div>

            {/* Variants */}
            {hasVariants && prod.variants!.length > 1 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium">Size / Variant</h3>
                <RadioGroup
                  value={String(selectedVariantIndex)}
                  onValueChange={(val) => {
                    setSelectedVariantIndex(Number(val));
                    setQuantity(1);
                  }}
                  className="flex flex-wrap gap-2"
                >
                  {prod.variants!.map((variant, i) => (
                    <label
                      key={variant.name}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-all",
                        selectedVariantIndex === i
                          ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                          : "border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-secondary/50"
                      )}
                    >
                      <RadioGroupItem
                        value={String(i)}
                        className="sr-only"
                      />
                      <span className="font-medium">{variant.name}</span>
                      <span className="text-xs">
                        {formatCurrency(variant.price)}
                      </span>
                      {variant.compareAtPrice && variant.compareAtPrice > variant.price && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          {formatCurrency(variant.compareAtPrice)}
                        </span>
                      )}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Single variant label */}
            {hasVariants && prod.variants!.length === 1 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  {prod.variants![0].name}
                </p>
              </div>
            )}

            {/* Quantity + Add to Cart */}
            <div className="mt-8 space-y-4">
              {/* Stock Status */}
              {stockInfo && stockInfo.status !== "unknown" && (
                <StockBadge stockInfo={stockInfo} />
              )}

              <div className="flex items-center gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quantity</label>
                  <QuantitySelector
                    value={quantity}
                    onChange={setQuantity}
                    min={1}
                    max={99}
                  />
                </div>
              </div>

              <Button
                size="lg"
                onClick={handleAddToCart}
                className="w-full gap-2"
                disabled={!selectedVariant || !storeIsOpen || isOutOfStock}
              >
                <ShoppingCart className="h-4 w-4" />
                {!storeIsOpen
                  ? "Store is Closed"
                  : isOutOfStock
                  ? "Out of Stock"
                  : isItemInCart
                  ? "Add More to Cart"
                  : "Add to Cart"}
                {storeIsOpen && !isOutOfStock && selectedVariant && (
                  <span className="ml-1 text-sm opacity-80">
                    — {formatCurrency(selectedVariant.price * quantity)}
                  </span>
                )}
              </Button>

              {isOutOfStock && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  <span>This variant is currently out of stock. Please select a different option or check back later.</span>
                </div>
              )}

              {!storeIsOpen && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    {nextOpenTime
                      ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}`
                      : "Ordering is temporarily unavailable"}
                  </span>
                </div>
              )}

              {isItemInCart && (
                <p className="text-center text-xs text-muted-foreground">
                  This item is already in your cart
                </p>
              )}
            </div>

            {/* Business Unit Link */}
            <div className="mt-8 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <div className="flex items-center gap-3">
                {bu.logo ? (
                  <img
                    src={bu.logo}
                    alt={bu.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold"
                    style={{ backgroundColor: bu.themeColor || "#000" }}
                  >
                    {bu.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{bu.name}</p>
                  <p className="text-xs text-muted-foreground">Browse more items</p>
                </div>
                <Link to={`/${buSlug}`}>
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    View All
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
