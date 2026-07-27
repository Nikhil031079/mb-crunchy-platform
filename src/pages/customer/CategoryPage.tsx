import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Package,
  Grid3X3,
  List,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";

// Customer components
import {
  ProductCard,
  ProductCardSkeleton,
  CardGridSkeleton,
  SectionHeader,
} from "@/components/customer";

// Shared components
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

import type { BusinessUnit, Category, Product, CatalogItem, BusinessUnitSettings } from "@/types";

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

// ============================================================================
// CategoryPage — Slug-driven page showing products within a category
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

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  // Business unit
  const businessUnit = useQuery(api.businessUnits.getBySlug, {
    slug: businessUnitSlug ?? "",
  }) as BusinessUnit | null | undefined;

  const isBuLoading = businessUnit === undefined;
  const isBuNotFound = businessUnit === null;

  // Category — once BU loads, fetch by slug
  const category = useQuery(
    api.categories.getBySlug,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any, slug: categorySlug ?? "" }
      : "skip"
  ) as Category | null | undefined;

  const isCatLoading = category === undefined;
  const isCatNotFound = category === null && !isBuLoading;

  // Products by category
  const products = useQuery(
    api.products.getByCategory,
    category?._id
      ? { categoryId: category._id as any }
      : "skip"
  ) as Product[] | undefined;

  // All categories for sidebar / navigation
  const allCategories = useQuery(
    api.categories.getByBusinessUnit,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip"
  ) as Category[] | undefined;

  // BU settings for store open status
  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    businessUnit?._id
      ? { businessUnitId: businessUnit._id as any }
      : "skip",
  ) as BusinessUnitSettings | null | undefined;

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  // Cart
  const { addItem } = useCart();

  const isDataLoading =
    products === undefined || allCategories === undefined;

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const buSlug = businessUnit?.slug ?? businessUnitSlug ?? "";

  const activeCategories = useMemo(
    () => (allCategories ?? []).filter((c) => c.status === "active"),
    [allCategories]
  );

  // Filter + sort products
  const filteredProducts = useMemo(() => {
    let items = [...(products ?? [])];

    // Search filter
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
        items.sort((a, b) => {
          const aPrice = a.variants?.[0]?.price ?? 0;
          const bPrice = b.variants?.[0]?.price ?? 0;
          return aPrice - bPrice;
        });
        break;
      case "price-desc":
        items.sort((a, b) => {
          const aPrice = a.variants?.[0]?.price ?? 0;
          const bPrice = b.variants?.[0]?.price ?? 0;
          return bPrice - aPrice;
        });
        break;
      case "name-asc":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        items.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    return items;
  }, [products, searchQuery, sortBy]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleAddToCart = useCallback(
    (product: any) => {
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
      addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: businessUnit._id,
        name: product.name,
        variantName: defaultVariant?.name ?? "Default",
        quantity: 1,
        unitPrice: product.price ?? defaultVariant?.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      toast.success("Added to cart", {
        description: `${product.name}`,
      });
    },
    [addItem, businessUnit, storeIsOpen, nextOpenTime]
  );

  // ==========================================================================
  // Page Title
  // ==========================================================================

  useEffect(() => {
    if (businessUnit && category) {
      document.title = `${category.name} | ${businessUnit.name} | ${SITE_NAME}`;
    }
  }, [businessUnit, category]);

  // ==========================================================================
  // Loading State
  // ==========================================================================

  if (isBuLoading || isCatLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header skeleton */}
        <div className="border-b border-border/40 bg-secondary/30 py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
            </div>
            <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-64 animate-pulse rounded bg-secondary mt-2" />
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

  if (isCatNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ErrorState
          title="Category Not Found"
          message={`The category "${categorySlug}" doesn't exist in ${businessUnit?.name ?? "this business unit"}.`}
          onRetry={() => window.location.href = `/${buSlug}`}
        />
      </div>
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const bu = businessUnit!;
  const cat = category!;

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================== */}
      {/* CATEGORY HEADER                                                    */}
      {/* ================================================================== */}

      <section className="relative overflow-hidden bg-gradient-to-br from-secondary/80 via-background to-background py-8 md:py-12">
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
            <Link
              to="/"
              className="transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link
              to={`/${buSlug}`}
              className="transition-colors hover:text-foreground"
            >
              {bu.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{cat.name}</span>
          </nav>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <Link
                to={`/${buSlug}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {cat.name}
                </h1>
                {cat.description && (
                  <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                    {cat.description}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Quick Stats */}
          <div className="mt-4 flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-border/60 bg-card text-xs"
            >
              <Package className="mr-1 h-3 w-3" />
              {isDataLoading ? "..." : filteredProducts.length} product
              {filteredProducts.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SEARCH + FILTERS BAR                                              */}
      {/* ================================================================== */}

      <div className="sticky top-16 z-40 border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="w-full sm:max-w-sm">
              <SearchBar
                placeholder={`Search ${cat.name}...`}
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

      {/* ================================================================== */}
      {/* OTHER CATEGORIES NAV                                              */}
      {/* ================================================================== */}

      {activeCategories.length > 1 && (
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {activeCategories.map((c) => (
              <Link
                key={c._id}
                to={`/${buSlug}/${c.slug}`}
              >
                <Badge
                  variant={c._id === cat._id ? "default" : "outline"}
                  className={cn(
                    "shrink-0 cursor-pointer transition-colors text-xs",
                    c._id === cat._id
                      ? ""
                      : "hover:bg-secondary"
                  )}
                >
                  {c.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PRODUCTS GRID                                                     */}
      {/* ================================================================== */}

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <section>
          {searchQuery && (
            <p className="mb-4 text-sm text-muted-foreground">
              {filteredProducts.length === 0
                ? `No results found for "${searchQuery}"`
                : `Showing ${filteredProducts.length} result${filteredProducts.length === 1 ? "" : "s"} for "${searchQuery}"`}
            </p>
          )}

          {isDataLoading ? (
            <CardGridSkeleton count={8} columns={4} type="product" />
          ) : filteredProducts.length > 0 ? (
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                  : "space-y-3"
              )}
            >
              {filteredProducts.map((product: any, index: number) => {
                // Map Product to CatalogItem shape for ProductCard
                const catalogItem: CatalogItem = {
                  _id: product._id,
                  _creationTime: product._creationTime,
                  businessUnitId: product.businessUnitId,
                  itemType: "product",
                  sourceId: product._id,
                  name: product.name,
                  slug: product.slug,
                  description: product.description,
                  price: product.variants?.[0]?.price ?? 0,
                  compareAtPrice: product.variants?.[0]?.compareAtPrice,
                  coverImage: product.coverImage,
                  thumbnail: product.thumbnail,
                  tags: product.tags ?? [],
                  status: product.status,
                  featured: product.featured,
                  displayOrder: product.displayOrder,
                  createdAt: product.createdAt,
                  updatedAt: product.updatedAt,
                };

                return (
                  <ProductCard
                    key={product._id}
                    product={catalogItem}
                    businessUnitSlug={buSlug}
                    categorySlug={cat.slug}
                    index={index}
                    compact={viewMode === "grid"}
                    showDescription={viewMode === "list"}
                    onAddToCart={handleAddToCart}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={
                searchQuery ? "No results found" : "No products in this category"
              }
              description={
                searchQuery
                  ? `We couldn't find anything matching "${searchQuery}". Try a different search term.`
                  : `${cat.name} doesn't have any products yet. Check back soon!`
              }
              icon={Package}
              action={
                !searchQuery ? (
                  <Link to={`/${buSlug}`}>
                    <Button variant="outline" size="sm">
                      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                      Back to {bu.name}
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
