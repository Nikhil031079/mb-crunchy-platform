import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ShoppingCart,
  ChevronRight,
  ChevronLeft,
  Tag,
  Star,
  ImageOff,
  Clock,
  X,
  ZoomIn,
  Sparkles,
  TrendingUp,
  Bike,
  Store,
  RotateCcw,
  ShieldCheck,
  Leaf,
  BadgeCheck,
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
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useBrowsingPreference } from "@/hooks/use-browsing-preference";

// Customer components
import { QuantitySelector, ProductCard, SectionHeader } from "@/components/customer";
import { FrequentlyBoughtTogetherSection } from "@/components/customer/FrequentlyBoughtTogetherSection";
import { CrossSellSections } from "@/components/customer/CrossSellSections";
import { ReviewSection } from "@/components/customer/ReviewSection";

// Shared components
import { ErrorState } from "@/components/shared/ErrorState";

// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { BusinessUnit, Category, Product, ProductVariant, BusinessUnitSettings, InventoryItem, CatalogItem, ReviewStats } from "@/types";
import { StockBadge, getStockStatus } from "@/components/customer/StockBadge";
import type { StockInfo } from "@/components/customer/StockBadge";

// ============================================================================
// Variant Helpers (client-side, mirrors convex/utils/variantHelper.ts)
// ============================================================================

function getActiveVariants(variants: ProductVariant[]): ProductVariant[] {
  return variants
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getDefaultVariant(variants: ProductVariant[]): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  return active.find((v) => v.isDefault) ?? active[0] ?? variants[0];
}

