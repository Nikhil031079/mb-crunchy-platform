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
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { formatCurrency, debounce } from "@/utils";
import { SITE_NAME } from "@/constants";

import { EmptyState } from "@/components/shared/EmptyState";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { BusinessUnit, CatalogItem } from "@/types";

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
// Enriched Search Result
// ============================================================================

interface SearchResult extends CatalogItem {
  _businessUnitName: string;
  _businessUnitSlug: string;
}

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

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

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
        });
      }
    }
    return enriched;
  }, [allRawResults, buIds, activeBUs]);

  // Group by BU
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const item of allResults) {
      const key = item._businessUnitName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [allResults]);

  // Collect all item IDs for ratings
  const resultIds = useMemo(() => allResults.map((item) => item._id as string), [allResults]);

  const ratingsMap = useQuery(
    api.reviews.getAverageByCatalogItemIds,
    resultIds.length > 0 ? { ids: resultIds as never[] } : "skip",
  );

  // State flags
  const isSearching = debouncedQuery.trim().length > 0;
  const isBUsLoading = activeBUs === undefined;
  const isResultsLoading = isSearching && buIds.length > 0 && (
    searchResults0 === undefined ||
    (buIds.length > 1 && searchResults1 === undefined) ||
    (buIds.length > 2 && searchResults2 === undefined) ||
    (buIds.length > 3 && searchResults3 === undefined)
  );
  const isLoading = isBUsLoading || isResultsLoading;
  const hasResults = allResults.length > 0;

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

              {/* Popular Suggestions */}
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Popular Searches
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
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* SEARCH RESULTS                                                   */}
          {/* ================================================================ */}
          {isSearching && !isLoading && hasResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <p className="text-sm text-muted-foreground">
                {allResults.length} result{allResults.length === 1 ? "" : "s"} for &quot;{debouncedQuery}&quot;
              </p>

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
