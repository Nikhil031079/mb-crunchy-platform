import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Package,
  Search,
  SlidersHorizontal,
  Grid3X3,
  List,
  ArrowUpDown,
  ChevronDown,
  ArrowRight,
  Utensils,
  ShoppingBag,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { useBrowsingPreference } from "@/hooks/use-browsing-preference";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";

// Customer reusable components
import {
  SectionHeader,
  OfferBanner,
  ProductCard,
  ProductCardSkeleton,
  ComboCard,
  ComboCardSkeleton,
  PartyPackCard,
  PartyPackCardSkeleton,
  CardGridSkeleton,
  StoreStatusBadge,
  FlashSalesSection,
} from "@/components/customer";
import { getStockStatus, getProductStockStatus } from "@/components/customer/StockBadge";
import type { StockInfo } from "@/components/customer/StockBadge";

// Shared components
import { CategoryIcon } from "@/components/shared/CategoryCard";
import { SearchBar } from "@/components/shared/SearchBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { BusinessUnit, Category, Offer, Combo, PartyPack, BusinessUnitSettings, InventoryItem, Product, CatalogItem } from "@/types";
import type { Id } from "@convex/_generated/dataModel";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";
import { ItemDetailsModal } from "@/components/customer/ItemDetailsModal";

// ============================================================================
// Sort Options
// ============================================================================

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

