import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Star,
  Clock,
  TrendingUp,
  Package,
  X,
  Sparkles,
  Filter,
  ArrowUpDown,
  Zap,
  PackageCheck,
  History,
  LayoutGrid,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { formatCurrency, debounce } from "@/utils";
import { SITE_NAME } from "@/constants";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

import { EmptyState } from "@/components/shared/EmptyState";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { BusinessUnit, CatalogItem, Category, Product, InventoryItem } from "@/types";

// ============================================================================
// Constants
// ============================================================================

const RECENT_SEARCHES_KEY = "mb-crunchy-recent-searches";
const MAX_RECENT = 8;

const POPULAR_SUGGESTIONS = [
  "Pizza",
  "Burger",
  "Biryani",
  "Cake",
  "Snacks",
  "Cold Drinks",
  "Rice",
  "Combos",
  "Party Pack",
  "Family Pack",
];

// ============================================================================
// LocalStorage Helpers
// ============================================================================

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (!query.trim()) return;
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((s) => s.toLowerCase() !== query.toLowerCase());
    const updated = [query.trim(), ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Storage unavailable
  }
}

// ============================================================================
// Text Highlighting
// ============================================================================

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="rounded-sm bg-yellow-200/70 px-0.5 text-foreground dark:bg-yellow-500/30"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// ============================================================================
// Typo-tolerant "Did you mean" suggestions
// ============================================================================

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function suggestCorrection(query: string, corpus: string[]): string | null {
  const target = query.toLowerCase().trim();
  if (!target) return null;
  let best: { word: string; dist: number } | null = null;
  for (const word of corpus) {
    const dist = levenshtein(target, word.toLowerCase());
    if (dist <= 2 && dist <= Math.max(1, Math.floor(target.length / 3))) {
      if (!best || dist < best.dist) best = { word, dist };
    }
  }
  return best?.word ?? null;
}

// ============================================================================
// Enriched Search Result
// ============================================================================

interface SearchResult extends CatalogItem {
  _businessUnitName: string;
  _businessUnitSlug: string;
  _categoryId?: string;
}

// ============================================================================
// Filter + Sort State
// ============================================================================

type SearchSort = "relevance" | "price-asc" | "price-desc" | "rating";

