import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Package,
  LayoutGrid,
  Utensils,
  ShoppingBag,
  Store,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { SITE_NAME } from "@/constants";
import { useCart } from "@/stores/cart";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";
import {
  getInlineVariants,
  resolveQuickAddVariantLine,
} from "@/utils/product-variants";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";
import type { CardProduct } from "@/components/customer/ProductCard";

// Customer components
import {
  CardGridSkeleton,
  StoreStatusBadge,
  CatalogGrid,
  CatalogToolbar,
} from "@/components/customer";
import { CategoryNavBar } from "@/components/customer/CategoryNavBar";
import { CategoryEmptyState } from "@/components/customer/CategoryEmptyState";
import { ItemDetailsModal } from "@/components/customer/ItemDetailsModal";

// Shared components
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";

// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { filterAndSortCatalogItems, type SortOption } from "@/lib/catalog";

import type {
  BusinessUnit,
  Category,
  CatalogItem,
  Product,
  BusinessUnitSettings,
} from "@/types";

// ============================================================================
// CategoryPage — scoped category catalog
//
// The :categorySlug route renders THAT category's products through the shared
// catalog pipeline (CatalogToolbar + CatalogGrid). Other active categories
// stay reachable via the sticky CategoryNavBar, which navigates to each
// category's canonical URL so URL, title, breadcrumb and grid scope always
// stay in sync (Phase 21C-FIX). Sort options live in @/lib/catalog.
// ============================================================================

