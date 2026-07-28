import { useState, memo } from "react";
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
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { Category } from "@/types";

const CATEGORY_GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-orange-400 to-red-500",
  "from-blue-400 to-indigo-500",
  "from-purple-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
  "from-rose-400 to-red-500",
  "from-lime-400 to-green-500",
  "from-fuchsia-400 to-purple-500",
  "from-sky-400 to-blue-500",
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

function getCategoryGradient(name: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_GRADIENTS[Math.abs(hash) % CATEGORY_GRADIENTS.length];
}

function getCategoryIcon(name: string, index: number) {
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

  const gradient = getCategoryGradient(category.name, index);
  const Icon = getCategoryIcon(category.name, index);

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
            "border border-border/40",
            "transition-all duration-300",
            "group-hover:shadow-lg group-hover:-translate-y-0.5",
            "group-hover:border-accent/30"
          )}
        >
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
            <div className={cn(
              "flex h-full items-center justify-center bg-gradient-to-br",
              gradient,
              "transition-transform duration-300 group-hover:scale-105"
            )}>
              <Icon className="h-12 w-12 text-white/80 drop-shadow-lg transition-transform duration-300 group-hover:scale-110" />
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
