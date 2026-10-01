import { useCallback, useEffect, useMemo, useState } from "react";
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
  UtensilsCrossed,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { filterCatalogItemIds, formatCurrency, checkKitchenServiceability } from "@/utils";
import { getActiveVariants } from "@/utils/product-variants";

// Hooks
import { useCart, setActiveDeals } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";
import { useProductCategorySlugs, useBusinessUnitSlugById } from "@/hooks/use-product-routes";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCartMealDealDetection, useMealDeals } from "@/hooks/use-meal-deals";
import { useLocationStore } from "@/stores/location";
import { QuantitySelector, CartVariantEditor } from "@/components/customer";
import { ProductCard, ProductCardSkeleton } from "@/components/customer";
import { FrequentlyBoughtTogetherSection } from "@/components/customer/FrequentlyBoughtTogetherSection";
import { RecentlyViewedSection } from "@/components/customer/RecentlyViewedSection";
import { MealDealVariantDialog } from "@/components/customer/MealDealVariantDialog";

// Shared components
import { EmptyState } from "@/components/shared/EmptyState";

// UI components
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import type { BusinessUnit, DeliveryPolicy, BusinessUnitSettings, CartItem, CatalogItem, InventoryItem, Product } from "@/types";
import type { CardProduct } from "@/components/customer/ProductCard";

// ============================================================================
// CartPage — Enhanced with free delivery progress, savings, recommendations
// ============================================================================

// Phase 21D-C M5 — mirrors PRICE_TOLERANCE in convex/orders.ts (resolveOrderLine)
// so the stale-price indicator only surfaces captured prices the server would
// reject at checkout.
const STALE_PRICE_THRESHOLD = 0.02;

/**
 * Phase 21D-C M5 — current server-authoritative price for a cart line.
 * Mirrors resolveOrderLine (convex/orders.ts): active-variant products price
 * from the matched active variant; products with zero active variants use the
 * catalog price. Product lines whose docs are missing or cross-BU disagree
 * resolve to null (no indicator — never guess a price).
 */
