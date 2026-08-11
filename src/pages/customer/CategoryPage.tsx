import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Package,
  Grid3X3,
  List,
  ArrowUpDown,
  LayoutGrid,
  Utensils,
  ShoppingBag,
  Store,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";
import type { CardProduct } from "@/components/customer/ProductCard";

// Customer components
import {
  ProductCard,
  CardGridSkeleton,
  StoreStatusBadge,
} from "@/components/customer";
import { CategoryNavBar } from "@/components/customer/CategoryNavBar";
import { CategoryEmptyState } from "@/components/customer/CategoryEmptyState";

// Shared components
import { CategoryCard, CategoryIcon } from "@/components/shared/CategoryCard";
import { SearchBar } from "@/components/shared/SearchBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";

// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  BusinessUnit,
  Category,
  CatalogItem,
  Product,
  BusinessUnitSettings,
} from "@/types";

// ============================================================================
// Sort Options
// ============================================================================

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Default", value: "default" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Name: A to Z", value: "name-asc" },
  { label: "Name: Z to A", value: "name-desc" },
];

const categoryAnchorId = (slug: string) => `category-${slug}`;

// ============================================================================
// CategoryPage — Section-based category browser
//
// All active categories of a business unit are rendered as sections with a
// sticky navigation bar. The :categorySlug param targets the initial section.
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
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const navigate = useNavigate();

  const slugKey = `${businessUnitSlug}/${categorySlug}`;
  const [prevSlugKey, setPrevSlugKey] = useState(slugKey);
  if (prevSlugKey !== slugKey) {
    setPrevSlugKey(slugKey);
    setSearchQuery("");
    setSortBy("default");
    setViewMode("grid");
    setActiveCategoryId("");
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
    () => getCategoryCatalog(businessUnit?.slug),
    [businessUnit?.slug]
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

  const totalProducts = useMemo(
    () => activeCategories.reduce((sum, c) => sum + (countByCategoryId.get(c._id) ?? 0), 0),
    [activeCategories, countByCategoryId]
  );

  // Ratings summary for all displayable catalog items
  const allCatalogItemIds = useMemo(
    () =>
      Array.from(itemsByCategoryId.values())
        .flat()
        .map((i) => i._id as Id<"catalogItems">),
    [itemsByCategoryId]
  );

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    allCatalogItemIds.length > 0 ? { ids: allCatalogItemIds } : "skip"
  ) as Record<string, { average: number; count: number }> | undefined;

  const initialCategory = useMemo(
    () => activeCategories.find((c) => c.slug === categorySlug),
    [activeCategories, categorySlug]
  );

  const categoryIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of activeCategories) map.set(c.slug, c._id);
    return map;
  }, [activeCategories]);

  const effectiveActiveCategoryId =
    activeCategoryId ||
    (isDataLoaded && initialCategory ? initialCategory._id : "");

  // ==========================================================================
  // Filtering + sorting
  // ==========================================================================

  const filterItems = useCallback(
    (items: CatalogItem[]) => {
      const list = [...items];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return list.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q) ||
            item.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      switch (sortBy) {
        case "price-asc":
          list.sort((a, b) => a.price - b.price);
          break;
        case "price-desc":
          list.sort((a, b) => b.price - a.price);
          break;
        case "name-asc":
          list.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "name-desc":
          list.sort((a, b) => b.name.localeCompare(a.name));
          break;
      }
      return list;
    },
    [searchQuery, sortBy]
  );

  const filteredByCategoryId = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const c of activeCategories) {
      map.set(c._id, filterItems(itemsByCategoryId.get(c._id) ?? []));
    }
    return map;
  }, [activeCategories, itemsByCategoryId, filterItems]);

  const anyResults = useMemo(
    () => activeCategories.some((c) => (filteredByCategoryId.get(c._id)?.length ?? 0) > 0),
    [activeCategories, filteredByCategoryId]
  );

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const scrollToCategory = useCallback((categoryId: string) => {
    const el = document.getElementById(categoryAnchorId(categoryId));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToOverview = useCallback(() => {
    const el = document.getElementById("category-overview");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const getNextNonEmptyCategoryId = useCallback(
    (fromId: string): string | null => {
      const idx = activeCategories.findIndex((c) => c._id === fromId);
      if (idx < 0) return null;
      for (let i = 1; i <= activeCategories.length; i++) {
        const candidate = activeCategories[(idx + i) % activeCategories.length];
        if ((countByCategoryId.get(candidate._id) ?? 0) > 0) return candidate._id;
      }
      return null;
    },
    [activeCategories, countByCategoryId]
  );

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
      // Check if product has variants (CardProduct) or is a CatalogItem
      const isCardProduct = "variants" in product && Array.isArray(product.variants);
      const defaultVariant = isCardProduct ? product.variants?.[0] : undefined;
      const variantName = isCardProduct ? defaultVariant?.optionValue ?? "Default" : "Default";
      const unitPrice = isCardProduct ? (defaultVariant?.price ?? 0) : (product as CatalogItem).price ?? 0;
      const added = await addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: businessUnit._id,
        name: product.name,
        variantName,
        quantity: 1,
        unitPrice,
        image: product.coverImage || product.thumbnail,
      });
      if (added) {
        toast.success("Added to cart", { description: product.name });
      }
    },
    [addItem, businessUnit, storeIsOpen, nextOpenTime]
  );

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Page title
  useEffect(() => {
    if (businessUnit) {
      document.title = `${businessUnit.name} Categories | ${SITE_NAME}`;
    }
  }, [businessUnit]);

  // Scroll to the category referenced in the URL once data is ready
  useEffect(() => {
    if (!isDataLoaded || !initialCategory) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(categoryAnchorId(initialCategory.slug));
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [isDataLoaded, initialCategory]);

  // Scroll-spy — highlight the category currently in view
  useEffect(() => {
    if (!isDataLoaded || activeCategories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const slug = entry.target.id.replace("category-", "");
            const id = categoryIdBySlug.get(slug);
            if (id) setActiveCategoryId(id);
            return;
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    for (const c of activeCategories) {
      const el = document.getElementById(categoryAnchorId(c.slug));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [isDataLoaded, activeCategories, categoryIdBySlug]);

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
      <div className="min-h-screen bg-background">
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
        <div className="border-b border-border/40 bg-background/80">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Business Unit Not Found"
          message={`The business unit "${businessUnitSlug}" doesn't exist or has been archived.`}
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
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Category Not Found"
          message={`The category "${categorySlug}" doesn't exist in ${businessUnit?.name ?? "this business unit"}.`}
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
    bu.slug === "mb-kitchen" || bu.slug === "kitchen"
      ? Utensils
      : bu.slug === "mb-mart" || bu.slug === "mart"
        ? ShoppingBag
        : Store;

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* STORE HEADER                                                    */}
      {/* ================================================================ */}

      <section className="relative overflow-hidden bg-gradient-to-br from-secondary/80 via-background to-background py-8 md:py-10">
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
          <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link to={`/${buSlug}`} className="transition-colors hover:text-foreground">
              {bu.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">Categories</span>
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
                <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">
                  {bu.name} Categories
                </h1>
                {bu.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground max-w-xl">
                    {bu.description}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Quick stats */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StoreStatusBadge isOpen={storeIsOpen} openingHours={buSettings?.openingHours} />
            <Badge variant="outline" className="border-border/60 bg-card text-xs">
              <LayoutGrid className="mr-1 h-3 w-3" />
              {activeCategories.length} categor{activeCategories.length === 1 ? "y" : "ies"}
            </Badge>
            <Badge variant="outline" className="border-border/60 bg-card text-xs">
              <Package className="mr-1 h-3 w-3" />
              {totalProducts} product{totalProducts === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEARCH + FILTERS BAR                                            */}
      {/* ================================================================ */}

      <div className="border-b border-border/40 bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <SearchBar
                placeholder={`Search ${bu.name}...`}
                onSearch={handleSearch}
              />
            </div>

            <div className="flex items-center gap-2">
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

              <div className="flex overflow-hidden rounded-lg border border-border/60">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "h-9 w-9 rounded-none",
                    viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"
                  )}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "h-9 w-9 rounded-none border-l border-border/60",
                    viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"
                  )}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STICKY CATEGORY NAVIGATION                                      */}
      {/* ================================================================ */}

      <CategoryNavBar
        categories={activeCategories}
        activeId={effectiveActiveCategoryId}
        counts={countsRecord}
        onSelect={scrollToCategory}
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
      ) : (
        <main>
          {/* ============================================================ */}
          {/* ALL CATEGORIES OVERVIEW GRID                                */}
          {/* ============================================================ */}

          <div id="category-overview" className="scroll-mt-36">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutGrid className="h-4 w-4 text-accent" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                      Browse
                    </span>
                  </div>
                  <h2 className="text-xl font-bold sm:text-2xl">All Categories</h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {activeCategories.map((cat, index) => (
                  <CategoryCard
                    key={cat._id}
                    category={cat}
                    businessUnitSlug={buSlug}
                    index={index}
                    productCount={countByCategoryId.get(cat._id) ?? 0}
                    icon={cat.catalog?.icon}
                    gradient={cat.catalog?.gradient}
                    featured={cat.catalog?.featured}
                    onClick={() => scrollToCategory(cat._id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* CATEGORY SECTIONS                                           */}
          {/* ============================================================ */}

          <div className="border-t border-border/40">
            {searchQuery && !anyResults ? (
              <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                <EmptyState
                  title="No results found"
                  description={`We couldn't find anything matching "${searchQuery}" in ${bu.name}. Try a different search term.`}
                  icon={Package}
                  action={
                    <Button variant="outline" size="sm" onClick={() => handleSearch("")}>
                      Clear Search
                    </Button>
                  }
                />
              </div>
            ) : (
              activeCategories.map((cat) => {
                const items = filteredByCategoryId.get(cat._id) ?? [];
                const totalCount = countByCategoryId.get(cat._id) ?? 0;
                const nextNonEmptyId = getNextNonEmptyCategoryId(cat._id);

                return (
                  <section
                    key={cat._id}
                    id={categoryAnchorId(cat.slug)}
                    className="scroll-mt-32 border-b border-border/40 py-8 sm:py-10"
                  >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                      {/* Section header */}
                      <div className="mb-5 flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm",
                              cat.catalog?.gradient ?? "from-secondary to-secondary"
                            )}
                          >
                            <CategoryIcon
                              icon={cat.catalog?.icon}
                              name={cat.name}
                              className="h-5 w-5"
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="truncate text-lg font-bold sm:text-xl">
                                {cat.name}
                              </h2>
                              {cat.catalog?.featured && (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                                  Featured
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground sm:text-sm">
                              {cat.description ?? cat.catalog?.description}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 border-border/60 bg-card text-xs">
                          <Package className="mr-1 h-3 w-3" />
                          {totalCount} product{totalCount === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      {/* Content */}
                      {searchQuery && items.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-4 text-center text-sm text-muted-foreground">
                          No matches for &quot;{searchQuery}&quot; in {cat.name}
                        </p>
                      ) : items.length > 0 ? (
                        <div
                          className={cn(
                            viewMode === "grid"
                              ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                              : "space-y-3"
                          )}
                        >
                          {items.map((item, index) => (
                            <ProductCard
                              key={item._id}
                              product={item}
                              businessUnitSlug={buSlug}
                              categorySlug={cat.slug}
                              index={index}
                              compact={viewMode === "grid"}
                              showDescription={viewMode === "list"}
                              onAddToCart={handleAddToCart}
                              rating={ratingsMap?.[item._id]}
                            />
                          ))}
                        </div>
                      ) : (
                        <CategoryEmptyState
                          name={cat.name}
                          icon={cat.catalog?.icon}
                          gradient={cat.catalog?.gradient}
                          onExploreOther={
                            nextNonEmptyId
                              ? () => scrollToCategory(nextNonEmptyId)
                              : undefined
                          }
                          onBrowseAll={scrollToOverview}
                        />
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </main>
      )}
    </div>
  );
}
