import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Package,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowRight,
  Utensils,
  ShoppingBag,
  AlertTriangle,
  Clock,
  MapPin,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart, setActiveDeals } from "@/stores/cart";
import { useBrowsingPreference } from "@/hooks/use-browsing-preference";
import { useMealDeals } from "@/hooks/use-meal-deals";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";
import { checkKitchenServiceability } from "@/utils";
import {
  getInlineVariants,
  resolveQuickAddVariantLine,
} from "@/utils/product-variants";
import { useLocationStore } from "@/stores/location";

// Customer reusable components
import {
  SectionHeader,
  OfferBanner,
  ProductCardSkeleton,
  ComboCard,
  ComboCardSkeleton,
  PartyPackCard,
  PartyPackCardSkeleton,
  CardGridSkeleton,
  StoreStatusBadge,
  FlashSalesSection,
  CatalogGrid,
  CatalogToolbar,
} from "@/components/customer";
import { MealDealVariantDialog } from "@/components/customer/MealDealVariantDialog";
import { getStockStatus, getProductStockStatus } from "@/components/customer/StockBadge";
import type { StockInfo } from "@/components/customer/StockBadge";

// Shared components
import { CategoryIcon } from "@/components/shared/CategoryCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";

import { Button } from "@/components/ui/button";
import { filterAndSortCatalogItems, type SortOption } from "@/lib/catalog";

import type { BusinessUnit, Category, Offer, Combo, PartyPack, BusinessUnitSettings, InventoryItem, Product, CatalogItem, EnrichedMealDeal } from "@/types";
import type { Id } from "@convex/_generated/dataModel";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";
import { useProductCategorySlugs } from "@/hooks/use-product-routes";
import { ItemDetailsModal } from "@/components/customer/ItemDetailsModal";

/**
 * Rule 17: Check whether a parent catalog item is eligible for a meal deal.
 * - undefined or empty parentCatalogItemIds → all eligible parents allowed
 * - non-empty parentCatalogItemIds → only listed IDs allowed
 */
function isParentAllowed(
  parentCatalogItemId: string,
  parentCatalogItemIds?: string[],
): boolean {
  if (!parentCatalogItemIds || parentCatalogItemIds.length === 0) return true;
  return parentCatalogItemIds.includes(parentCatalogItemId);
}

// ============================================================================
// Sort Options — shared source of truth lives in @/lib/catalog (Phase 21C)
// ============================================================================

type CatalogMode = "all" | "products" | "combos" | "partyPacks";

// ============================================================================
// BusinessUnitPage — Fully dynamic, slug-driven page for ANY business unit
// ============================================================================