function getVariantGroups(variants: ProductVariant[]): { groupName: string; options: ProductVariant[] }[] {
  const active = getActiveVariants(variants);
  const groupMap = new Map<string, ProductVariant[]>();
  for (const v of active) {
    const key = v.optionName || "";
    const list = groupMap.get(key) ?? [];
    list.push(v);
    groupMap.set(key, list);
  }
  return Array.from(groupMap.entries())
    .map(([groupName, options]) => ({
      groupName,
      options: options.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((g) => g.groupName !== "" || g.options.length > 1);
}

function getDefaultSelections(variants: ProductVariant[]): Record<string, string> {
  const groups = getVariantGroups(variants);
  const selections: Record<string, string> = {};
  for (const group of groups) {
    const def = group.options.find((o) => o.isDefault) ?? group.options[0];
    if (def) selections[group.groupName] = def.optionValue;
  }
  return selections;
}

function findMatchingVariant(
  variants: ProductVariant[],
  selections: Record<string, string>
): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  for (const v of active) {
    const group = v.optionName;
    const sel = selections[group];
    if (sel !== undefined && sel === v.optionValue) return v;
  }
  return getDefaultVariant(variants);
}

// ============================================================================
// ProductPage
// ============================================================================

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

export default function ProductPage() {
  const { businessUnitSlug, categorySlug, productSlug } = useParams<{
    businessUnitSlug: string;
    categorySlug: string;
    productSlug: string;
  }>();

  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string>>({});

  // Gallery state
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [showZoom, setShowZoom] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const mainImageRef = useRef<HTMLDivElement>(null);

  const { addItem, cart } = useCart();
  const navigate = useNavigate();
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

  const relatedItems = useQuery(
    api.catalogItems.getRelatedByTags,
    product?._id
      ? { catalogItemId: product._id as any, tags: product.tags ?? [], limit: 4 }
      : "skip"
  ) as CatalogItem[] | undefined;

  const trendingItems = useQuery(
    api.catalogItems.getTrending,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any, limit: 4 }
      : "skip"
  ) as CatalogItem[] | undefined;

  const reviewStats = useQuery(
    api.reviews.getStats,
    product?._id
      ? { catalogItemId: product._id as any }
      : "skip"
  ) as ReviewStats | undefined;

  const recommendationIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of relatedItems ?? []) ids.push(item._id);
    for (const item of trendingItems ?? []) ids.push(item._id);
    return Array.from(new Set(ids)) as Id<"catalogItems">[];
  }, [relatedItems, trendingItems]);

  const recRatingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    recommendationIds.length > 0 ? { ids: recommendationIds } : "skip"
  ) as Record<string, { average: number; count: number }> | undefined;

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const buSlug = businessUnit?.slug ?? businessUnitSlug ?? "";
  const catSlug = category?.slug ?? categorySlug ?? "";

  const activeVariants = useMemo(
    () => (product?.variants ? getActiveVariants(product.variants) : []),
    [product?.variants]
  );

  const variantGroups = useMemo(
    () => (product?.variants ? getVariantGroups(product.variants) : []),
    [product?.variants]
  );

  const hasVariants = variantGroups.length > 0;

  // Initialize selections from default variants
  useEffect(() => {
    if (product?.variants && Object.keys(selections).length === 0) {
      setSelections(getDefaultSelections(product.variants));
    }
  }, [product?.variants]);

  const selectedVariant = useMemo(
    () =>
      product?.variants
        ? findMatchingVariant(product.variants, selections) ?? getDefaultVariant(product.variants)
        : undefined,
    [product?.variants, selections]
  );

  // Stock status for selected variant
  const stockInfo: StockInfo | undefined = selectedVariant
    ? getStockStatus(inventoryItems, selectedVariant.optionValue)
    : undefined;
  const isOutOfStock = stockInfo?.status === "out_of_stock";

  const minPrice = activeVariants.length > 0
    ? Math.min(...activeVariants.map((v) => v.price))
    : 0;
  const maxPrice = activeVariants.length > 0
    ? Math.max(...activeVariants.map((v) => v.price))
    : minPrice;

  const compareAtPrice = selectedVariant?.compareAtPrice;
  const discount = compareAtPrice && compareAtPrice > (selectedVariant?.price ?? 0)
    ? calculateDiscount(selectedVariant!.price, compareAtPrice)
    : 0;

  // Variant image selection
  const variantImage = selectedVariant?.image;
  const productCover = product?.coverImage || product?.images?.[0];
  const coverSrc = variantImage || productCover;

  const isItemInCart = cart.items.some(
    (item) => item.catalogItemId === product?._id && item.variantName === selectedVariant?.optionValue
  );

  // Gallery images: variant image first, then product images
  const galleryImages = useMemo(() => {
    if (!product) return [];
    const imgs: string[] = [];
    if (variantImage) imgs.push(variantImage);
    const productImgs = [product.coverImage, ...(product.images ?? [])].filter(
      (img): img is string => !!img && img.length > 0 && img !== variantImage
    );
    imgs.push(...productImgs);
    return [...new Set(imgs)];
  }, [product, variantImage]);

  const selectedImage = galleryImages[selectedImageIndex] ?? galleryImages[0] ?? null;

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSelectionChange = useCallback((groupName: string, value: string) => {
    setSelections((prev) => ({ ...prev, [groupName]: value }));
    setSelectedImageIndex(0);
    setImageLoaded(false);
    setImageError(false);
  }, []);

  const handlePrevImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      prev === 0 ? galleryImages.length - 1 : prev - 1
    );
    setImageLoaded(false);
    setImageError(false);
  }, [galleryImages.length]);

  const handleNextImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      prev === galleryImages.length - 1 ? 0 : prev + 1
    );
    setImageLoaded(false);
    setImageError(false);
  }, [galleryImages.length]);

  const handleThumbnailClick = useCallback((index: number) => {
    setSelectedImageIndex(index);
    setImageLoaded(false);
    setImageError(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!mainImageRef.current) return;
      const rect = mainImageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setZoomPosition({ x, y });
    },
    []
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const minSwipe = 50;
    if (Math.abs(diff) > minSwipe) {
      if (diff > 0) {
        handleNextImage();
      } else {
        handlePrevImage();
      }
    }
  }, [handleNextImage, handlePrevImage]);

  // Preload adjacent images
  useEffect(() => {
    if (galleryImages.length <= 1) return;
    const preloadIndices = [
      (selectedImageIndex + 1) % galleryImages.length,
      (selectedImageIndex - 1 + galleryImages.length) % galleryImages.length,
    ];
    preloadIndices.forEach((idx) => {
      const img = new Image();
      img.src = galleryImages[idx];
    });
  }, [selectedImageIndex, galleryImages]);

  // Reset gallery when product changes
  useEffect(() => {
    setSelectedImageIndex(0);
  }, [productSlug]);

  // Reset selections when product changes
  useEffect(() => {
    if (product?.variants) {
      setSelections(getDefaultSelections(product.variants));
      setQuantity(1);
    }
  }, [productSlug, product?.variants]);

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
        description: `${product.name} (${selectedVariant.optionValue}) is currently unavailable.`,
      });
      return;
    }

    addItem({
      catalogItemId: product._id,
      itemType: "product",
      businessUnitId: businessUnit._id,
      name: product.name,
      variantName: selectedVariant.optionValue,
      quantity,
      unitPrice: selectedVariant.price,
      image: coverSrc,
    });

    toast.success("Added to cart", {
      description: `${product.name} (${selectedVariant.optionValue}) x${quantity}`,
    });
  }, [product, selectedVariant, businessUnit, quantity, addItem, coverSrc, storeIsOpen, nextOpenTime, isOutOfStock]);

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

  // LocalStorage recently-viewed (guest + signed-in) — capped & deduped
  const { recordView } = useRecentlyViewed();
  useEffect(() => {
    if (product && businessUnit) {
      recordView({
        catalogItemId: product._id,
        businessUnitId: businessUnit._id,
        itemType: "product",
        name: product.name,
        slug: product.slug,
        image: product.coverImage ?? product.images?.[0],
        price: product.variants?.[0]?.price ?? 0,
      });
    }
  }, [product, businessUnit, recordView]);

  // Browsing preference (BU personalization on the homepage)
  const { setPreference } = useBrowsingPreference();
  useEffect(() => {
    if (businessUnit?._id) setPreference(businessUnit._id);
  }, [businessUnit?._id, setPreference]);

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
            <div className="aspect-square rounded-xl bg-secondary animate-pulse" />
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
          onRetry={() => navigate(`/${buSlug}${catSlug ? `/${catSlug}` : ""}`)}
        />
      </div>
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const bu = businessUnit!;
  const prod = product!;

  // Badge detection via tag conventions
  const normalizedTags = (prod.tags ?? []).map((t) => t.toLowerCase().replace(/[\s_]+/g, "-"));
  const isBestSeller = normalizedTags.some((t) =>
    ["best-seller", "bestseller", "bestsellers", "top-rated", "popular"].includes(t)
  );
  const isNewArrival = normalizedTags.some((t) =>
    ["new", "new-arrival", "newly-added", "just-in"].includes(t)
  );

  const vegNonVeg = prod.vegNonVeg === "non-veg" ? "nonveg" : prod.vegNonVeg === "veg" ? "veg" : undefined;
  const hasReviewStats = reviewStats !== undefined;

  // Delivery / service info (from BU settings)
  const deliveryFee = buSettings?.deliveryFee ?? 0;
  const freeDeliveryThreshold = buSettings?.freeDeliveryThreshold;

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
          {/* PRODUCT IMAGE GALLERY                                           */}
          {/* ================================================================ */}

          <div className="flex flex-col-reverse gap-3 lg:flex-row lg:gap-4">
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-auto lg:overflow-y-auto lg:pb-0 lg:min-w-[72px]">
                {galleryImages.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => handleThumbnailClick(i)}
                    className={cn(
                      "relative shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                      "h-16 w-16 lg:h-[72px] lg:w-[72px]",
                      selectedImageIndex === i
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img
                      src={img}
                      alt={`${prod.name} thumbnail ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex-1">
              <div
                ref={mainImageRef}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-2xl bg-secondary cursor-crosshair",
                  galleryImages.length <= 1 && "cursor-default"
                )}
                onClick={() => setFullscreenOpen(true)}
                onMouseEnter={() => galleryImages.length > 0 && setShowZoom(true)}
                onMouseLeave={() => setShowZoom(false)}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                role="button"
                tabIndex={0}
                aria-label="View fullscreen"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFullscreenOpen(true);
                  }
                }}
              >
                {selectedImage && !imageError ? (
                  <>
                    {!imageLoaded && (
                      <div className="absolute inset-0 animate-pulse bg-secondary" />
                    )}
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={selectedImage}
                        src={selectedImage}
                        alt={prod.name}
                        className="h-full w-full object-cover"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: imageLoaded ? 1 : 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        draggable={false}
                      />
                    </AnimatePresence>

                    {showZoom && imageLoaded && (
                      <div
                        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
                        style={{
                          backgroundImage: `url(${selectedImage})`,
                          backgroundSize: "250%",
                          backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                          opacity: 0.9,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageOff className="h-16 w-16 text-muted-foreground/30" />
                  </div>
                )}

                {discount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute left-4 top-4 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 pointer-events-none"
                  >
                    -{discount}%
                  </Badge>
                )}

                {prod.featured && (
                  <Badge
                    variant="secondary"
                    className="absolute right-4 top-4 gap-1 bg-background/80 backdrop-blur-sm text-xs pointer-events-none"
                  >
                    <Star className="h-3 w-3 fill-accent text-accent" />
                    Featured
                  </Badge>
                )}

                {showZoom && imageLoaded && !imageError && (
                  <div className="absolute bottom-3 right-3 rounded-full bg-background/70 p-1.5 backdrop-blur-sm pointer-events-none">
                    <ZoomIn className="h-4 w-4 text-foreground/70" />
                  </div>
                )}
              </div>

              {galleryImages.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-md hover:bg-background/95"
                    onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-md hover:bg-background/95"
                    onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {galleryImages.length > 1 && (
                <div className="absolute bottom-3 left-3 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                  {selectedImageIndex + 1} / {galleryImages.length}
                </div>
              )}
            </div>
          </div>

          {/* ================================================================ */}
          {/* FULLSCREEN VIEWER                                                */}
          {/* ================================================================ */}

          <AnimatePresence>
            {fullscreenOpen && selectedImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
                onClick={() => setFullscreenOpen(false)}
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                  onClick={() => setFullscreenOpen(false)}
                  aria-label="Close fullscreen"
                >
                  <X className="h-5 w-5" />
                </Button>

                {galleryImages.length > 1 && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {selectedImageIndex + 1} / {galleryImages.length}
                  </div>
                )}

                {galleryImages.length > 1 && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                    onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                )}

                <motion.img
                  key={`fs-${selectedImage}`}
                  src={selectedImage}
                  alt={prod.name}
                  className="max-h-[85vh] max-w-[90vw] object-contain select-none"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={(e) => e.stopPropagation()}
                  draggable={false}
                />

                {galleryImages.length > 1 && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                    onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                )}

                {galleryImages.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-full bg-white/10 p-2 backdrop-blur-sm">
                    {galleryImages.map((img, i) => (
                      <button
                        key={`fs-thumb-${i}`}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleThumbnailClick(i); }}
                        className={cn(
                          "h-10 w-10 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                          selectedImageIndex === i
                            ? "border-white"
                            : "border-transparent opacity-60 hover:opacity-100"
                        )}
                      >
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================================================================ */}
          {/* PRODUCT DETAILS                                                 */}
          {/* ================================================================ */}

          <div className="flex flex-col">
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

            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {prod.name}
            </h1>

            {/* Rating + Veg/Non-veg + badges row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasReviewStats && (
                reviewStats!.count > 0 ? (
                  <button
                    type="button"
                    onClick={() => document.getElementById("reviews-section")?.scrollIntoView({ behavior: "smooth" })}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Rated ${reviewStats!.average.toFixed(1)} out of 5 from ${reviewStats!.count} reviews. Scroll to reviews.`}
                  >
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            "h-3.5 w-3.5",
                            star <= Math.round(reviewStats!.average)
                              ? "fill-amber-400 text-amber-400"
                              : "fill-transparent text-muted-foreground/30"
                          )}
                        />
                      ))}
                    </span>
                    <span className="font-semibold text-foreground">{reviewStats!.average.toFixed(1)}</span>
                    <span>({reviewStats!.count})</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5 fill-transparent text-muted-foreground/30" />
                    No reviews yet
                  </span>
                )
              )}

              {vegNonVeg && (
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border-2 p-[2px]",
                      vegNonVeg === "veg" ? "border-green-600" : "border-red-600"
                    )}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "h-full w-full rounded-full",
                        vegNonVeg === "veg" ? "bg-green-600" : "bg-red-600"
                      )}
                    />
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Leaf className="h-3 w-3 text-emerald-600 dark:text-emerald-500" />
                    {vegNonVeg === "veg" ? "Vegetarian" : "Non-Vegetarian"}
                  </span>
                </span>
              )}

              {isBestSeller && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <BadgeCheck className="h-3 w-3" />
                  Best Seller
                </span>
              )}
              {isNewArrival && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-3 w-3" />
                  New Arrival
                </span>
              )}
            </div>

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

            {/* ============================================================ */}
            {/* VARIANT SELECTORS — renders one dropdown per option group     */}
            {/* ============================================================ */}

            {hasVariants && variantGroups.map((group) => (
              <div key={group.groupName} className="mt-6 space-y-2">
                <label className="text-sm font-medium">{group.groupName}</label>
                <Select
                  value={selections[group.groupName] ?? group.options[0]?.optionValue}
                  onValueChange={(val) => handleSelectionChange(group.groupName, val)}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {group.options.map((opt) => {
                      const optStock = getStockStatus(inventoryItems, opt.optionValue);
                      const optDisabled = !opt.active || optStock.status === "out_of_stock";
                      return (
                        <SelectItem key={opt.optionValue} value={opt.optionValue} disabled={optDisabled}>
                          <span className="flex items-center gap-2">
                            <span>{opt.optionValue}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(opt.price)}
                            </span>
                            {!opt.active && (
                              <Badge variant="outline" className="text-[10px]">Unavailable</Badge>
                            )}
                            {opt.active && optStock.status === "out_of_stock" && (
                              <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {/* Single variant label — backward compatible */}
            {!hasVariants && activeVariants.length === 1 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  {activeVariants[0].optionValue === "Default" ? "" : activeVariants[0].optionValue}
                </p>
              </div>
            )}

            {/* Quantity + Add to Cart */}
            <div className="mt-8 space-y-4">
              {stockInfo && stockInfo.status !== "unknown" && (
                <StockBadge stockInfo={stockInfo} />
              )}

              {stockInfo?.status === "low_stock" && stockInfo.quantity !== undefined && (
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Only {stockInfo.quantity} left — order soon!
                </p>
              )}
              {stockInfo?.status === "in_stock" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ In Stock
                </p>
              )}

              <div className="flex items-center gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quantity</label>
                  <QuantitySelector
                    value={quantity}
                    onChange={setQuantity}
                    min={selectedVariant?.minOrderQty ?? 1}
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

            {/* Key Details */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {category && catSlug && (
                <DetailFact label="Category" value={category.name} />
              )}
              {prod.unit && <DetailFact label="Unit" value={prod.unit} />}
              {prod.sku && <DetailFact label="SKU" value={prod.sku} />}
              {selectedVariant?.barcode && (
                <DetailFact label="Barcode" value={selectedVariant.barcode} />
              )}
              {selectedVariant?.sku && <DetailFact label="Variant SKU" value={selectedVariant.sku} />}
              {prod.taxPercentage !== undefined && (
                <DetailFact label="Tax" value={`${prod.taxPercentage}%`} />
              )}
              {prod.tags.length > 0 && (
                <DetailFact label="Tags" value={prod.tags.slice(0, 4).join(", ")} />
              )}
            </div>
          </div>
        </motion.div>

        {/* ================================================================ */}
        {/* DELIVERY + RETURNS INFO                                          */}
        {/* ================================================================ */}

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Bike className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Delivery</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {deliveryFee > 0
                    ? `Delivery fee ${formatCurrency(deliveryFee)}${freeDeliveryThreshold ? ` — free above ${formatCurrency(freeDeliveryThreshold)}` : ""}`
                    : "Delivery available near you"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                <Store className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Pickup</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Order online &amp; pick up from {bu.name}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <RotateCcw className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Easy Returns</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Returns within 7 days on non-perishable items
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Quality Promise</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Fresh, quality-checked items every order
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RETURN POLICY                                                    */}
        {/* ================================================================ */}

        <div className="mt-6 rounded-xl border border-border/60 bg-secondary/20 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Return Policy
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Damaged or incorrect items can be reported within 48 hours of delivery for a free replacement.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Perishable food items must be inspected at the time of delivery.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Refunds for approved returns are processed within 3–5 business days.
            </li>
          </ul>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FREQUENTLY BOUGHT TOGETHER + CROSS-SELL                            */}
      {/* ================================================================== */}

      {product && businessUnit && (
        <>
          <FrequentlyBoughtTogetherSection
            catalogItemId={product._id}
            businessUnitId={businessUnit._id}
            businessUnits={[businessUnit]}
            productName={product.name}
          />
          <CrossSellSections
            businessUnit={businessUnit}
            excludeIds={[product._id as Id<"catalogItems">]}
          />
        </>
      )}

      {/* ================================================================== */}
      {/* REVIEWS SECTION                                                    */}
      {/* ================================================================== */}

      <div id="reviews-section" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-12 sm:px-6 lg:px-8">
        <ReviewSection
          catalogItemId={prod._id}
          businessUnitId={bu._id}
        />
      </div>

      {/* ================================================================== */}
      {/* RECOMMENDATIONS                                                    */}
      {/* ================================================================== */}

      {((relatedItems && relatedItems.length > 0) ||
        (trendingItems && trendingItems.length > 0)) && (
        <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="space-y-10">
            {relatedItems && relatedItems.length > 0 && (
              <section>
                <SectionHeader
                  title="Related Products"
                  subtitle="You might also like these"
                />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
                  {relatedItems.map((item) => (
                    <ProductCard
                      key={item._id}
                      product={item}
                      businessUnitSlug={buSlug}
                      index={0}
                      compact
                      rating={recRatingsMap?.[item._id]}
                    />
                  ))}
                </div>
              </section>
            )}

            {trendingItems && trendingItems.length > 0 && (
              <section>
                <SectionHeader
                  title="Trending Now"
                  subtitle="Popular in your area this week"
                />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
                  {trendingItems.map((item) => (
                    <ProductCard
                      key={item._id}
                      product={item}
                      businessUnitSlug={buSlug}
                      index={0}
                      compact
                      rating={recRatingsMap?.[item._id]}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STICKY MOBILE ADD-TO-CART BAR                                      */}
      {/* ================================================================== */}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{prod.name}</p>
            <p className="text-sm font-bold">
              {formatCurrency((selectedVariant?.price ?? minPrice) * quantity)}
              {compareAtPrice && compareAtPrice > (selectedVariant?.price ?? 0) && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                  {formatCurrency(compareAtPrice)}
                </span>
              )}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleAddToCart}
            disabled={!selectedVariant || !storeIsOpen || isOutOfStock}
            className="h-11 shrink-0 gap-2 px-6"
          >
            <ShoppingCart className="h-4 w-4" />
            {!storeIsOpen
              ? "Store Closed"
              : isOutOfStock
                ? "Out of Stock"
                : isItemInCart
                  ? "Add More"
                  : "Add to Cart"}
          </Button>
        </div>
      </div>

      {/* Spacer so the sticky bar never covers content on mobile */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </div>
  );
}
