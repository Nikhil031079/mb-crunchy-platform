import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Search, X, Clock, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { debounce } from "@/utils";
import { STORAGE_KEYS } from "@/constants";

// ============================================================================
// Recent Searches — localStorage persistence
// ============================================================================

const RECENT_SEARCHES_KEY = "mb-crunchy-recent-searches";
const MAX_RECENT = 8;

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

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Storage unavailable
  }
}

// ============================================================================
// SearchBarProps
// ============================================================================

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  className?: string;
  autoFocus?: boolean;
  /** Show dropdown with recent/suggested searches */
  showDropdown?: boolean;
  /** Trending search suggestions */
  suggestions?: string[];
}

export function SearchBar({
  placeholder = "Search...",
  onSearch,
  className,
  autoFocus = false,
  showDropdown = true,
  suggestions = [],
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep a ref to the latest onSearch to avoid stale closures
  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      searchRef.current(query);
    }, 300),
    []
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    debouncedSearch(newValue);
  }, [debouncedSearch]);

  const handleSubmit = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed) {
      saveRecentSearch(trimmed);
      setRecentSearches(getRecentSearches());
    }
    setValue(trimmed);
    onSearch(trimmed);
    setIsFocused(false);
    inputRef.current?.blur();
  }, [onSearch]);

  const handleClear = useCallback(() => {
    setValue("");
    onSearch("");
    inputRef.current?.focus();
  }, [onSearch]);

  const handleRecentClick = useCallback((query: string) => {
    handleSubmit(query);
  }, [handleSubmit]);

  const handleSuggestionClick = useCallback((query: string) => {
    handleSubmit(query);
  }, [handleSubmit]);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const showDropdownMenu = showDropdown && isFocused && !value.trim();

  const filteredRecent = useMemo(() => {
    if (!value.trim()) return recentSearches;
    const q = value.toLowerCase();
    return recentSearches.filter((s) => s.toLowerCase().includes(q));
  }, [recentSearches, value]);

  const filteredSuggestions = useMemo(() => {
    if (!suggestions.length) return [];
    if (!value.trim()) return suggestions.slice(0, 5);
    const q = value.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 5);
  }, [suggestions, value]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit(value);
            }
            if (e.key === "Escape") {
              setIsFocused(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          className="h-10 pl-9 pr-8 rounded-xl border-border/60 bg-secondary/30 focus:bg-background focus:border-accent/40 transition-colors"
          autoFocus={autoFocus}
          aria-label="Search"
          aria-expanded={showDropdownMenu}
          role="combobox"
          aria-autocomplete="list"
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showDropdownMenu && (filteredRecent.length > 0 || filteredSuggestions.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl"
          >
            {/* Recent Searches */}
            {filteredRecent.length > 0 && (
              <div className="p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recent
                  </span>
                  <button
                    onClick={handleClearRecent}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {filteredRecent.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleRecentClick(query)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="truncate">{query}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            {filteredRecent.length > 0 && filteredSuggestions.length > 0 && (
              <div className="mx-2 border-t border-border/40" />
            )}

            {/* Trending Suggestions */}
            {filteredSuggestions.length > 0 && (
              <div className="p-2">
                <span className="block px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Popular
                </span>
                {filteredSuggestions.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleSuggestionClick(query)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    <TrendingUp className="h-3.5 w-3.5 shrink-0 text-accent opacity-60" />
                    <span className="truncate">{query}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