function resolveCurrentLinePrice(
  item: CartItem,
  catalogEntry: CatalogItem | undefined,
  productDoc: Product | undefined,
): number | null {
  if (item.itemType !== "product" || item.mealDealId) return null;
  if (!catalogEntry || !productDoc) return null;
  if (productDoc.businessUnitId !== item.businessUnitId) return null;
  const active = getActiveVariants(productDoc.variants);
  if (active.length === 0) return catalogEntry.price;
  const variant = active.find((v) => v.optionValue === item.variantName);
  return variant ? variant.price : null;
}

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, updateQuantity, updateVariant, removeItem, clearCart, itemCount, addItem, dismissNotice, applyMealDeal, allocateExistingMealDeal, removeMealDeal } = useCart();
  const addToCart = useAddToCart();

  // Phase 21D-C — the cart line currently being edited (single inventory
  // subscription drives whichever editor is open; fixed hook count).
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);

  // Meal Deal variant selection dialog
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [pendingMealDeal, setPendingMealDeal] = useState<{
    deal: import("@/types").EnrichedMealDeal;
    sourceParentCatalogItemId?: string;
  } | null>(null);

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

  const cartMealDealMatches = useCartMealDealDetection(
    cart.items,
    primaryBusinessUnitId,
    cart.appliedMealDeals,
  );

  // ── PHASE 24P: Multi-BU Meal Deal loading ──
  // Derive distinct Business Unit IDs from cart items.
  // Maximum 4 (MAX_BUSINESS_UNITS = 4 — matches existing codebase convention).
  const cartBuIds = useMemo(() => {
    const ids = cart.items.map((i) => i.businessUnitId).filter(Boolean);
    return [...new Set(ids)].slice(0, 4);
  }, [cart.items]);

  // Fixed-hook architecture: exactly 4 useMealDeals calls, matching MAX_BUSINESS_UNITS.
  // When a slot's BU ID is undefined, useMealDeals returns undefined (query skipped).
  const activeDeals0 = useMealDeals(cartBuIds[0] ?? null);
  const activeDeals1 = useMealDeals(cartBuIds[1] ?? null);
  const activeDeals2 = useMealDeals(cartBuIds[2] ?? null);
  const activeDeals3 = useMealDeals(cartBuIds[3] ?? null);

  const allDealsResults = [activeDeals0, activeDeals1, activeDeals2, activeDeals3];

  // Feed each BU's deals into the cart store's BU-aware cache.
  // confirmed=true: query resolved (success or empty array).
  // confirmed=false: query still loading or errored — do NOT mark BU as loaded.
  useEffect(() => {
    for (let i = 0; i < cartBuIds.length; i++) {
      const buId = cartBuIds[i];
      const deals = allDealsResults[i];
      if (buId) {
        // deals === undefined means query is still loading or errored.
        // Pass confirmed=false to preserve any existing deals for this BU.
        setActiveDeals(deals, buId, deals !== undefined);
      }
    }
  }, [cartBuIds, activeDeals0, activeDeals1, activeDeals2, activeDeals3]);

  // Handle meal deal apply from smart detection: open variant dialog if needed
  const handleCartMealDealApply = useCallback(
    (deal: import("@/types").EnrichedMealDeal, sourceParentCatalogItemId?: string) => {
      const needsSelection = deal.qualifyingItems.some(
        (qi) => (qi.alternatives && qi.alternatives.length > 0) || (qi.variants && qi.variants.length > 1),
      );
      if (needsSelection) {
        setPendingMealDeal({ deal, sourceParentCatalogItemId });
        setVariantDialogOpen(true);
      } else {
        applyMealDeal(deal, 1, sourceParentCatalogItemId);
      }
    },
    [applyMealDeal],
  );

  const handleVariantDialogConfirm = useCallback(
    async (selections: import("@/components/customer/MealDealVariantDialog").MealDealSelections) => {
      if (!pendingMealDeal) return;
      await applyMealDeal(
        pendingMealDeal.deal,
        1,
        pendingMealDeal.sourceParentCatalogItemId,
        selections.variantSelections,
        selections.itemSelections,
      );
      setPendingMealDeal(null);
    },
    [pendingMealDeal, applyMealDeal],
  );

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    primaryBusinessUnitId
      ? { businessUnitId: primaryBusinessUnitId as any }
      : "skip",
  ) as BusinessUnitSettings | null | undefined;

  const deliveryPolicy = useQuery(
    api.deliveryPolicies.getActivePolicy,
  ) as DeliveryPolicy | null | undefined;

  // Active business units — used to link cross-sell cards back to their stores
  const activeBUs = useQuery(api.businessUnits.getActive) as
    | BusinessUnit[]
    | undefined;