export default function CategoryPage() {
  const { businessUnitSlug, categorySlug } = useParams<{
    businessUnitSlug: string;
    categorySlug: string;
  }>();

  // ==========================================================================
  // State
  // ==========================================================================

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // Universal quick-view modal — same product interaction as BusinessUnitPage.
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const navigate = useNavigate();

  const slugKey = `${businessUnitSlug}/${categorySlug}`;
  const [prevSlugKey, setPrevSlugKey] = useState(slugKey);
  if (prevSlugKey !== slugKey) {
    setPrevSlugKey(slugKey);
    setSearchQuery("");
    setSortBy("default");
    setViewMode("grid");
    setSelectedItem(null);
  }

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  const businessUnit = useQuery(api.businessUnits.getBySlug, {
    slug: businessUnitSlug ?? "",
  }) as BusinessUnit | null | undefined;

  const isBuLoading = businessUnit === undefined;
  const isBuNotFound = businessUnit === null;

  const categories = useQuery(
    api.categories.getByBusinessUnit,
    businessUnit?._id ? { businessUnitId: businessUnit._id } : "skip"
  ) as Category[] | undefined;

  const catalogItems = useQuery(
    api.catalogItems.getByBusinessUnit,
    businessUnit?._id ? { businessUnitId: businessUnit._id } : "skip"
  ) as CatalogItem[] | undefined;

  const allProducts = useQuery(
    api.products.getAllByBusinessUnit,
    businessUnit?._id ? { businessUnitId: businessUnit._id } : "skip"
  ) as Product[] | undefined;

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    businessUnit?._id ? { businessUnitId: businessUnit._id } : "skip"
  ) as BusinessUnitSettings | null | undefined;

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  const { addItem } = useCart();

  const isDataLoaded =
    categories !== undefined &&
    catalogItems !== undefined &&
    allProducts !== undefined;

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const buSlug = businessUnit?.slug ?? businessUnitSlug ?? "";
  const catalog = useMemo(
    () => getCategoryCatalog(businessUnit?.catalogMode),
    [businessUnit?.catalogMode]
  );

  // Active categories, enriched with catalog metadata
  const activeCategories = useMemo<EnrichedCategory[]>(
    () =>
      (categories ?? [])
        .filter((c) => c.status === "active")
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((c) => enrichCategory(c, catalog)),
    [categories, catalog]
  );

  // The route's category — this page's single catalog scope (Phase 21C-FIX).
  const activeCategory = useMemo(
    () => activeCategories.find((c) => c.slug === categorySlug),
    [activeCategories, categorySlug]
  );

  // Map categoryId → product ids, and product sourceId → catalog item
  const productIdsByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of allProducts ?? []) {
      const list = map.get(p.categoryId) ?? [];
      list.push(p._id);
      map.set(p.categoryId, list);
    }
    return map;
  }, [allProducts]);

  const catalogItemBySourceId = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of catalogItems ?? []) {
      if (item.itemType === "product") map.set(item.sourceId, item);
    }
    return map;
  }, [catalogItems]);

  // Displayable catalog items per category (products with a synced catalog item)
  const itemsByCategoryId = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const [categoryId, ids] of productIdsByCategory) {
      const items = ids
        .map((id) => catalogItemBySourceId.get(id))
        .filter((item): item is CatalogItem => Boolean(item));
      map.set(categoryId, items);
    }
    return map;
  }, [productIdsByCategory, catalogItemBySourceId]);

  const countByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [categoryId, items] of itemsByCategoryId) {
      map.set(categoryId, items.length);
    }
    return map;
  }, [itemsByCategoryId]);

  const countsRecord = useMemo(() => {
    const record: Record<string, number> = {};
    for (const c of activeCategories) {
      record[c._id] = countByCategoryId.get(c._id) ?? 0;
    }
    return record;
  }, [activeCategories, countByCategoryId]);

  const scopedProductCount = useMemo(
    () => (activeCategory ? countByCategoryId.get(activeCategory._id) ?? 0 : 0),
    [activeCategory, countByCategoryId]
  );

  // Ratings summary for the route category's displayable catalog items
  const allCatalogItemIds = useMemo(
    () =>
      (activeCategory ? itemsByCategoryId.get(activeCategory._id) ?? [] : []).map(
        (i) => i._id as Id<"catalogItems">
      ),
    [activeCategory, itemsByCategoryId]
  );

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    allCatalogItemIds.length > 0 ? { ids: allCatalogItemIds } : "skip"
  ) as Record<string, { average: number; count: number }> | undefined;

  // ==========================================================================
  // Filtering + sorting — shared pipeline (@/lib/catalog), scoped to the
  // route category. Search and sort compose with no early return, which is
  // what previously made sort silently ignored during in-page search.
  // ==========================================================================

  const scopedItems = useMemo(
    () => (activeCategory ? itemsByCategoryId.get(activeCategory._id) ?? [] : []),
    [activeCategory, itemsByCategoryId]
  );

  const filteredItems = useMemo(
    () => filterAndSortCatalogItems(scopedItems, {
      searchQuery,
      sortBy,
    }),
    [scopedItems, searchQuery, sortBy]
  );

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Chips navigate to the selected category's canonical URL, so the URL,
  // document title, breadcrumb, nav highlight and grid scope all stay in
  // sync — navigation instead of in-page scrolling (Phase 21C-FIX).
  const navigateToCategory = useCallback(
    (categoryId: string) => {
      const target = activeCategories.find((c) => c._id === categoryId);
      if (target && target._id !== activeCategory?._id) {
        navigate(`/${buSlug}/${target.slug}`);
      }
    },
    [activeCategories, activeCategory, buSlug, navigate]
  );

  // Next category with products — destination for CategoryEmptyState's
  // "Explore other categories" action (URL navigation, not scrolling).
  const nextCategoryWithProducts = useMemo(() => {
    if (!activeCategory) return undefined;
    const start = activeCategories.findIndex((c) => c._id === activeCategory._id);
    if (start < 0) return undefined;
    for (let i = 1; i <= activeCategories.length; i++) {
      const candidate = activeCategories[(start + i) % activeCategories.length];
      if (
        candidate._id !== activeCategory._id &&
        (countByCategoryId.get(candidate._id) ?? 0) > 0
      ) {
        return candidate;
      }
    }
    return undefined;
  }, [activeCategories, activeCategory, countByCategoryId]);

