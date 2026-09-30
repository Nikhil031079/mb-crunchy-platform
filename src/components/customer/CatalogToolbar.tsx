import { ArrowUpDown, Grid3X3, List } from "lucide-react";

import { cn } from "@/lib/utils";
import { SORT_OPTIONS, type SortOption } from "@/lib/catalog";

import { SearchBar } from "@/components/shared/SearchBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// CatalogToolbar — the ONE search / sort / view controls row.
//
// BusinessUnitPage and CategoryPage previously each carried their own copy of
// this bar (Phase 21C). Only the outer page chrome differs; the controls are
// identical, so they live here now.
//
// The bar is intentionally uncontrolled: `SearchBar` keeps its own input state
// and reports through `onSearch`, exactly as before.
// ============================================================================

export type CatalogViewMode = "grid" | "list";

interface CatalogToolbarProps {
  /** Search input placeholder, e.g. "Search MB Kitchen..." */
  placeholder: string;
  onSearch: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  viewMode: CatalogViewMode;
  onViewModeChange: (value: CatalogViewMode) => void;
}

export function CatalogToolbar({
  placeholder,
  onSearch,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: CatalogToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="w-full sm:max-w-sm">
        <SearchBar placeholder={placeholder} onSearch={onSearch} />
      </div>

      {/* Sort + view toggle */}
      <div className="flex items-center gap-2">
        <Select value={sortBy} onValueChange={(val) => onSortChange(val as SortOption)}>
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

        <div className="flex overflow-hidden rounded-xl border border-border/60 bg-white/50 dark:bg-white/5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "h-11 w-11 rounded-none",
              viewMode === "grid"
                ? "bg-culinary-primary/10 text-culinary-primary-deep dark:text-culinary-primary"
                : "text-muted-foreground",
            )}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewModeChange("list")}
            className={cn(
              "h-11 w-11 rounded-none border-l border-border/60",
              viewMode === "list"
                ? "bg-culinary-primary/10 text-culinary-primary-deep dark:text-culinary-primary"
                : "text-muted-foreground",
            )}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
