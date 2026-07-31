import { useState, memo, createElement } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  Apple,
  Beef,
  Coffee,
  IceCreamBowl,
  Milk,
  Wheat,
  Salad,
  Cookie,
  Soup,
  Drumstick,
  Fish,
  Cherry,
  LeafyGreen,
  Bean,
  Egg,
  Utensils,
  ArrowUpRight,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Category } from "@/types";

const CATEGORY_GRADIENTS = [
  "from-emerald-500 via-emerald-600 to-teal-700",
  "from-orange-400 via-orange-500 to-red-600",
  "from-blue-500 via-indigo-500 to-indigo-600",
  "from-purple-500 via-purple-600 to-pink-600",
  "from-amber-400 via-amber-500 to-orange-600",
  "from-cyan-500 via-cyan-600 to-blue-700",
  "from-rose-400 via-rose-500 to-red-600",
  "from-lime-400 via-lime-500 to-green-600",
  "from-fuchsia-500 via-fuchsia-600 to-purple-700",
  "from-sky-400 via-sky-500 to-blue-600",
];

const CATEGORY_ICONS = [
  Apple,
  Beef,
  Coffee,
  IceCreamBowl,
  Milk,
  Wheat,
  Salad,
  Cookie,
  Soup,
  Drumstick,
  Fish,
  Cherry,
  LeafyGreen,
  Bean,
  Egg,
  Utensils,
];

function getCategoryGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_GRADIENTS[Math.abs(hash) % CATEGORY_GRADIENTS.length];
}

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("fruit") || lower.includes("apple") || lower.includes("banana") || lower.includes("berry")) return Apple;
  if (lower.includes("meat") || lower.includes("beef") || lower.includes("chicken") || lower.includes("mutton")) return Beef;
  if (lower.includes("beverage") || lower.includes("drink") || lower.includes("juice") || lower.includes("coffee") || lower.includes("tea")) return Coffee;
  if (lower.includes("ice") || lower.includes("cream") || lower.includes("frozen") || lower.includes("dessert")) return IceCreamBowl;
  if (lower.includes("milk") || lower.includes("dairy") || lower.includes("paneer") || lower.includes("cheese")) return Milk;
  if (lower.includes("grain") || lower.includes("rice") || lower.includes("wheat") || lower.includes("atta") || lower.includes("dal")) return Wheat;
  if (lower.includes("salad") || lower.includes("green") || lower.includes("leafy") || lower.includes("veggie")) return Salad;
  if (lower.includes("snack") || lower.includes("cookie") || lower.includes("biscuit") || lower.includes("namkeen")) return Cookie;
  if (lower.includes("soup") || lower.includes("ready") || lower.includes("instant")) return Soup;
  if (lower.includes("poultry") || lower.includes("egg") || lower.includes("non-veg")) return Drumstick;
  if (lower.includes("sea") || lower.includes("fish") || lower.includes("prawn")) return Fish;
  if (lower.includes("sweet") || lower.includes("sugar") || lower.includes("candy")) return Cherry;
  if (lower.includes("organic") || lower.includes("natural")) return LeafyGreen;
  if (lower.includes("pulse") || lower.includes("spice") || lower.includes("masala")) return Bean;
  return CATEGORY_ICONS[Math.abs(hashString(name)) % CATEGORY_ICONS.length];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/**
 * CategoryIcon — renders the icon for a category. Prefers an explicit icon
 * (e.g. from the category catalog), falling back to a name-based lookup.
 */
export function CategoryIcon({
  icon,
  name,
  className,
}: {
  icon?: LucideIcon;
  name: string;
  className?: string;
}) {
  return createElement(icon ?? getCategoryIcon(name), { className });
}

interface CategoryCardProps {
  category: Category;
  businessUnitSlug: string;
  index?: number;
  productCount?: number;
  /** Explicit icon (from the category catalog) — falls back to name lookup */
  icon?: LucideIcon;
  /** Explicit gradient (acts as placeholder image) — falls back to name lookup */
  gradient?: string;
  /** Show a "Featured" badge */
  featured?: boolean;
  /** When provided, intercepts navigation and calls this instead (e.g. smooth scroll) */
  onClick?: () => void;
}

export const CategoryCard = memo(function CategoryCard({
  category,
  businessUnitSlug,
  index = 0,
  productCount,
  icon,
  gradient: gradientProp,
  featured = false,
  onClick,
}: CategoryCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const hasImage = (category.coverImage || category.images?.[0]) && !imageError;

  const gradient = gradientProp ?? getCategoryGradient(category.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="h-full"
    >
      <Link
        to={`/${businessUnitSlug}/${category.slug}`}
        onClick={(e) => {
          if (onClick) {
            e.preventDefault();
            onClick();
          }
        }}
        className="group block h-full"
      >
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-2xl",
            "border border-border/40",
            "transition-all duration-300 ease-out",
            "group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/10",
            "group-hover:border-accent/30"
          )}
        >
          {/* Featured Badge */}
          {featured && (
            <div className="absolute left-2.5 top-2.5 z-10">
              <span className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300 backdrop-blur-sm">
                <Star className="h-2.5 w-2.5 fill-current" />
                Featured
              </span>
            </div>
          )}

          {/* Background Image */}
          {hasImage ? (
            <>
              {!imageLoaded && (
                <div className={cn("absolute inset-0 animate-pulse bg-gradient-to-br", gradient)} />
              )}
              <img
                src={category.coverImage || category.images![0]}
                alt={category.name}
                className={cn(
                  "h-full w-full object-cover transition-all duration-500 ease-out",
                  "group-hover:scale-110",
                  imageLoaded ? "opacity-100" : "opacity-0"
                )}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            </>
          ) : (
            <div
              className={cn(
                "flex h-full items-center justify-center bg-gradient-to-br",
                gradient,
                "transition-transform duration-500 ease-out group-hover:scale-105"
              )}
            >
              <div className="relative">
                <CategoryIcon
                  icon={icon}
                  name={category.name}
                  className="h-12 w-12 text-white/90 drop-shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                />
              </div>
            </div>
          )}

          {/* Shine sweep on hover */}
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

          {/* Content Overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-3.5">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-white leading-tight drop-shadow-sm">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70 drop-shadow-sm">
                    {category.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {productCount !== undefined && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {productCount}
                  </span>
                )}
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-all duration-300 group-hover:bg-white group-hover:text-accent">
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
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