export default function BusinessUnitPage() {
  const { businessUnitSlug } = useParams<{ businessUnitSlug: string }>();

  // ==========================================================================
  // State
  // ==========================================================================

  const [catalogMode, setCatalogMode] = useState<CatalogMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modal state
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const onCloseModal = () => setSelectedItem(null);

  // Meal Deal variant selection dialog
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [pendingMealDeal, setPendingMealDeal] = useState<{
    deal: EnrichedMealDeal;
    sourceParentCatalogItemId?: string;
  } | null>(null);

  // Cart
  const { cart, addItem, applyMealDeal } = useCart();

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  // Load the specific business unit by slug
  const businessUnit = useQuery(api.businessUnits.getBySlug, {
    slug: businessUnitSlug ?? "",
  }) as BusinessUnit | null | undefined;

  const isBuLoading = businessUnit === undefined;
  const isBuNotFound = businessUnit === null;

  // Remember which store the shopper browses (BU personalization on homepage)
  const { setPreference } = useBrowsingPreference();
  useEffect(() => {
    if (businessUnit?._id) setPreference(businessUnit._id);
  }, [businessUnit?._id, setPreference]);

  // Once BU is loaded, fetch all related data
  const categories = useQuery(
    api.categories.getByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as Category[] | undefined;

  const catalogItems = useQuery(
    api.catalogItems.getByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  );

  const featuredItems = useQuery(
    api.catalogItems.getFeatured,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  );

  const offers = useQuery(
    api.offers.getActive,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as Offer[] | undefined;

  const combos = useQuery(
    api.combos.getByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as Combo[] | undefined;

  const partyPacks = useQuery(
    api.partyPacks.getByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as PartyPack[] | undefined;

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as BusinessUnitSettings | null | undefined;

  const inventoryItems = useQuery(
    api.inventory.getByBusinessUnit,
    businessUnit?._id ? { businessUnitId: businessUnit._id as any } : "skip"
  ) as InventoryItem[] | undefined;

  // Load all products for this BU to build a sourceId → categoryId map for filtering
  const allProducts = useQuery(
    api.products.getAllByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as Product[] | undefined;

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  // Kitchen serviceability
  const customerLocation = useLocationStore();
  const serviceability = useMemo(() => {
    if (!businessUnit) return null;
    if (!businessUnit.enableDelivery) return null;
    if (businessUnit.originLatitude === undefined || businessUnit.originLongitude === undefined) return null;
    return checkKitchenServiceability(customerLocation.location, businessUnit);
  }, [businessUnit, customerLocation.location]);

  const { bySource, catalogItemMap } = useCatalogItemMap(
    businessUnit ? [businessUnit] : undefined
  );

  // Meal deal eligibility for combos and party packs — per-item filtering
  // respects parentCatalogItemIds (Rule 17).
  const activeDeals = useMealDeals(businessUnit?._id ?? null);

  // PHASE 24M: Feed active deals into the cart store so reconciliation can
  // recompute pricing from canonical deal definitions.
  useEffect(() => {
    if (activeDeals !== undefined && businessUnit?._id) {
      setActiveDeals(activeDeals, businessUnit._id);
    }
  }, [activeDeals, businessUnit?._id]);

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const isDataLoading =
    categories === undefined ||
    catalogItems === undefined ||
    featuredItems === undefined ||
    offers === undefined ||
    combos === undefined ||
    partyPacks === undefined ||
    allProducts === undefined;

  const buSlug = businessUnit?.slug ?? businessUnitSlug ?? "";

  // Stock info helper — get stock status for a product's default variant
  const getStockInfoForProduct = useCallback(
    (item: CatalogItem): StockInfo | undefined => {
      if (!inventoryItems) return undefined;
      const variants = (item as CatalogItem & { variants?: { name: string }[] }).variants;
      const variantNames = variants?.map((v) => v.name) ?? ["Default"];
      return getProductStockStatus(inventoryItems, variantNames);
    },
    [inventoryItems]
  );

  // Active categories — only those with active status
  const activeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.status === "active"),
    [categories]
  );

  // Enrich categories with catalog metadata (icons, gradients, featured)
  const catalog = useMemo(
    () => getCategoryCatalog(businessUnit?.catalogMode),
    [businessUnit?.catalogMode]
  );

  const enrichedCategories = useMemo<EnrichedCategory[]>(
    () => activeCategories.map((c) => enrichCategory(c, catalog)),
    [activeCategories, catalog]
  );

  // Ratings summary for catalog items (keyed by catalog item id)
  const catalogItemIds = useMemo(
    () => (catalogItems ?? []).map((i) => i._id as Id<"catalogItems">),
    [catalogItems]
  );

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    catalogItemIds.length > 0 ? { ids: catalogItemIds } : "skip"
  ) as Record<string, { average: number; count: number }> | undefined;

  // Active combos (check feature flag)
  const activeCombos = useMemo(
    () => (combos ?? []).filter((c) => c.status === "active"),
    [combos]
  );

  // Active party packs (check feature flag)
  const activePartyPacks = useMemo(
    () => (partyPacks ?? []).filter((p) => p.status === "active"),
    [partyPacks]
  );

  // Per-combo meal deal map — respects parentCatalogItemIds (Rule 17).
  const comboMealDealMap = useMemo(() => {
    if (!activeDeals || activeDeals.length === 0) return new Map<string, import("@/types").EnrichedMealDeal>();
    const map = new Map<string, import("@/types").EnrichedMealDeal>();
    for (const combo of activeCombos) {
      const comboCatalogItemId = bySource.get(combo._id)?._id;
      const eligible = activeDeals.filter(
        (d) =>
          d.applyToCombos &&
          isParentAllowed(comboCatalogItemId ?? "", d.parentCatalogItemIds),
      );
      if (eligible.length === 0) continue;
      map.set(combo._id, eligible.reduce((a, b) => (a.savings > b.savings ? a : b)));
    }
    return map;
  }, [activeDeals, activeCombos, bySource]);

  // Per-party-pack meal deal map — respects parentCatalogItemIds (Rule 17).
  const partyPackMealDealMap = useMemo(() => {
    if (!activeDeals || activeDeals.length === 0) return new Map<string, import("@/types").EnrichedMealDeal>();
    const map = new Map<string, import("@/types").EnrichedMealDeal>();
    for (const pack of activePartyPacks) {
      const packCatalogItemId = bySource.get(pack._id)?._id;
      const eligible = activeDeals.filter(
        (d) =>
          d.applyToPartyPacks &&
          isParentAllowed(packCatalogItemId ?? "", d.parentCatalogItemIds),
      );
      if (eligible.length === 0) continue;
      map.set(pack._id, eligible.reduce((a, b) => (a.savings > b.savings ? a : b)));
    }
    return map;
  }, [activeDeals, activePartyPacks, bySource]);

  // Products only — combos/party packs have their own sections. The full
  // store is always shown here; category scoping lives on the canonical
  // CategoryPage. Search + sort compose through the shared pipeline.
  const productItems = useMemo(
    () => (catalogItems ?? []).filter((item) => item.itemType === "product"),
    [catalogItems],
  );

  const filteredItems = useMemo(
    () => filterAndSortCatalogItems(productItems, { searchQuery, sortBy }),
    [productItems, searchQuery, sortBy],
  );

  // Phase 21B — product sourceId → category slug for canonical PDP links.
  // `allProducts` already carries every categoryId in this store, so nothing
  // extra is fetched here.
  const categorySlugBySourceId = useProductCategorySlugs(filteredItems, allProducts);
  const categorySlugByFeaturedSourceId = useProductCategorySlugs(featuredItems, allProducts);

  // Filtered combos for search in combos mode
  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return activeCombos;
    const q = searchQuery.toLowerCase().trim();
    return activeCombos.filter(
      (combo) =>
        combo.name.toLowerCase().includes(q) ||
        combo.description?.toLowerCase().includes(q)
    );
  }, [activeCombos, searchQuery]);

  // Filtered party packs for search in partyPacks mode
  const filteredPartyPacks = useMemo(() => {
    if (!searchQuery.trim()) return activePartyPacks;
    const q = searchQuery.toLowerCase().trim();
    return activePartyPacks.filter(
      (pack) =>
        pack.name.toLowerCase().includes(q) ||
        pack.description?.toLowerCase().includes(q)
    );
  }, [activePartyPacks, searchQuery]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleCatalogModeChange = useCallback((mode: CatalogMode) => {
    setCatalogMode(mode);
    if (mode === "combos" || mode === "partyPacks") {
      setSearchQuery("");
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleAddToCart = useCallback(
    async (product: any) => {
      if (!businessUnit) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }
      const line = await resolveQuickAddVariantLine({
        itemType: "product",
        name: product.name,
        price: product.price,
        sourceId: product.sourceId,
        variants:
          getInlineVariants(product) ??
          allProducts?.find((p) => p._id === product.sourceId)?.variants,
      });
      if (!line) {
        toast.error("Unable to add to cart", {
          description: `${product.name || "This item"} could not be added right now. Please try again.`,
        });
        return;
      }
      const added = await addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: businessUnit._id,
        name: product.name,
        variantName: line.variantName,
        quantity: 1,
        unitPrice: line.unitPrice,
        image: product.coverImage || product.thumbnail,
      });
      if (added) {
        toast.success("Added to cart", {
          description: `${product.name}`,
        });
      }
    },
    [addItem, businessUnit, storeIsOpen, nextOpenTime, allProducts]
  );

  const handleAddCombo = useCallback(
    async (combo: Combo): Promise<boolean> => {
      if (!businessUnit) return false;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return false;
      }
      const catalogItem = bySource.get(combo._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${combo.name} is temporarily unavailable. Please try again.`,
        });
        return false;
      }
      const bundleItems = combo.items?.map((ci) => ({
        name: catalogItemMap.get(ci.catalogItemId)?.name ?? "Item",
        quantity: ci.quantity,
      }));
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "combo",
        businessUnitId: combo.businessUnitId,
        name: combo.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: combo.price,
        image: combo.coverImage || combo.thumbnail || combo.images?.[0],
        ...(bundleItems && bundleItems.length > 0 ? { bundleItems } : {}),
      });
      if (added) {
        toast.success("Added to cart", { description: combo.name });
      }
      return added;
    },
    [addItem, bySource, catalogItemMap, businessUnit, storeIsOpen, nextOpenTime]
  );

  const handleAddPartyPack = useCallback(
    async (pack: PartyPack): Promise<boolean> => {
      if (!businessUnit) return false;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return false;
      }
      const catalogItem = bySource.get(pack._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${pack.name} is temporarily unavailable. Please try again.`,
        });
        return false;
      }
      const bundleItems = pack.items?.map((pi) => ({
        name: catalogItemMap.get(pi.catalogItemId)?.name ?? "Item",
        quantity: pi.quantity,
      }));
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "partyPack",
        businessUnitId: pack.businessUnitId,
        name: pack.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: pack.price,
        image: pack.coverImage || pack.thumbnail || pack.images?.[0],
        ...(bundleItems && bundleItems.length > 0 ? { bundleItems } : {}),
      });
      if (added) {
        toast.success("Added to cart", { description: pack.name });
      }
      return added;
    },
    [addItem, bySource, catalogItemMap, businessUnit, storeIsOpen, nextOpenTime]
  );

  const handleAddMealDeal = useCallback(
    async (deal: import("@/types").EnrichedMealDeal, sourceItem?: Combo | PartyPack) => {
      if (!businessUnit) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }
      let sourceParentCatalogItemId: string | undefined;
      if (sourceItem) {
        sourceParentCatalogItemId = bySource.get(sourceItem._id)?._id;
        const parentAlreadyInCart = sourceParentCatalogItemId
          ? cart.items.some((i) => i.catalogItemId === sourceParentCatalogItemId)
          : false;
        if (!parentAlreadyInCart) {
          const added = "minServings" in sourceItem
            ? await handleAddPartyPack(sourceItem as PartyPack)
            : await handleAddCombo(sourceItem as Combo);
          if (!added) return;
        }
      }

      // Check if any qualifying item has multiple variants or alternatives.
      const needsSelection = deal.qualifyingItems.some(
        (qi) => (qi.alternatives && qi.alternatives.length > 0) || (qi.variants && qi.variants.length > 1),
      );

      if (needsSelection) {
        // Open the variant selection dialog.
        setPendingMealDeal({ deal, sourceParentCatalogItemId });
        setVariantDialogOpen(true);
      } else {
        await applyMealDeal(deal, 1, sourceParentCatalogItemId);
      }
    },
    [applyMealDeal, handleAddCombo, handleAddPartyPack, businessUnit, storeIsOpen, nextOpenTime, bySource, cart.items]
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

  // Set page title
  useEffect(() => {
    if (businessUnit) {
      document.title = `${businessUnit.name} | ${SITE_NAME}`;
    }
  }, [businessUnit]);

  // ==========================================================================
  // Loading State
  // ==========================================================================

  if (isBuLoading) {
    return (
      <div className="min-h-screen culinary-canvas">
        {/* Hero Skeleton */}
        <div className="min-h-[350px] w-full bg-secondary/50 animate-pulse flex items-center">
          <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-14 w-14 animate-pulse rounded-xl bg-secondary" />
              <div className="space-y-2">
                <div className="h-7 w-48 animate-pulse rounded bg-secondary" />
                <div className="h-4 w-64 animate-pulse rounded bg-secondary" />
              </div>
            </div>
            <div className="h-10 w-72 animate-pulse rounded-full bg-secondary" />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-secondary shrink-0" />
            ))}
          </div>

          <CardGridSkeleton count={8} columns={4} type="product" />
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Not Found State
  // ==========================================================================

  if (isBuNotFound) {
    return (
      <div className="min-h-screen culinary-canvas flex items-center justify-center">
        <ErrorState
          title="Store Not Found"
          message={`The store "${businessUnitSlug}" doesn't exist or has been archived.`}
        />
      </div>
    );
  }

  // ==========================================================================
  // Derived BU Data
  // ==========================================================================

  const bu = businessUnit;
  const enableCombos = bu.enableCombos && activeCombos.length > 0;
  const enablePartyPacks = bu.enablePartyPacks && activePartyPacks.length > 0;
  const enableOffers = offers && offers.length > 0;
  const hasFeatured = featuredItems && featuredItems.length > 0;

  const BU_ICON = bu.iconName === "Utensils"
    ? Utensils
    : bu.iconName === "ShoppingBag"
    ? ShoppingBag
    : Store;

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="min-h-screen culinary-canvas">
      {/* ================================================================ */}
      {/* BUSINESS UNIT HERO / BANNER                                     */}
      {/* ================================================================ */}

      <section className="relative overflow-hidden py-12 md:py-20">
        {/* Decorative */}
        {bu.themeColor && (
          <>
            <div
              className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.06]"
              style={{ backgroundColor: bu.themeColor }}
            />
            <div
              className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full opacity-[0.06]"
              style={{ backgroundColor: bu.themeColor }}
            />
          </>
        )}

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {/* Branding */}
            <div className="flex items-center gap-4">
              {bu.logo ? (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border shadow-sm">
                  <img
                    src={bu.logo}
                    alt={bu.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl shadow-sm"
                  style={{ backgroundColor: bu.themeColor || "#000" }}
                >
                  <BU_ICON className="h-8 w-8 text-white" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                    <h1 className="font-culinary-heading text-2xl font-bold tracking-tight md:text-3xl">
                      {bu.name}
                    </h1>
                  {buSettings && (
                    <StoreStatusBadge
                      isOpen={buSettings.isOpen}
                      openingHours={buSettings.openingHours}
                    />
                  )}
                </div>
                {bu.description && (
                  <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                    {bu.description}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-4">
              {catalogItems && catalogItems.length > 0 && (
                <div className="rounded-2xl glass-tier-1 px-4 py-2.5 text-center">
                  <p className="font-culinary-heading text-lg font-bold tabular-nums">{catalogItems.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Products
                  </p>
                </div>
              )}
              {enableCombos && (
                <div className="rounded-2xl glass-tier-1 px-4 py-2.5 text-center">
                  <p className="font-culinary-heading text-lg font-bold tabular-nums">{activeCombos.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Combos
                  </p>
                </div>
              )}
              {enablePartyPacks && (
                <div className="rounded-2xl glass-tier-1 px-4 py-2.5 text-center">
                  <p className="font-culinary-heading text-lg font-bold tabular-nums">{activePartyPacks.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Packs
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Store Closed Banner */}
      {buSettings && !storeIsOpen && (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-medium">Store is closed.</span>{" "}
                {nextOpenTime
                  ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
                  : "Ordering is temporarily unavailable."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Kitchen Delivery Serviceability Banner */}
      {serviceability && storeIsOpen && (
        <div className={cn(
          "border-b",
          serviceability.serviceable
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
        )}>
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              {serviceability.serviceable ? (
                <Truck className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <MapPin className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <p className={cn(
                "text-sm",
                serviceability.serviceable
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-red-800 dark:text-red-200",
              )}>
                {serviceability.serviceable ? (
                  <>
                    <span className="font-medium">Delivery available</span>
                    {serviceability.distanceKm !== null && (
                      <span> — approx. {serviceability.distanceKm} km away</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-medium">Kitchen delivery is not available to this location.</span>{" "}
                    {serviceability.reason === "NO_CUSTOMER_COORDINATES"
                      ? "Set your delivery location to check availability."
                      : serviceability.distanceKm !== null && serviceability.radiusKm !== null
                        ? `Approx. ${serviceability.distanceKm} km away — radius is ${serviceability.radiusKm} km.`
                        : "Select a closer delivery location."}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SEARCH + FILTERS BAR                                            */}
      {/* ================================================================ */}

      <div className="sticky top-16 z-40 border-b border-white/60 bg-white/55 backdrop-blur-lg dark:border-white/10 dark:bg-[#1A1412]/70">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <CatalogToolbar
            placeholder={`Search ${bu.name}...`}
            onSearch={handleSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* CATALOG MODE SELECTOR                                           */}
      {/* ================================================================ */}

      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { mode: "all" as CatalogMode, label: "All" },
              { mode: "products" as CatalogMode, label: bu.catalogLabel || "Products" },
              { mode: "combos" as CatalogMode, label: "Combos" },
              { mode: "partyPacks" as CatalogMode, label: "Party Packs" },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => handleCatalogModeChange(mode)}
              aria-pressed={catalogMode === mode}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                catalogMode === mode
                  ? "bg-culinary-primary text-white shadow-sm"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* CATEGORY NAVIGATION — canonical /{bu}/{category} routes (21C)     */}
      {/*                                                                  */}
      {/* Phase 21C decision: an intentional category selection navigates   */}
      {/* to the canonical category URL (shareable, back/refresh-safe,      */}
      {/* identical to the homepage) instead of silently filtering in-page. */}
      {/* ================================================================ */}

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {(catalogMode === "all" || catalogMode === "products") && enrichedCategories.length > 0 && (
          <nav
            aria-label={`${bu.name} categories`}
            className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
          >
            <Button
              asChild
              variant="default"
              size="sm"
              className="shrink-0 rounded-full text-xs"
            >
              <Link to={`/${buSlug}`} aria-current="page">
                All
              </Link>
            </Button>
            {enrichedCategories.map((cat) => (
              <Button
                key={cat._id}
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full text-xs"
              >
                <Link to={`/${buSlug}/${cat.slug}`}>
                  {cat.catalog?.icon && (
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                        cat.catalog.gradient
                      )}
                    >
                      <CategoryIcon
                        icon={cat.catalog.icon}
                        name={cat.name}
                        className="h-3 w-3"
                      />
                    </span>
                  )}
                  {cat.name}
                </Link>
              </Button>
            ))}
          </nav>
        )}
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT                                                    */}
      {/* ================================================================ */}

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ================================================================ */}
        {/* FEATURED PRODUCTS                                              */}
        {/* ================================================================ */}

        {!isDataLoading && hasFeatured && !searchQuery && catalogMode !== "combos" && catalogMode !== "partyPacks" && (
          <section className="mb-12">
            <SectionHeader
              title="Featured"
              subtitle="Our most popular selections"
              size="sm"
            />

            <CatalogGrid
              items={featuredItems!
                .filter((item) => item.itemType === "product")
                .slice(0, 12)}
              viewMode={viewMode}
              businessUnitSlug={buSlug}
              categorySlugFor={(item) => categorySlugByFeaturedSourceId.get(item.sourceId)}
              onAddToCart={handleAddToCart}
              stockInfoFor={getStockInfoForProduct}
              ratingsMap={ratingsMap}
              onOpenItemDetails={setSelectedItem}
              skeletonCount={12}
            />
          </section>
        )}

        {/* ================================================================ */}
        {/* PRODUCT GRID / SEARCH RESULTS                                  */}
        {/* ================================================================ */}

        {(catalogMode === "all" || catalogMode === "products") && (
        <section>
          {searchQuery && (
            <p className="mb-4 text-sm text-muted-foreground">
              {filteredItems.length === 0
                ? `No results found for "${searchQuery}"`
                : `Showing ${filteredItems.length} result${filteredItems.length === 1 ? "" : "s"} for "${searchQuery}"`
              }
            </p>
          )}

          <CatalogGrid
            loading={isDataLoading}
            items={filteredItems}
            viewMode={viewMode}
            businessUnitSlug={buSlug}
            categorySlugFor={(item) => categorySlugBySourceId.get(item.sourceId)}
            onAddToCart={handleAddToCart}
            stockInfoFor={getStockInfoForProduct}
            ratingsMap={ratingsMap}
            onOpenItemDetails={setSelectedItem}
            emptyState={
              <EmptyState
                title={
                  searchQuery
                    ? "No results found"
                    : "No products available"
                }
                description={
                  searchQuery
                    ? `We couldn't find anything matching "${searchQuery}". Try a different search term.`
                    : `${bu.name} doesn't have any products yet. Check back soon!`
                }
                icon={Package}
              />
            }
          />
        </section>
        )}

{/* ================================================================ */}
        {/* FLASH SALES (Feature Flag)                                         */}
        {/* ================================================================ */}

        {!isDataLoading && bu.enableOffers && catalogMode === "all" && (
          <FlashSalesSection businessUnitId={bu._id} className="mt-16" />
        )}

        {/* ================================================================ */}
        {/* ACTIVE OFFERS                                                      */}
        {/* ================================================================ */}

        {!isDataLoading && enableOffers && catalogMode === "all" && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4 }}
            className="mt-16"
          >
            <SectionHeader
              title="Active Offers"
              subtitle="Limited-time promotions and discounts"
              size="sm"
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offers!.slice(0, 6).map((offer, index) => (
                <OfferBanner
                  key={offer._id}
                  banner={offer}
                  index={index}
                  variant="card"
                  showCountdown
                  endsAt={offer.endsAt}
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* ================================================================ */}
        {/* COMBOS (Feature Flag)                                          */}
        {/* ================================================================ */}

        {!isDataLoading && enableCombos && (catalogMode === "all" || catalogMode === "combos") && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4 }}
            className="mt-16"
          >
            <SectionHeader
              title={`${bu.name} Combos`}
              subtitle={catalogMode === "combos" ? "Curated bundles at better value" : "Curated bundles at great value"}
              action={catalogMode === "all" ? {
                label: "View All Combos",
                onClick: () => handleCatalogModeChange("combos"),
              } : undefined}
              size="sm"
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(catalogMode === "combos" ? filteredCombos : activeCombos.slice(0, 4)).map((combo, index) => (
                <ComboCard
                  key={combo._id}
                  combo={combo}
                  index={index}
                  onAddToCart={handleAddCombo}
                  onOpenItemDetails={() => {
                    const catalogItem = bySource.get(combo._id);
                    if (catalogItem) setSelectedItem(catalogItem);
                  }}
                  getItemName={(catalogItemId) => catalogItemMap.get(catalogItemId)?.name}
                  mealDeal={comboMealDealMap.get(combo._id) ?? null}
                  onAddMealDeal={handleAddMealDeal}
                />
              ))}
            </div>
          </motion.section>
        )}

        {catalogMode === "combos" && !isDataLoading && filteredCombos.length === 0 && (
          <section className="mt-16">
            <SectionHeader
              title={`${bu.name} Combos`}
              subtitle="Curated bundles at better value"
              size="sm"
            />
            <EmptyState
              title="No combos available"
              description={`${bu.name} doesn't have any combos yet. Check back soon!`}
              icon={Package}
            />
          </section>
        )}

        {/* ================================================================ */}
        {/* PARTY PACKS (Feature Flag)                                     */}
        {/* ================================================================ */}

        {!isDataLoading && enablePartyPacks && (catalogMode === "all" || catalogMode === "partyPacks") && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4 }}
            className="mt-16"
          >
            <SectionHeader
              title={`${bu.name} Party Packs`}
              subtitle={catalogMode === "partyPacks" ? "Perfect for sharing, gatherings and celebrations" : "Perfect for gatherings and events"}
              action={catalogMode === "all" ? {
                label: "View All Packs",
                onClick: () => handleCatalogModeChange("partyPacks"),
              } : undefined}
              size="sm"
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(catalogMode === "partyPacks" ? filteredPartyPacks : activePartyPacks.slice(0, 4)).map((pack, index) => (
                <PartyPackCard
                  key={pack._id}
                  partyPack={pack}
                  index={index}
                  onAddToCart={handleAddPartyPack}
                  onOpenItemDetails={() => {
                    const catalogItem = bySource.get(pack._id);
                    if (catalogItem) setSelectedItem(catalogItem);
                  }}
                  getItemName={(catalogItemId) => catalogItemMap.get(catalogItemId)?.name}
                  mealDeal={partyPackMealDealMap.get(pack._id) ?? null}
                  onAddMealDeal={handleAddMealDeal}
                />
              ))}
            </div>
          </motion.section>
        )}

        {catalogMode === "partyPacks" && !isDataLoading && filteredPartyPacks.length === 0 && (
          <section className="mt-16">
            <SectionHeader
              title={`${bu.name} Party Packs`}
              subtitle="Perfect for sharing, gatherings and celebrations"
              size="sm"
            />
            <EmptyState
              title="No party packs available"
              description={`${bu.name} doesn't have any party packs yet. Check back soon!`}
              icon={Package}
            />
          </section>
        )}

        {/* Item Details Modal */}
        {selectedItem && (
          <ItemDetailsModal
            selectedItem={selectedItem}
            onClose={onCloseModal}
            mealDeal={
              selectedItem.itemType === "combo"
                ? comboMealDealMap.get(selectedItem.sourceId) ?? null
                : selectedItem.itemType === "partyPack"
                  ? partyPackMealDealMap.get(selectedItem.sourceId) ?? null
                  : null
            }
            onAddMealDeal={handleAddMealDeal}
          />
        )}

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
    </div>
  );
}