const SORT_OPTIONS: { label: string; value: SearchSort }[] = [
  { label: "Relevance", value: "relevance" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Top Rated", value: "rating" },
];

// ============================================================================
// Skeletons
// ============================================================================

function ResultCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/60">
      <div className="flex">
        <Skeleton className="h-28 w-28 shrink-0 sm:h-32 sm:w-32" />
        <div className="flex-1 space-y-2 p-3 sm:p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
          <div className="flex items-center gap-2 pt-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Result Card
// ============================================================================

interface ResultCardProps {
  item: SearchResult;
  query: string;
  ratings?: Record<string, { average: number; count: number }>;
}

function ResultCard({ item, query, ratings }: ResultCardProps) {
  const rating = ratings?.[item._id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link to={`/${item._businessUnitSlug}/${item.slug}`} className="group block">
        <Card className="overflow-hidden border-border/60 transition-shadow hover:shadow-md">
          <div className="flex">
            {/* Image */}
            <div className="relative h-28 w-28 shrink-0 overflow-hidden bg-secondary/50 sm:h-32 sm:w-32">
              {item.coverImage || item.thumbnail ? (
                <img
                  src={item.thumbnail || item.coverImage}
                  alt={item.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              {item.compareAtPrice && item.compareAtPrice > item.price && (
                <Badge
                  variant="destructive"
                  className="absolute left-1.5 top-1.5 px-1.5 py-0 text-[10px]"
                >
                  {Math.round(
                    ((item.compareAtPrice - item.price) / item.compareAtPrice) * 100,
                  )}
                  % OFF
                </Badge>
              )}
            </div>

            {/* Content */}
            <CardContent className="flex flex-1 flex-col justify-between p-3 sm:p-4">
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug line-clamp-1 transition-colors group-hover:text-primary">
                    {highlightMatch(item.name, query)}
                  </h3>
                  {item.itemType !== "product" && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 px-1.5 py-0 text-[10px] capitalize"
                    >
                      {item.itemType === "combo" ? "Combo" : "Party Pack"}
                    </Badge>
                  )}
                </div>

                {item.description && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {highlightMatch(item.description, query)}
                  </p>
                )}

                <Badge variant="outline" className="mt-0.5 px-1.5 py-0 text-[10px]">
                  {item._businessUnitName}
                </Badge>
              </div>

              <div className="mt-2 flex items-end justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-primary">
                    {formatCurrency(item.price)}
                  </span>
                  {item.compareAtPrice && item.compareAtPrice > item.price && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatCurrency(item.compareAtPrice)}
                    </span>
                  )}
                </div>

                {rating && rating.count > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{rating.average}</span>
                    <span className="text-muted-foreground/60">({rating.count})</span>
                  </div>
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

// ============================================================================
// SearchPage
// ============================================================================

interface SearchPageProps {
  businessUnitSlug?: string;
}

export default function SearchPage({ businessUnitSlug }: SearchPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(queryParam);
  const [debouncedQuery, setDebouncedQuery] = useState(queryParam);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Filter + sort state
  const [sortBy, setSortBy] = useState<SearchSort>("relevance");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Recently-viewed items for the idle suggestion panel
  const { entries: recentlyViewedEntries } = useRecentlyViewed();

  // Sync URL → local state
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearchInput(q);
    setDebouncedQuery(q);
  }, [searchParams]);

  // Debounced search
  const debouncedSetQuery = useMemo(
    () =>
      debounce((value: string) => {
        setDebouncedQuery(value);
      }, 300),
    [],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedSetQuery(value);
    },
    [debouncedSetQuery],
  );

  const handleSubmitSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    setSearchInput(trimmed);
    setDebouncedQuery(trimmed);
    if (trimmed) {
      saveRecentSearch(trimmed);
      setRecentSearches(getRecentSearches());
    }
  }, []);

  // Update URL when debounced query changes
  useEffect(() => {
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery }, { replace: true });
      saveRecentSearch(debouncedQuery);
      setRecentSearches(getRecentSearches());
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [debouncedQuery, setSearchParams]);

  const handleClearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore
    }
    setRecentSearches([]);
  }, []);

  const removeRecentItem = useCallback((query: string) => {
    try {
      const existing = getRecentSearches();
      const updated = existing.filter((s) => s.toLowerCase() !== query.toLowerCase());
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      setRecentSearches(updated);
    } catch {
      // Ignore
    }
  }, []);

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  const activeBUs = useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined;
  const buIds = useMemo(() => (activeBUs ?? []).map((bu) => bu._id), [activeBUs]);

  // Categories for the idle "Popular Categories" suggestion panel
  const isSearching = debouncedQuery.trim().length > 0;
  const idleCategories0 = useQuery(
    api.categories.getByBusinessUnit,
    !isSearching && buIds[0]
      ? { businessUnitId: buIds[0] }
      : "skip",
  ) as Category[] | undefined;
  const idleCategories1 = useQuery(
    api.categories.getByBusinessUnit,
    !isSearching && buIds[1]
      ? { businessUnitId: buIds[1] }
      : "skip",
  ) as Category[] | undefined;

  const popularCategories = useMemo(() => {
    const seen = new Set<string>();
    const all = [...(idleCategories0 ?? []), ...(idleCategories1 ?? [])];
    return all
      .filter((category) => category.status === "active")
      .filter((category) => {
        if (seen.has(category._id)) return false;
        seen.add(category._id);
        return true;
      })
      .slice(0, 6);
  }, [idleCategories0, idleCategories1]);

  const buSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of activeBUs ?? []) map.set(bu._id, bu.slug);
    return map;
  }, [activeBUs]);

  const recentlyViewedSuggestions = useMemo(
    () =>
      recentlyViewedEntries
        .slice(0, 6)
        .map((entry) => ({ id: entry.catalogItemId, name: entry.name })),
    [recentlyViewedEntries],
  );

  // Hooks for per-BU search results (must be called unconditionally)
  const searchResults0 = useQuery(
    api.catalogItems.search,
    buIds.length > 0 && debouncedQuery.trim()
      ? { businessUnitId: buIds[0]!, query: debouncedQuery.trim() }
      : "skip",
  );
  const searchResults1 = useQuery(
    api.catalogItems.search,
    buIds.length > 1 && debouncedQuery.trim()
      ? { businessUnitId: buIds[1]!, query: debouncedQuery.trim() }
      : "skip",
  );
  const searchResults2 = useQuery(
    api.catalogItems.search,
    buIds.length > 2 && debouncedQuery.trim()
      ? { businessUnitId: buIds[2]!, query: debouncedQuery.trim() }
      : "skip",
  );
  const searchResults3 = useQuery(
    api.catalogItems.search,
    buIds.length > 3 && debouncedQuery.trim()
      ? { businessUnitId: buIds[3]!, query: debouncedQuery.trim() }
      : "skip",
  );

  const allRawResults = useMemo(() => {
    const results: CatalogItem[][] = [];
    const all = [searchResults0, searchResults1, searchResults2, searchResults3];
    for (let i = 0; i < buIds.length && i < 4; i++) {
      const r = all[i];
      if (r && Array.isArray(r)) results.push(r);
    }
    return results;
  }, [buIds.length, searchResults0, searchResults1, searchResults2, searchResults3]);

  // Helper data for filters (only fetched while actively searching)
  const categoriesAll = useQuery(api.categories.getAll, isSearching ? {} : "skip") as
    | Category[]
    | undefined;
  const catalogItemsAll = useQuery(api.catalogItems.getAll, isSearching ? {} : "skip") as
    | CatalogItem[]
    | undefined;
  const inventoryAll = useQuery(api.inventory.getStorefrontAll, isSearching ? {} : "skip") as
    | InventoryItem[]
    | undefined;

  const categoryById = useMemo(() => {
    const map = new Map<string, { name: string; businessUnitId: string }>();
    for (const category of categoriesAll ?? []) {
      map.set(category._id, { name: category.name, businessUnitId: category.businessUnitId });
    }
    return map;
  }, [categoriesAll]);

  // Product docs for the currently-visible search results only (public
  // getByIds) — maps a product sourceId to its category for filtering.
  const productSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const buResults of allRawResults) {
      for (const item of buResults ?? []) {
        if (item.itemType === "product") ids.add(item.sourceId);
      }
    }
    return [...ids];
  }, [allRawResults]);

  const resultProducts = useQuery(
    api.products.getByIds,
    productSourceIds.length > 0 ? { ids: productSourceIds as never[] } : "skip",
  ) as Product[] | undefined;

  const productCategoryBySourceId = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of resultProducts ?? []) map.set(product._id, product.categoryId);
    return map;
  }, [resultProducts]);

  // Corpus of known item names for "Did you mean" suggestions — bounded so the
  // edit-distance pass stays cheap on every keystroke.
  const suggestionCorpus = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const tag of POPULAR_SUGGESTIONS) {
      if (!seen.has(tag)) {
        seen.add(tag);
        list.push(tag);
      }
    }
    for (const item of catalogItemsAll ?? []) {
      if (list.length >= 200) break;
      if (!seen.has(item.name)) {
        seen.add(item.name);
        list.push(item.name);
      }
    }
    return list;
  }, [catalogItemsAll]);

  const didYouMean = useMemo(
    () => suggestCorrection(debouncedQuery, suggestionCorpus),
    [debouncedQuery, suggestionCorpus],
  );

  const availableCatalogItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const inv of inventoryAll ?? []) {
      if (inv.deletedAt) continue;
      const quantity = inv.stockQuantity - (inv.reservedStock ?? 0);
      if (inv.available && quantity > 0) set.add(inv.catalogItemId);
    }
    return set;
  }, [inventoryAll]);

  // Flatten into enriched results
  const allResults = useMemo(() => {
    const enriched: SearchResult[] = [];
    for (let i = 0; i < buIds.length && i < allRawResults.length; i++) {
      const buId = buIds[i];
      const bu = activeBUs?.find((b) => b._id === buId);
      if (!bu) continue;
      for (const item of allRawResults[i] ?? []) {
        enriched.push({
          ...item,
          _businessUnitName: bu.name,
          _businessUnitSlug: bu.slug,
          _categoryId: item.itemType === "product" ? productCategoryBySourceId.get(item.sourceId) : undefined,
        });
      }
    }
    return enriched;
  }, [allRawResults, buIds, activeBUs, productCategoryBySourceId]);

  // Collect all item IDs for ratings
  const resultIds = useMemo(() => allResults.map((item) => item._id as string), [allResults]);

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    resultIds.length > 0 ? { ids: resultIds as never[] } : "skip",
  );

  // Category options derived from the current result set
  const categoryOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const item of allResults) {
      if (!item._categoryId || seen.has(item._categoryId)) continue;
      const category = categoryById.get(item._categoryId);
      if (category) {
        seen.add(item._categoryId);
        options.push({ id: item._categoryId, label: category.name });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [allResults, categoryById]);

  const selectedCategoryOption = selectedCategory === "all"
    ? "all"
    : categoryOptions.find((option) => option.id === selectedCategory)
      ? selectedCategory
      : "all";

  // Apply filters + sort
  const visibleResults = useMemo(() => {
    let list = allResults;
    if (featuredOnly) list = list.filter((item) => item.featured);
    if (inStockOnly) list = list.filter((item) => availableCatalogItemIds.has(item._id));
    if (selectedCategoryOption !== "all") {
      list = list.filter((item) => item._categoryId === selectedCategoryOption);
    }
    const sorted = [...list];
    switch (sortBy) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "rating": {
        const ratings = ratingsMap as Record<string, { average: number; count: number }> | undefined;
        sorted.sort((a, b) => {
          const ra = ratings?.[a._id];
          const rb = ratings?.[b._id];
          const countDiff = (rb?.count ?? 0) - (ra?.count ?? 0);
          if (countDiff !== 0) return countDiff;
          return (rb?.average ?? 0) - (ra?.average ?? 0);
        });
        break;
      }
      case "relevance":
        break;
    }
    return sorted;
  }, [allResults, featuredOnly, inStockOnly, selectedCategoryOption, sortBy, availableCatalogItemIds, ratingsMap]);

  const filtersActive = featuredOnly || inStockOnly || selectedCategory !== "all" || sortBy !== "relevance";

  const clearFilters = useCallback(() => {
    setSortBy("relevance");
    setFeaturedOnly(false);
    setInStockOnly(false);
    setSelectedCategory("all");
  }, []);

  // Group filtered results by BU
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const item of visibleResults) {
      const key = item._businessUnitName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [visibleResults]);

  // State flags
  const isBUsLoading = activeBUs === undefined;
  const isResultsLoading = isSearching && buIds.length > 0 && (
    searchResults0 === undefined ||
    (buIds.length > 1 && searchResults1 === undefined) ||
    (buIds.length > 2 && searchResults2 === undefined) ||
    (buIds.length > 3 && searchResults3 === undefined)
  );
  const isLoading = isBUsLoading || isResultsLoading;
  const hasResults = allResults.length > 0;
  const hasVisibleResults = visibleResults.length > 0;

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* Search Header */}
      <div className="sticky top-16 z-40 border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitSearch(searchInput);
              }}
              placeholder={`Search ${SITE_NAME}...`}
              className="h-11 w-full rounded-xl border border-border/60 bg-secondary/30 pl-10 pr-10 text-sm transition-colors placeholder:text-muted-foreground focus:border-accent/40 focus:bg-background focus:outline-none"
              aria-label="Search products"
              autoFocus
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setDebouncedQuery("");
                  setSearchParams({}, { replace: true });
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter + Sort Bar */}
          {isSearching && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
              <div className="relative flex shrink-0 items-center">
                <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SearchSort)}
                  aria-label="Sort results"
                  className="h-8 appearance-none rounded-full border border-border/60 bg-card pl-7 pr-6 text-xs font-medium transition-colors focus:border-primary/40 focus:outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {categoryOptions.length > 0 && (
                <div className="relative flex shrink-0 items-center">
                  <Filter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    value={selectedCategoryOption}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label="Filter by category"
                    className="h-8 appearance-none rounded-full border border-border/60 bg-card pl-7 pr-6 text-xs font-medium transition-colors focus:border-primary/40 focus:outline-none"
                  >
                    <option value="all">All Categories</option>
                    {categoryOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => setFeaturedOnly((value) => !value)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                  featuredOnly
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Featured
              </button>

              <button
                onClick={() => setInStockOnly((value) => !value)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                  inStockOnly
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <PackageCheck className="h-3.5 w-3.5" />
                In Stock
              </button>

              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="h-8 shrink-0 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait">
          {/* ================================================================ */}
          {/* IDLE STATE — Recent + Popular                                    */}
          {/* ================================================================ */}
          {!isSearching && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Recently Viewed Items */}
              {recentlyViewedSuggestions.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Recently Viewed
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {recentlyViewedSuggestions.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSubmitSearch(item.name)}
                        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-secondary/60"
                      >
                        <History className="h-3 w-3 text-muted-foreground/60" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Recent Searches
                    </h2>
                    <button
                      onClick={handleClearRecent}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((q) => (
                      <div
                        key={q}
                        className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm transition-colors hover:bg-secondary/60"
                      >
                        <button
                          onClick={() => handleSubmitSearch(q)}
                          className="flex items-center gap-1.5"
                        >
                          <Clock className="h-3 w-3 text-muted-foreground/60" />
                          <span>{q}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentItem(q);
                          }}
                          className="ml-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
                          aria-label={`Remove ${q} from recent searches`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Popular Categories */}
              {popularCategories.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    Popular Categories
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {popularCategories.map((category) => {
                      const buSlug = buSlugById.get(category.businessUnitId);
                      return (
                        <Link
                          key={category._id}
                          to={
                            buSlug
                              ? `/${buSlug}/${category.slug}`
                              : `/search?q=${encodeURIComponent(category.name)}`
                          }
                          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-secondary/60"
                        >
                          <LayoutGrid className="h-3 w-3 text-muted-foreground/60" />
                          <span>{category.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Trending Searches */}
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Trending Searches
                </h2>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleSubmitSearch(tag)}
                      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-secondary/60"
                    >
                      <TrendingUp className="h-3 w-3 text-primary/60" />
                      <span>{tag}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Hint */}
              <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
                <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Start typing to search across all stores
                </p>
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* LOADING STATE                                                    */}
          {/* ================================================================ */}
          {isSearching && isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <Skeleton className="h-4 w-48" />
              {Array.from({ length: 4 }).map((_, i) => (
                <ResultCardSkeleton key={i} />
              ))}
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* NO RESULTS                                                       */}
          {/* ================================================================ */}
          {isSearching && !isLoading && !hasResults && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                title={`No results found for "${debouncedQuery}"`}
                description="Try different keywords or browse our stores directly."
                icon={Search}
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                    Browse Stores
                  </Button>
                }
              />
              {didYouMean && didYouMean.toLowerCase() !== debouncedQuery.trim().toLowerCase() && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Did you mean
                  </span>
                  <button
                    onClick={() => handleSubmitSearch(didYouMean)}
                    className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Search className="h-3 w-3" />
                    {didYouMean}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* SEARCH RESULTS                                                   */}
          {/* ================================================================ */}
          {isSearching && !isLoading && hasResults && !hasVisibleResults && (
            <motion.div
              key="filtered-empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                title="No matches for your filters"
                description="Try adjusting or clearing the filters to see more results."
                icon={Filter}
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                }
              />
            </motion.div>
          )}

          {isSearching && !isLoading && hasResults && hasVisibleResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {visibleResults.length} result{visibleResults.length === 1 ? "" : "s"} for &quot;{debouncedQuery}&quot;
                </p>
                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {Object.entries(groupedResults).map(([buName, items]) => (
                <section key={buName}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {buName}
                  </h2>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <ResultCard
                        key={item._id}
                        item={item}
                        query={debouncedQuery}
                        ratings={
                          ratingsMap as
                            | Record<string, { average: number; count: number }>
                            | undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
