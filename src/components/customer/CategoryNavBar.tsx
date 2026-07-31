import { memo } from "react";

import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/shared/CategoryCard";

import type { EnrichedCategory } from "@/data/categories";

// ============================================================================
// CategoryNavBar — sticky horizontal-scroll category navigation
// ============================================================================

interface CategoryNavBarProps {
  categories: EnrichedCategory[];
  /** Currently active category id (highlighted) */
  activeId: string;
  /** Product count per category id */
  counts?: Record<string, number>;
  onSelect: (categoryId: string) => void;
  className?: string;
}

export const CategoryNavBar = memo(function CategoryNavBar({
  categories,
  activeId,
  counts,
  onSelect,
  className,
}: CategoryNavBarProps) {
  if (categories.length === 0) return null;

  return (
    <div
      className={cn(
        "sticky top-16 z-40 border-b border-border/40 bg-background/85 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70",
        className
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none"
          role="tablist"
          aria-label="Categories"
        >
          {categories.map((cat) => {
            const isActive = cat._id === activeId;
            const count = counts?.[cat._id] ?? 0;
            return (
              <button
                key={cat._id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(cat._id)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  isActive
                    ? "border-accent bg-accent text-white shadow-sm"
                    : "border-border/60 bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-white",
                    cat.catalog?.gradient ?? "from-secondary to-secondary"
                  )}
                >
                  <CategoryIcon
                    icon={cat.catalog?.icon}
                    name={cat.name}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <span className="whitespace-nowrap">{cat.name}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
