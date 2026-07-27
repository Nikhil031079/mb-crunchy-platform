import { useState, memo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Category } from "@/types";

interface CategoryCardProps {
  category: Category;
  businessUnitSlug: string;
  index?: number;
  productCount?: number;
}

export const CategoryCard = memo(function CategoryCard({
  category,
  businessUnitSlug,
  index = 0,
  productCount,
}: CategoryCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const hasImage = (category.coverImage || category.images?.[0]) && !imageError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        to={`/${businessUnitSlug}/${category.slug}`}
        className="group block"
      >
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-2xl",
            "border border-border/40 bg-secondary/30",
            "transition-all duration-300",
            "group-hover:shadow-lg group-hover:-translate-y-0.5",
            "group-hover:border-accent/30"
          )}
        >
          {/* Background Image */}
          {hasImage ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-secondary" />
              )}
              <img
                src={category.coverImage || category.images![0]}
                alt={category.name}
                className={cn(
                  "h-full w-full object-cover transition-all duration-500",
                  "group-hover:scale-110",
                  imageLoaded ? "opacity-100" : "opacity-0"
                )}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-secondary via-secondary/80 to-secondary/60">
              <FolderOpen className="h-12 w-12 text-muted-foreground/20 transition-transform duration-300 group-hover:scale-110" />
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Content Overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-3.5">
            <div className="flex items-end justify-between">
              <div>
                <h3 className="text-sm font-bold text-white leading-tight drop-shadow-sm">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="mt-0.5 text-[11px] text-white/70 line-clamp-1 drop-shadow-sm">
                    {category.description}
                  </p>
                )}
              </div>
              {productCount !== undefined && (
                <span className="shrink-0 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white">
                  {productCount} items
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export function CategoryCardSkeleton() {
  return (
    <div className="aspect-[4/3] animate-pulse rounded-2xl bg-secondary" />
  );
}