type CatalogMode = "all" | "products" | "combos" | "partyPacks";

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Default", value: "default" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Name: A to Z", value: "name-asc" },
  { label: "Name: Z to A", value: "name-desc" },
];

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
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modal state
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const onCloseModal = () => setSelectedItem(null);

  // Mapping functions for Combo/PartyPack → CatalogItem
  const mapComboToCatalogItem = useCallback((combo: Combo): CatalogItem => ({
    _id: combo._id,
    _creationTime: combo._creationTime,
    createdAt: combo.createdAt,
    updatedAt: combo.updatedAt,
    businessUnitId: combo.businessUnitId,
    itemType: "combo" as const,
    sourceId: combo._id,
    name: combo.name,
    slug: combo.slug,
    description: combo.description,
    price: combo.price,
    compareAtPrice: combo.compareAtPrice,
    coverImage: combo.coverImage,
    thumbnail: combo.thumbnail,
    tags: [],
    status: combo.status,
    featured: combo.featured,
    displayOrder: combo.displayOrder,
    metaTitle: combo.metaTitle,
    metaDescription: combo.metaDescription,
    metaKeywords: combo.metaKeywords,
    canonicalUrl: combo.canonicalUrl,
    deletedAt: combo.deletedAt,
  }), []);

  const mapPartyPackToCatalogItem = useCallback((pack: PartyPack): CatalogItem => ({
    _id: pack._id,
    _creationTime: pack._creationTime,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    businessUnitId: pack.businessUnitId,
    itemType: "partyPack" as const,
    sourceId: pack._id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    price: pack.price,
    compareAtPrice: pack.compareAtPrice,
    coverImage: pack.coverImage,
    thumbnail: pack.thumbnail,
    tags: [],
    status: pack.status,
    featured: pack.featured,
    displayOrder: pack.displayOrder,
    metaTitle: pack.metaTitle,
    metaDescription: pack.metaDescription,
    metaKeywords: pack.metaKeywords,
    canonicalUrl: pack.canonicalUrl,
    deletedAt: pack.deletedAt,
  }), []);

  // Cart
  const { addItem } = useCart();

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

  // Catalog item map for combos/party packs → resolves sourceId to catalogItem._id
  const { bySource } = useCatalogItemMap([businessUnit!].filter(Boolean) as BusinessUnit[]);

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
    (product: any): StockInfo | undefined => {
      if (!inventoryItems) return undefined;
      const variantNames = product.variants?.map((v: any) => v.name) ?? ["Default"];
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
    () => getCategoryCatalog(businessUnit?.slug),
    [businessUnit?.slug]
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

  // Filter + sort catalog items
  const filteredItems = useMemo(() => {
    let items = [...(catalogItems ?? [])];

    // Only show products in the main grid (combos/party packs have their own sections)
    items = items.filter((item) => item.itemType === "product");

    // Filter by category — map products' categoryId to catalog items via sourceId
    if (activeCategoryId && allProducts) {
      const productIdsInCategory = new Set(
        allProducts
          .filter((p) => p.categoryId === activeCategoryId)
          .map((p) => p._id)
      );
      items = items.filter((item) => productIdsInCategory.has(item.sourceId));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case "price-asc":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        items.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        items.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    return items;
  }, [catalogItems, activeCategoryId, searchQuery, sortBy, allProducts]);

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
      setActiveCategoryId(null);
      setSearchQuery("");
    }
  }, []);

  const handleCategoryChange = useCallback((categoryId: string | null) => {
    setActiveCategoryId(categoryId);
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
      const defaultVariant = product.variants?.[0];
      const added = await addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: businessUnit._id,
        name: product.name,
        variantName: defaultVariant?.optionValue ?? "Default",
        quantity: 1,
        unitPrice: product.price ?? defaultVariant?.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      if (added) {
        toast.success("Added to cart", {
          description: `${product.name}`,
        });
      }
    },
    [addItem, businessUnit, storeIsOpen, nextOpenTime]
  );

  const handleAddCombo = useCallback(
    async (combo: Combo) => {
      if (!businessUnit) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }
      const catalogItem = bySource.get(combo._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${combo.name} is temporarily unavailable. Please try again.`,
        });
        return;
      }
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "combo",
        businessUnitId: combo.businessUnitId,
        name: combo.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: combo.price,
        image: combo.coverImage || combo.thumbnail || combo.images?.[0],
      });
      if (added) {
        toast.success("Added to cart", { description: combo.name });
      }
    },
    [addItem, bySource, businessUnit, storeIsOpen, nextOpenTime]
  );

  const handleAddPartyPack = useCallback(
    async (pack: PartyPack) => {
      if (!businessUnit) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }
      const catalogItem = bySource.get(pack._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${pack.name} is temporarily unavailable. Please try again.`,
        });
        return;
      }
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "partyPack",
        businessUnitId: pack.businessUnitId,
        name: pack.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: pack.price,
        image: pack.coverImage || pack.thumbnail || pack.images?.[0],
      });
      if (added) {
        toast.success("Added to cart", { description: pack.name });
      }
    },
    [addItem, bySource, businessUnit, storeIsOpen, nextOpenTime]
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
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Business Unit Not Found"
          message={`The business unit "${businessUnitSlug}" doesn't exist or has been archived.`}
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

  const BU_ICON = bu.slug === "mb-kitchen" || bu.slug === "kitchen"
    ? Utensils
    : bu.slug === "mb-mart" || bu.slug === "mart"
    ? ShoppingBag
    : Store;

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* BUSINESS UNIT HERO / BANNER                                     */}
      {/* ================================================================ */}

      <section className="relative overflow-hidden bg-gradient-to-br from-secondary/80 via-background to-background py-12 md:py-20">
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
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
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
                <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-center">
                  <p className="text-lg font-bold">{catalogItems.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Products
                  </p>
                </div>
              )}
              {enableCombos && (
                <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-center">
                  <p className="text-lg font-bold">{activeCombos.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Combos
                  </p>
                </div>
              )}
              {enablePartyPacks && (
                <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-center">
                  <p className="text-lg font-bold">{activePartyPacks.length}</p>
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

      {/* ================================================================ */}
      {/* SEARCH + FILTERS BAR                                            */}
      {/* ================================================================ */}

      <div className="sticky top-16 z-40 border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="w-full sm:max-w-sm">
              <SearchBar
                placeholder={`Search ${bu.name}...`}
                onSearch={handleSearch}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Sort */}
              <Select
                value={sortBy}
                onValueChange={(val) => setSortBy(val as SortOption)}
              >
                <SelectTrigger className="h-9 w-[130px] text-xs gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* View toggle */}
              <div className="flex rounded-lg border border-border/60 overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "h-9 w-9 rounded-none",
                    viewMode === "grid"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "h-9 w-9 rounded-none border-l border-border/60",
                    viewMode === "list"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
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
              { mode: "products" as CatalogMode, label: bu.slug === "mb-kitchen" || bu.slug === "kitchen" ? "Solo Meals" : "Products" },
              { mode: "combos" as CatalogMode, label: "Combos" },
              { mode: "partyPacks" as CatalogMode, label: "Party Packs" },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => handleCatalogModeChange(mode)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                catalogMode === mode
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* CATEGORY TABS                                                   */}
      {/* ================================================================ */}

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {(catalogMode === "all" || catalogMode === "products") && enrichedCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <Button
              variant={activeCategoryId === null ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategoryChange(null)}
              className="shrink-0 rounded-full text-xs"
            >
              All
            </Button>
            {enrichedCategories.map((cat) => (
              <Button
                key={cat._id}
                variant={activeCategoryId === cat._id ? "default" : "outline"}
                size="sm"
                onClick={() => handleCategoryChange(cat._id)}
                className="shrink-0 rounded-full text-xs"
              >
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
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT                                                    */}
      {/* ================================================================ */}

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ================================================================ */}
        {/* FEATURED PRODUCTS                                              */}
        {/* ================================================================ */}

        {!isDataLoading && hasFeatured && !searchQuery && activeCategoryId === null && catalogMode !== "combos" && catalogMode !== "partyPacks" && (
          <section className="mb-12">
            <SectionHeader
              title="Featured"
              subtitle="Our most popular selections"
              size="sm"
            />

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {featuredItems!
                .filter((item) => item.itemType === "product")
                .slice(0, 12)
                .map((item: any, index: number) => (
                  <ProductCard
                    key={item._id}
                    product={item}
                    businessUnitSlug={buSlug}
                    index={index}
                    compact
                    onAddToCart={handleAddToCart}
                    stockInfo={getStockInfoForProduct(item)}
                    onOpenItemDetails={setSelectedItem}
                  />
                ))}
            </div>
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

          {isDataLoading ? (
            <CardGridSkeleton count={8} columns={4} type="product" />
          ) : filteredItems.length > 0 ? (
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                  : "space-y-3"
              )}
            >
              {filteredItems.map((item: any, index: number) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  businessUnitSlug={buSlug}
                  index={index}
                  compact={viewMode === "grid"}
                  showDescription={viewMode === "list"}
                  onAddToCart={handleAddToCart}
                  stockInfo={getStockInfoForProduct(item)}
                  rating={ratingsMap?.[item._id]}
                  onOpenItemDetails={setSelectedItem}
                />
              ))}
            </div>
          ) : (
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
          )}
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
                  onOpenItemDetails={() => setSelectedItem(mapComboToCatalogItem(combo))}
                  getItemName={(catalogItemId) => bySource.get(catalogItemId)?.name}
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
                  onOpenItemDetails={() => setSelectedItem(mapPartyPackToCatalogItem(pack))}
                  getItemName={(catalogItemId) => bySource.get(catalogItemId)?.name}
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
          />
        )}
      </div>
    </div>
  );
}