// Fetch recommended products for all BUs in cart, excluding items already in cart
  const cartItemIds = useMemo(
    () => filterCatalogItemIds(cart.items.map((item) => item.catalogItemId)),
    [cart.items],
  );

  // ── Phase 21D-C — catalog + source data for cart-line variant editing ──
  const cartCatalogItems = useQuery(
    api.catalogItems.getByIds,
    cartItemIds.length > 0 ? { ids: cartItemIds as Id<"catalogItems">[] } : "skip",
  ) as CatalogItem[] | undefined;

  const cartCatalogById = useMemo(
    () => new Map((cartCatalogItems ?? []).map((c) => [c._id, c])),
    [cartCatalogItems],
  );

  const cartProductSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of cart.items) {
      if (item.itemType !== "product" || item.mealDealId) continue;
      const sourceId = cartCatalogById.get(item.catalogItemId)?.sourceId;
      if (sourceId) ids.add(sourceId);
    }
    return [...ids];
  }, [cart.items, cartCatalogById]);

  const cartProducts = useQuery(
    api.products.getByIds,
    cartProductSourceIds.length > 0
      ? { ids: cartProductSourceIds as Id<"products">[] }
      : "skip",
  ) as Product[] | undefined;

  const cartProductById = useMemo(
    () => new Map((cartProducts ?? []).map((p) => [p._id, p])),
    [cartProducts],
  );

  // Storefront inventory for the line being edited — one reactive
  // subscription, skipped until an editor is open.
  const editingItem = editingCartItemId
    ? cart.items.find((i) => i.cartItemId === editingCartItemId) ?? null
    : null;
  const editingInventory = useQuery(
    api.inventory.getByCatalogItem,
    editingItem
      ? { catalogItemId: editingItem.catalogItemId as Id<"catalogItems"> }
      : "skip",
  ) as InventoryItem[] | undefined;

  // Fetch recommendations across all active business units,
  // excluding items already in the cart.
  // This replaces the previous BU-local query loop that violated
  // React's Rules of Hooks by dynamically changing the hook count
  // based on cart contents (1 item → 1 query, empty cart → 0 queries).
  const recommendedItems = useQuery(
    api.catalogItems.getRecommendedAcrossBusinessUnits,
    {
      excludeIds: cartItemIds,
      limit: 6,
    } as any,
  ) as CatalogItem[] | undefined;

  // Phase 21B — recommendation cards span every store, so both slugs are
  // resolved per item instead of assuming the cart's first business unit.
  const businessUnitSlugById = useBusinessUnitSlugById();
  const recommendedViewItems = useMemo(
    () => (recommendedItems ?? []).slice(0, 6),
    [recommendedItems],
  );
  const recommendedCategorySlugs = useProductCategorySlugs(recommendedViewItems);
  // Free delivery threshold — check delivery policy first, fall back to BU settings
  const freeDeliveryThreshold = useMemo(() => {
    const policyThreshold = deliveryPolicy?.freeDeliveryThreshold;
    const buThreshold = buSettings?.freeDeliveryThreshold;
    return policyThreshold ?? buThreshold ?? null;
  }, [deliveryPolicy, buSettings]);

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

  // ── 6C: Presentational dispatch-origin grouping ──
  // Derived view-only grouping by item.businessUnitId (stable, first-seen
  // order). No state, ordering, quantity, or checkout logic is affected.
  const buInfoById = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const bu of activeBUs ?? []) map.set(bu._id, bu);
    return map;
  }, [activeBUs]);

  const groupedItems = useMemo(() => {
    const groups: { businessUnitId: string; items: typeof cart.items }[] = [];
    const index = new Map<string, number>();
    for (const item of cart.items) {
      const key = item.businessUnitId || "__unknown__";
      const existing = index.get(key);
      if (existing === undefined) {
        index.set(key, groups.length);
        groups.push({ businessUnitId: item.businessUnitId, items: [item] });
      } else {
        groups[existing].items.push(item);
      }
    }
    return groups;
  }, [cart.items]);

  // Kitchen serviceability for cart warning
  const customerLocation = useLocationStore();
  const activeBUsForSvc = useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined;

  const kitchenServiceability = useMemo(() => {
    if (!activeBUsForSvc || cart.items.length === 0) return null;
    // Check each BU in the cart that has delivery origin configured
    for (const bu of activeBUsForSvc) {
      if (!bu.enableDelivery) continue;
      if (bu.originLatitude === undefined || bu.originLongitude === undefined) continue;
      const hasKitchenItems = cart.items.some((item) => item.businessUnitId === bu._id);
      if (!hasKitchenItems) continue;
      const svc = checkKitchenServiceability(customerLocation.location, bu);
      if (!svc.serviceable) return { buName: bu.name, ...svc };
    }
    return null;
  }, [activeBUsForSvc, cart.items, customerLocation.location]);

  // ==========================================================================
  // Empty Cart
  // ==========================================================================

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
    <div className="min-h-screen culinary-canvas">
      {/* Frosted breadcrumb strip — real cart info only */}
      <div className="border-b border-white/60 bg-white/40 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-foreground">Cart</span>
            {itemCount > 0 && (
              <span className="ml-1 rounded-full border border-culinary-outline-variant/60 bg-white/60 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </span>
            )}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="font-culinary-heading text-2xl font-bold tracking-tight sm:text-3xl">Shopping Cart</h1>
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

        {/* Kitchen Serviceability Warning */}
        {kitchenServiceability && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1 text-sm text-amber-800 dark:text-amber-200">
                <p>
                  <span className="font-medium">{kitchenServiceability.buName} items</span> are not available for delivery to your current location.
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  You can change your location, choose pickup if available, or remove these items to continue.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* FREE DELIVERY PROGRESS BAR                                      */}
        {/* ================================================================ */}
        {freeDeliveryProgress && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className={cn(
              "mb-6 rounded-2xl glass-tier-1 border p-4 sm:p-5",
              freeDeliveryProgress.reached
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-border/60"
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
              <div className="min-w-0 flex-1">
                <p className="font-culinary-heading text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Free delivery milestone
                </p>
                {freeDeliveryProgress.reached ? (
                  <p className="mt-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    You&apos;ve unlocked free delivery!
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm font-medium">
                    Add{" "}
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">
                      {formatCurrency(freeDeliveryProgress.remaining)}
                    </span>{" "}
                    more for free delivery
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-culinary-heading text-sm font-bold tabular-nums">
                  {Math.round(freeDeliveryProgress.progress)}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  of {formatCurrency(freeDeliveryThreshold!)}
                </p>
              </div>
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

        {/* ================================================================ */}
        {/* MEAL DEAL SMART DETECTION OFFER                                 */}
        {/* ================================================================ */}
        {cartMealDealMatches.length > 0 && cartMealDealMatches.map((match) => {
          const isPartial = match.missingItems.length > 0;

          return (
            <motion.div
              key={match.deal._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <UtensilsCrossed className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  {isPartial ? (
                    <>
                      <p className="font-culinary-heading text-sm font-bold">
                        Complete Your Meal
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Add {match.missingItems.map((m) =>
                          m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name
                        ).join(" + ")} and save {formatCurrency(match.deal.savings)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-culinary-heading text-sm font-bold">
                        Better Value Available!
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Make it a Meal for {formatCurrency(match.deal.dealPrice)}
                        {match.deal.savings > 0 && (
                          <span className="ml-1 text-emerald-600 font-medium">
                            Save {formatCurrency(match.deal.savings)}
                          </span>
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {match.deal.qualifyingItems.map((qi) => (
                          <span
                            key={qi.catalogItemId}
                            className="inline-flex items-center rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium"
                          >
                            {qi.quantity}x {qi.name}
                          </span>
                        ))}
                      </div>
                      {match.eligibleQuantity > 1 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {match.eligibleQuantity} deals available
                        </p>
                      )}
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => isPartial
                    ? handleCartMealDealApply(match.deal, match.sourceParentCatalogItemId)
                    : allocateExistingMealDeal(match.deal, match.sourceParentCatalogItemId)
                  }
                >
                  <UtensilsCrossed className="h-3 w-3" />
                  {isPartial ? "Add & Save" : "Apply Meal Deal"}
                </Button>
              </div>
            </motion.div>
          );
        })}

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* ================================================================ */}
          {/* CART ITEMS                                                      */}
          {/* ================================================================ */}

          <div className="space-y-4">
            {groupedItems.map((group) => {
              const bu = buInfoById.get(group.businessUnitId);
              const buName = bu?.name ?? "Store";
              const groupCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
              const groupSubtotal = group.items.reduce((sum, item) => sum + item.totalPrice, 0);
              const groupUnserviceable = !!bu && kitchenServiceability?.buName === bu.name;
              return (
                <section
                  key={group.businessUnitId || "store"}
                  aria-label={`${buName} items`}
                  className="space-y-3 rounded-3xl glass-tier-1 p-3 sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3 px-1 pt-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-culinary-heading text-base font-bold text-primary">
                      {buName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-culinary-heading text-base font-bold tracking-tight">
                        {buName}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {groupCount} item{groupCount !== 1 ? "s" : ""} · {formatCurrency(groupSubtotal)}
                      </p>
                    </div>
                  </div>
                  {groupUnserviceable && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      Items from this store are not available for delivery to your current location.
                    </p>
                  )}
            <AnimatePresence mode="popLayout">
              {group.items.map((item) => {
                // Phase 21D-C — variant editing + stale-price data for this line
                const catalogEntry = cartCatalogById.get(item.catalogItemId);
                const productDoc =
                  item.itemType === "product" && catalogEntry?.sourceId
                    ? cartProductById.get(catalogEntry.sourceId)
                    : undefined;
                const activeVariants =
                  !item.mealDealId &&
                  productDoc &&
                  productDoc.businessUnitId === item.businessUnitId
                    ? getActiveVariants(productDoc.variants)
                    : [];
                const editable = activeVariants.length > 0;
                const currentPrice = resolveCurrentLinePrice(
                  item,
                  catalogEntry,
                  productDoc,
                );
                const stalePrice =
                  currentPrice !== null &&
                  Math.abs(currentPrice - item.unitPrice) > STALE_PRICE_THRESHOLD
                    ? currentPrice
                    : null;
                return (
                  <motion.div
                    key={item.cartItemId}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    className="flex gap-3 sm:gap-4 rounded-2xl border border-border/50 bg-white/60 p-3 sm:p-4 dark:bg-white/5"
                  >
                    {/* Image well */}
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary sm:h-24 sm:w-24">
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
                        <h3 className="truncate font-culinary-heading text-sm font-semibold">
                          {item.name}
                        </h3>
                        {item.bundleItems && item.bundleItems.length > 0 ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {item.bundleItems.map((bi, i) => (
                              <span key={i}>
                                {bi.quantity}× {bi.name}{i < item.bundleItems!.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <p className="text-xs text-muted-foreground">
                              {item.variantName}
                            </p>
                            {editable && (
                              <CartVariantEditor
                                item={item}
                                activeVariants={activeVariants}
                                inventory={
                                  editingCartItemId === item.cartItemId
                                    ? editingInventory
                                    : undefined
                                }
                                open={editingCartItemId === item.cartItemId}
                                onOpenChange={(nextOpen) =>
                                  setEditingCartItemId(
                                    nextOpen ? item.cartItemId ?? null : null,
                                  )
                                }
                                onApply={(next) =>
                                  updateVariant(item.cartItemId ?? "cl_0", next)
                                }
                              />
                            )}
                          </div>
                        )}
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="font-culinary-heading text-base font-bold tracking-tight">
                            {formatCurrency(item.unitPrice)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            &times; {item.quantity}
                          </p>
                        </div>
                        {stalePrice !== null && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/30">
                            <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                              Price changed
                            </span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-300">
                              Now {formatCurrency(stalePrice)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const applied = updateVariant(
                                  item.cartItemId ?? "cl_0",
                                  {
                                    variantName: item.variantName,
                                    unitPrice: stalePrice,
                                  },
                                );
                                if (!applied) {
                                  toast.error("Couldn't update price", {
                                    description: `${item.name} could not be updated. Your cart was not changed.`,
                                  });
                                }
                              }}
                              className="h-5 px-1.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-100 dark:hover:bg-amber-900/40"
                              aria-label={`Update price of ${item.name}`}
                            >
                              Update price
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Quantity + Remove */}
                      <div className="flex flex-col items-end justify-between ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.cartItemId ?? 'cl_0')}
                          className="h-11 w-11 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <QuantitySelector
                          value={item.quantity}
                          onChange={(qty) =>
                            updateQuantity(item.cartItemId ?? 'cl_0', qty)
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
              </section>
            );
            })}
          </div>

          <div className="space-y-3">
            {/* Applied Meal Deals */}
            {cart.appliedMealDeals && cart.appliedMealDeals.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Applied Meal Deals
                </p>
                {cart.appliedMealDeals.map((deal) => (
                  <div
                    key={deal.mealDealId}
                    className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30"
                  >
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                          {deal.name} x{deal.quantity}
                        </p>
                        <p className="text-[10px] text-emerald-600">
                          Saving {formatCurrency(deal.savings * deal.quantity)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-emerald-700 hover:text-destructive"
                      onClick={() => removeMealDeal(deal.mealDealId)}
                      aria-label={`Remove ${deal.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

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
            {/* Culinary Glass Tier 3 (Phase 3, receipt treatment in 6B) —
                sticky summary surface. Contents, calculations, and
                behavior unchanged. */}
            <div className="rounded-3xl glass-tier-3 border border-border/60 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-culinary-heading text-lg font-bold tracking-tight">Order Summary</h2>
                <span className="rounded-full border border-culinary-outline-variant/60 bg-white/60 px-2 py-0.5 text-[10px] font-semibold text-culinary-on-surface-variant backdrop-blur-md">
                  {itemCount} item{itemCount !== 1 ? "s" : ""}
                </span>
              </div>

              <Separator />

              {/* Line items summary */}
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {cart.items.map((item) => (
                  <div
                      key={item.cartItemId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-muted-foreground mr-2">
                      {item.name}{item.bundleItems && item.bundleItems.length > 0 ? "" : ` (${item.variantName})`} &times;{item.quantity}
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Smart Meal Deal Suggestion */}
              {cartMealDealMatches.length > 0 && cartMealDealMatches.map((match) => {
                const isPartial = match.missingItems.length > 0;

                return (
                  <div
                    key={match.deal._id}
                    className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {isPartial ? (
                          <>
                            <p className="font-culinary-heading text-xs font-bold">Complete Your Meal</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Add {match.missingItems.map((m) =>
                                m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name
                              ).join(" + ")}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-culinary-heading text-xs font-bold">Make it a Meal</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {match.deal.qualifyingItems.map((qi) => qi.name).join(" + ")}
                            </p>
                          </>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs font-bold">{formatCurrency(match.deal.dealPrice)}</span>
                          {match.deal.savings > 0 && (
                            <span className="text-[10px] font-medium text-emerald-600">
                              Save {formatCurrency(match.deal.savings)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 h-7 gap-1 text-xs"
                        onClick={() => isPartial
                          ? handleCartMealDealApply(match.deal, match.sourceParentCatalogItemId)
                          : allocateExistingMealDeal(match.deal, match.sourceParentCatalogItemId)
                        }
                      >
                        {isPartial ? "Add" : "Apply"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Applied Meal Deal in Order Summary */}
              {cart.appliedMealDeals && cart.appliedMealDeals.map((applied) => (
                <div
                  key={applied.mealDealId}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                      {applied.name}
                      {applied.effectiveDealPrice !== applied.dealPrice && (
                        <span className="font-normal ml-1">
                          ({formatCurrency(applied.effectiveDealPrice)}/meal)
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-emerald-600">
                      Save {formatCurrency(applied.savings * applied.quantity)}
                    </p>
                  </div>
                </div>
              ))}

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
                {(cart.mealDealSavings ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Meal Deal Savings</span>
                    <span className="font-medium">
                      -{formatCurrency(cart.mealDealSavings ?? 0)}
                    </span>
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
                  <span>
                    Estimated delivery: {deliveryPolicy?.estimatedMinutes ? `~${deliveryPolicy.estimatedMinutes} min` : "30-45 minutes"}
                  </span>
                </div>
                {cart.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">{formatCurrency(cart.tax)}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-baseline justify-between">
                <span className="font-culinary-heading text-base font-bold">Total</span>
                <span className="font-culinary-heading text-2xl font-extrabold tracking-tight">{formatCurrency(cart.total)}</span>
              </div>

              {/* Checkout CTA */}
              <Button
                size="lg"
                variant="crunch"
                className="h-12 w-full gap-2 font-culinary-heading"
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
        {recommendedItems === undefined && cart.businessUnitIds.length > 0 && (
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
              <h2 className="font-culinary-heading text-lg font-bold tracking-tight">You might also like</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {recommendedViewItems.map((item) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  businessUnitSlug={businessUnitSlugById.get(item.businessUnitId)}
                  categorySlug={recommendedCategorySlugs.get(item.sourceId)}
                  compact
                  onAddToCart={addToCart as (product: CatalogItem | CardProduct) => Promise<void>}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ================================================================ */}
      {/* CROSS-SELL — Frequently Bought Together + Recently Viewed        */}
      {/* ================================================================ */}

      {cart.businessUnitIds.length > 0 && cart.items[0] && (
        <FrequentlyBoughtTogetherSection
          catalogItemId={cart.items[0].catalogItemId}
          businessUnitId={cart.businessUnitIds[0]}
          businessUnits={activeBUs ?? []}
          productName={cart.items[0].name}
        />
      )}
      <RecentlyViewedSection businessUnits={activeBUs ?? []} />

      {/* Meal Deal variant selection dialog */}
      {pendingMealDeal && (
        <MealDealVariantDialog
          open={variantDialogOpen}
          onOpenChange={setVariantDialogOpen}
          deal={pendingMealDeal.deal}
          onConfirm={handleVariantDialogConfirm}
        />
      )}
    </div>
  );
}
