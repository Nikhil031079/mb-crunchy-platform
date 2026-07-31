import { motion } from "framer-motion";
import { PackageOpen, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/shared/CategoryCard";

import type { LucideIcon } from "lucide-react";

// ============================================================================
// CategoryEmptyState — branded placeholder for categories with no products
// ============================================================================

interface CategoryEmptyStateProps {
  name: string;
  icon?: LucideIcon;
  gradient?: string;
  /** Scrolls to the next category that has products */
  onExploreOther?: () => void;
  /** Scrolls back to the category overview grid */
  onBrowseAll?: () => void;
  className?: string;
}

export function CategoryEmptyState({
  name,
  icon,
  gradient = "from-secondary to-secondary",
  onExploreOther,
  onBrowseAll,
  className,
}: CategoryEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-secondary/20 px-6 py-12 text-center",
        className
      )}
    >
      {/* Branded illustration */}
      <div className="relative mb-5">
        <div
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-lg",
            gradient
          )}
        >
          <CategoryIcon icon={icon} name={name} className="h-9 w-9" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm">
          <PackageOpen className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="absolute -bottom-1 -left-2 h-8 w-8 rounded-full bg-accent/10" />
        <div className="absolute -right-4 -bottom-2 h-5 w-5 rounded-full bg-accent/10" />
      </div>

      <h3 className="text-base font-semibold">{name} is on its way</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        We&apos;re busy stocking this category with fresh products. Check back
        soon or explore what else we have in store.
      </p>

      {(onExploreOther || onBrowseAll) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onExploreOther && (
            <Button onClick={onExploreOther} size="sm" className="gap-1.5">
              Explore Other Categories
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {onBrowseAll && (
            <Button onClick={onBrowseAll} variant="outline" size="sm">
              Browse All Categories
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