const handleAddToCart = useCallback(
    async (product: CatalogItem | CardProduct) => {
      if (!businessUnit) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }
      const item = product as CatalogItem;
      const line = await resolveQuickAddVariantLine({
        itemType: "product",
        name: product.name,
        price: item.price,
        sourceId: item.sourceId,
        variants:
          getInlineVariants(product) ??
          allProducts?.find((p) => p._id === item.sourceId)?.variants,
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
        toast.success("Added to cart", { description: product.name });
      }
    },
    [addItem, businessUnit, storeIsOpen, nextOpenTime, allProducts]
  );

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Page title — the route category leads, the store stays as context
  useEffect(() => {
    if (businessUnit) {
      document.title = activeCategory
        ? `${activeCategory.name} | ${businessUnit.name} | ${SITE_NAME}`
        : `${businessUnit.name} Categories | ${SITE_NAME}`;
    }
  }, [businessUnit, activeCategory]);

  // Route fallback — never treat a product slug as a category. When the
  // :categorySlug segment isn't an active category but matches an active
  // product in this business unit, build the canonical product URL.
  const productRedirect = useMemo(() => {
    if (!isDataLoaded || isBuNotFound || !categorySlug) return null;
    if (activeCategories.some((c) => c.slug === categorySlug)) return null;
    const product = (allProducts ?? []).find(
      (p) => p.slug === categorySlug && p.status === "active"
    );
    if (!product) return null;
    const category = activeCategories.find((c) => c._id === product.categoryId);
    if (!category) return null;
    return `/${buSlug}/${category.slug}/${product.slug}`;
  }, [isDataLoaded, isBuNotFound, activeCategories, categorySlug, allProducts, buSlug]);

  useEffect(() => {
    if (productRedirect) {
      navigate(productRedirect, { replace: true });
    }
  }, [productRedirect, navigate]);

  // ==========================================================================
  // Loading State
  // ==========================================================================

  if (isBuLoading || !isDataLoaded) {
    return (
      <div className="min-h-screen culinary-canvas">
        {/* Header skeleton */}
        <div className="border-b border-border/40 bg-secondary/30 py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
            </div>
            <div className="h-8 w-56 animate-pulse rounded bg-secondary" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-secondary" />
          </div>
        </div>

        {/* Chips skeleton */}
        <div className="border-b border-white/60 bg-white/40">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex gap-2 overflow-x-auto">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-secondary" />
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <CardGridSkeleton count={8} columns={4} type="product" />
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Not Found States
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

  const noCategories = activeCategories.length === 0;
  const catNotFound = !noCategories && !activeCategories.some((c) => c.slug === categorySlug);

  if (catNotFound && productRedirect) {
    // The :categorySlug segment matches a product, not a category. The
    // redirect effect will navigate to the product page shortly; render the
    // loading state so we never flash a "Category Not Found" error.
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="border-b border-border/40 bg-secondary/30 py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
            </div>
            <div className="h-8 w-56 animate-pulse rounded bg-secondary" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-secondary" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <CardGridSkeleton count={8} columns={4} type="product" />
        </div>
      </div>
    );
  }

  if (catNotFound) {
    return (
      <div className="min-h-screen culinary-canvas flex items-center justify-center">
        <ErrorState
          title="Category Not Found"
          message={`The category "${categorySlug}" doesn't exist in ${businessUnit?.name ?? "this store"}.`}
          onRetry={() => navigate(`/${buSlug}`)}
        />
      </div>
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const bu = businessUnit!;

  const BU_ICON =
    bu.iconName === "Utensils"
      ? Utensils
      : bu.iconName === "ShoppingBag"
        ? ShoppingBag
        : Store;

  return (
    <div className="min-h-screen culinary-canvas">
      {/* ================================================================ */}
      {/* STORE HEADER                                                    */}
      {/* ================================================================ */}

      <section className="relative overflow-hidden py-8 md:py-10">
        {/* Decorative */}
        {bu.themeColor && (
          <>
            <div
              className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-[0.06]"
              style={{ backgroundColor: bu.themeColor }}
            />
            <div
              className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-[0.06]"
              style={{ backgroundColor: bu.themeColor }}
            />
          </>
        )}

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            className="mb-4 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md dark:border-white/10 dark:bg-white/5"
          >
            <Link to="/" className="shrink-0 transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <Link to={`/${buSlug}`} className="min-w-0 truncate transition-colors hover:text-foreground">
              {bu.name}
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="shrink-0 font-medium text-foreground">
              {activeCategory?.name ?? "Categories"}
            </span>
          </nav>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3"
          >
            <Link
              to={`/${buSlug}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Back to ${bu.name}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ backgroundColor: bu.themeColor || "#000" }}
              >
                <BU_ICON className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="font-culinary-heading truncate text-2xl font-bold tracking-tight md:text-3xl">
                  {activeCategory?.name ?? bu.name}
                </h1>
                {bu.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground max-w-xl">
                    {bu.description}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Quick stats — store status + the route category's product count */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StoreStatusBadge isOpen={storeIsOpen} openingHours={buSettings?.openingHours} />
            <Badge variant="outline" className="border-border/60 bg-card text-xs">
              <Package className="mr-1 h-3 w-3" />
              {scopedProductCount} product{scopedProductCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEARCH + FILTERS BAR                                            */}
      {/* ================================================================ */}

      <div className="border-b border-white/60 bg-white/55 backdrop-blur-lg dark:border-white/10 dark:bg-[#1A1412]/70">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <CatalogToolbar
            placeholder={`Search ${activeCategory?.name ?? bu.name}...`}
            onSearch={handleSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* STICKY CATEGORY NAVIGATION                                      */}
      {/* ================================================================ */}

      <CategoryNavBar
        categories={activeCategories}
        activeId={activeCategory?._id ?? ""}
        counts={countsRecord}
        onSelect={navigateToCategory}
      />

      {noCategories ? (
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            title="No categories yet"
            description="This store hasn't added any categories yet. Check back soon!"
            icon={LayoutGrid}
            action={
              <Link to={`/${buSlug}`}>
                <Button variant="outline" size="sm">
                  Back to {bu.name}
                </Button>
              </Link>
            }
          />
        </div>
      ) : activeCategory ? (
        <main>
          {/* ============================================================ */}
          {/* CATEGORY PRODUCTS — single scoped catalog (Phase 21C-FIX)    */}
          {/* ============================================================ */}

          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {filteredItems.length > 0 ? (
              <CatalogGrid
                items={filteredItems}
                viewMode={viewMode}
                businessUnitSlug={buSlug}
                categorySlugFor={() => activeCategory.slug}
                onAddToCart={handleAddToCart}
                ratingsMap={ratingsMap}
                onOpenItemDetails={setSelectedItem}
                products={allProducts}
              />
            ) : searchQuery ? (
              <EmptyState
                title="No results found"
                description={`We couldn't find anything matching "${searchQuery}" in ${activeCategory.name}. Try a different search term.`}
                icon={Package}
                action={
                  <Button variant="outline" size="sm" onClick={() => handleSearch("")}>
                    Clear Search
                  </Button>
                }
              />
            ) : (
              <CategoryEmptyState
                name={activeCategory.name}
                icon={activeCategory.catalog?.icon}
                gradient={activeCategory.catalog?.gradient}
                onExploreOther={
                  nextCategoryWithProducts
                    ? () => navigateToCategory(nextCategoryWithProducts._id)
                    : undefined
                }
                onBrowseAll={() => navigate(`/${buSlug}`)}
              />
            )}
          </div>
        </main>
      ) : null}

      {/* Universal item details modal — same product interaction as the
          canonical store catalog (Phase 21C) */}
      {selectedItem && (
        <ItemDetailsModal
          selectedItem={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
