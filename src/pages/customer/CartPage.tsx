import { useCallback, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  ImageOff,
  Truck,
  Sparkles,
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { filterCatalogItemIds, formatCurrency } from "@/utils";

// Hooks
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { QuantitySelector } from "@/components/customer";
import { ProductCard, ProductCardSkeleton } from "@/components/customer";
import { FrequentlyBoughtTogetherSection } from "@/components/customer/FrequentlyBoughtTogetherSection";
import { RecentlyViewedSection } from "@/components/customer/RecentlyViewedSection";

// Shared components
import { EmptyState } from "@/components/shared/EmptyState";

// UI components
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import type { BusinessUnit, DeliveryZone, BusinessUnitSettings, CatalogItem } from "@/types";
import type { CardProduct } from "@/components/customer/ProductCard";

// ============================================================================
// CartPage — Enhanced with free delivery progress, savings, recommendations
// ============================================================================

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeItem, clearCart, itemCount, addItem, dismissNotice } = useCart();
  const addToCartHook = useAddToCart();

  // Wrapper to convert CatalogItem to the format expected by addItem
  const addToCart = useCallback(async (product: CatalogItem) => {
    // CatalogItem has price directly, no variants array
    await addItem({
      catalogItemId: product._id,
      itemType: "product",
      businessUnitId: product.businessUnitId,
      name: product.name,
      variantName: "Default",
      quantity: 1,
      unitPrice: product.price ?? 0,
      image: product.coverImage || product.thumbnail,
    });
  }, [addItem]);

  // Page title
  useEffect(() => {
    document.title = `Cart${itemCount > 0 ? ` (${itemCount})` : ""} | ${SITE_NAME}`;
  }, [itemCount]);

  // Fetch BU settings for free delivery threshold
  // Use first item's businessUnitId as fallback when businessUnitIds is empty
  const primaryBusinessUnitId = useMemo(() => {
    if (cart.businessUnitIds.length > 0) return cart.businessUnitIds[0];
    if (cart.items.length > 0) return cart.items[0].businessUnitId;
    return null;
  }, [cart.businessUnitIds, cart.items]);

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    primaryBusinessUnitId
      ? { businessUnitId: primaryBusinessUnitId as any }
      : "skip",
  ) as BusinessUnitSettings | null | undefined;

  const deliveryZones = useQuery(
    api.deliveryZones.getActive,
    primaryBusinessUnitId
      ? { businessUnitId: primaryBusinessUnitId as any }
      : "skip",
  ) as DeliveryZone[] | undefined;

  // Active business units — used to link cross-sell cards back to their stores
  const activeBUs = useQuery(api.businessUnits.getActive) as
    | BusinessUnit[]
    | undefined;

  // Fetch recommended products for the current BU, excluding items already in cart
  const cartItemIds = useMemo(
    () => filterCatalogItemIds(cart.items.map((item) => item.catalogItemId)),
    [cart.items],
  );
  const recommendedItems = useQuery(
    api.catalogItems.getRecommended,
    primaryBusinessUnitId
      ? { businessUnitId: primaryBusinessUnitId as any, excludeIds: cartItemIds as any, limit: 6 }
      : "skip",
  );

  // Free delivery threshold — check zone first, fall back to BU settings
  const freeDeliveryThreshold = useMemo(() => {
    const zoneThreshold = deliveryZones?.[0]?.freeDeliveryThreshold;
    const buThreshold = buSettings?.freeDeliveryThreshold;
    return zoneThreshold ?? buThreshold ?? null;
  }, [deliveryZones, buSettings]);

  const freeDeliveryProgress = useMemo(() => {
    if (!freeDeliveryThreshold) return null;
    const progress = Math.min(100, (cart.subtotal / freeDeliveryThreshold) * 100);
    const remaining = Math.max(0, freeDeliveryThreshold - cart.subtotal);
    return { progress, remaining, reached: remaining <= 0 };
  }, [freeDeliveryThreshold, cart.subtotal]);

  // Calculate total savings from compare-at-price
  const savingsInfo = useMemo(() => {
    let totalSaved = 0;
    for (const item of cart.items) {
      if (item.unitPrice > 0 && "compareAtPrice" in item) {
        const cmp = (item as any).compareAtPrice as number | undefined;
        if (cmp && cmp > item.unitPrice) {
          totalSaved += (cmp - item.unitPrice) * item.quantity;
        }
      }
    }
    return totalSaved;
  }, [cart.items]);

  // ==========================================================================
  // Empty Cart
  // ==========================================================================

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <EmptyState
            title="Your cart is empty"
            description="Browse our stores and add some delicious items to your cart."
            icon={ShoppingCart}
            action={
              <Link to="/">
                <Button size="sm" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Browse Stores
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Cart with items
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shopping Cart</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {itemCount} item{itemCount !== 1 ? "s" : ""} in your cart
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear Cart
          </Button>
        </motion.div>

        {/* ================================================================ */}
        {/* FREE DELIVERY PROGRESS BAR                                      */}
        {/* ================================================================ */}
        {freeDeliveryProgress && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className={cn(
              "mb-6 rounded-xl border p-4",
              freeDeliveryProgress.reached
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-border/60 bg-card"
            )}
          >
            <div className="flex items-center gap-3 mb-2.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  freeDeliveryProgress.reached
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40"
                    : "bg-primary/10 text-primary"
                )}
              >
                {freeDeliveryProgress.reached ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Truck className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1">
                {freeDeliveryProgress.reached ? (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    You&apos;ve unlocked free delivery!
                  </p>
                ) : (
                  <p className="text-sm font-medium">
                    Add{" "}
                    <span className="text-primary font-semibold">
                      {formatCurrency(freeDeliveryProgress.remaining)}
                    </span>{" "}
                    more for free delivery
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatCurrency(freeDeliveryThreshold!)}
              </span>
            </div>
            <Progress
              value={freeDeliveryProgress.progress}
              className={cn(
                "h-2",
                freeDeliveryProgress.reached && "[&>div]:bg-emerald-500"
              )}
            />
          </motion.div>
        )}

        {/* One-time notice: stale cart references were removed on load */}
        {cart.notice?.type === "items_removed" && cart.notice.itemNames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Some items in your cart are no longer available
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                {cart.notice.itemNames.join(", ")}{" "}
                {cart.notice.itemNames.length === 1 ? "was" : "were"} removed because{" "}
                {cart.notice.itemNames.length === 1 ? "it is" : "they are"} no longer
                available.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissNotice}
              aria-label="Dismiss notice"
              className="h-8 w-8 shrink-0 p-0 text-amber-700 hover:text-amber-900"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* ================================================================ */}
          {/* CART ITEMS                                                      */}
          {/* ================================================================ */}

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {cart.items.map((item) => {
                const itemKey = `${item.catalogItemId}-${item.variantName}`;
                return (
                  <motion.div
                    key={itemKey}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    className="flex gap-4 rounded-xl border border-border/60 bg-card p-4"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageOff className="h-5 w-5 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Qty badge on image */}
                      <span className="absolute -bottom-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {item.quantity}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate">
                          {item.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.variantName}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <p className="text-sm font-semibold">
                            {formatCurrency(item.unitPrice)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            &times; {item.quantity}
                          </p>
                        </div>
                      </div>

                      {/* Quantity + Remove */}
                      <div className="flex flex-col items-end justify-between ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.catalogItemId, item.variantName)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <QuantitySelector
                          value={item.quantity}
                          onChange={(qty) =>
                            updateQuantity(item.catalogItemId, item.variantName, qty)
                          }
                          min={1}
                          max={99}
                          size="sm"
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Continue Shopping */}
            <div className="pt-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>

          {/* ================================================================ */}
          {/* ORDER SUMMARY                                                   */}
          {/* ================================================================ */}

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
              <h2 className="font-semibold">Order Summary</h2>

              <Separator />

              {/* Line items summary */}
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {cart.items.map((item) => (
                  <div
                    key={`${item.catalogItemId}-${item.variantName}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-muted-foreground mr-2">
                      {item.name} ({item.variantName}) &times;{item.quantity}
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Savings Banner */}
              {savingsInfo > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                  <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    You&apos;re saving {formatCurrency(savingsInfo)} on this order!
                  </p>
                </div>
              )}

              {/* Totals */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(cart.subtotal)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(cart.discount)}</span>
                  </div>
                )}
                {cart.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span className="font-medium">{formatCurrency(cart.deliveryFee)}</span>
                  </div>
                )}
                {freeDeliveryProgress?.reached && (
                  <div className="flex justify-between text-emerald-600">
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      Free Delivery
                    </span>
                    <span className="font-medium line-through text-muted-foreground">
                      {formatCurrency(buSettings?.deliveryFee ?? 0)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Estimated delivery: 30-45 minutes</span>
                </div>
                {cart.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">{formatCurrency(cart.tax)}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(cart.total)}</span>
              </div>

              {/* Checkout CTA */}
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => navigate(ROUTES.CHECKOUT)}
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-[10px] text-muted-foreground">
                Tax and delivery fees calculated at checkout
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RECOMMENDED PRODUCTS                                            */}
        {/* ================================================================ */}
        {recommendedItems === undefined && cart.businessUnitIds[0] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mt-12"
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground/40" />
              <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} compact />
              ))}
            </div>
          </motion.div>
        )}
        {recommendedItems && recommendedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-12"
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">You might also like</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {recommendedItems.slice(0, 6).map((item) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  compact
                  onAddToCart={addToCart as (product: CatalogItem | CardProduct) => void}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ================================================================ */}
      {/* CROSS-SELL — Frequently Bought Together + Recently Viewed        */}
      {/* ================================================================ */}

      {cart.businessUnitIds[0] && cart.items[0] && (
        <FrequentlyBoughtTogetherSection
          catalogItemId={cart.items[0].catalogItemId}
          businessUnitId={cart.businessUnitIds[0]}
          businessUnits={activeBUs ?? []}
          productName={cart.items[0].name}
        />
      )}
      <RecentlyViewedSection businessUnits={activeBUs ?? []} />
    </div>
  );
}
