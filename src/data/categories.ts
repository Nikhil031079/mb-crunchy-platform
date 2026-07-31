import type { LucideIcon } from "lucide-react";
import {
  Pizza,
  Hamburger,
  Sandwich,
  UtensilsCrossed,
  HandPlatter,
  Croissant,
  Soup,
  Drumstick,
  Martini,
  CupSoda,
  IceCreamBowl,
  CakeSlice,
  Combine,
  PartyPopper,
  Droplet,
  Flower2,
  Container,
  Wheat,
  Cherry,
  CandyCane,
  CookingPot,
  Bean,
  Flame,
  Sprout,
  Salad,
  Zap,
  GlassWater,
  ShoppingBasket,
} from "lucide-react";

import type { Category } from "@/types";

// ============================================================================
// Category Catalog — canonical metadata for every planned category.
//
// The database stores name/slug/description/displayOrder. Icon, placeholder
// gradient and featured flags are presentation concerns, so they live here
// (client-side only, no backend changes). Every category shown in the UI is
// "enriched" with its catalog entry.
// ============================================================================

export interface CategoryCatalog {
  /** Stable lookup key */
  key: string;
  /** Canonical category name */
  name: string;
  /** Canonical slug (used to match database categories) */
  slug: string;
  /** Default description shown when the database has none */
  description: string;
  /** Curated "featured" flag used for badges + emphasis */
  featured: boolean;
  /** Planned sort order */
  displayOrder: number;
  /** Lucide icon */
  icon: LucideIcon;
  /** Tailwind gradient classes — acts as the placeholder image */
  gradient: string;
  /** Keywords used to match loosely-named database categories */
  keywords: string[];
}

export type EnrichedCategory = Category & { catalog?: CategoryCatalog };

// ============================================================================
// Kitchen Categories
// ============================================================================

export const KITCHEN_CATEGORY_CATALOG: CategoryCatalog[] = [
  {
    key: "kitchen-pizza",
    name: "Pizza",
    slug: "pizza",
    description: "Wood-fired pizzas loaded with premium toppings",
    featured: true,
    displayOrder: 1,
    icon: Pizza,
    gradient: "from-red-500 via-orange-500 to-amber-500",
    keywords: ["pizza"],
  },
  {
    key: "kitchen-burger",
    name: "Burger",
    slug: "burger",
    description: "Juicy gourmet burgers with hand-crafted patties",
    featured: true,
    displayOrder: 2,
    icon: Hamburger,
    gradient: "from-amber-500 via-orange-600 to-red-600",
    keywords: ["burger", "hamburger"],
  },
  {
    key: "kitchen-sandwich",
    name: "Sandwich",
    slug: "sandwich",
    description: "Fresh, hearty sandwiches made to order",
    featured: false,
    displayOrder: 3,
    icon: Sandwich,
    gradient: "from-lime-500 via-green-600 to-emerald-700",
    keywords: ["sandwich", "sub", "wrap"],
  },
  {
    key: "kitchen-french-fries",
    name: "French Fries",
    slug: "french-fries",
    description: "Crispy golden fries, perfect as a side or snack",
    featured: false,
    displayOrder: 4,
    icon: UtensilsCrossed,
    gradient: "from-yellow-400 via-amber-500 to-orange-600",
    keywords: ["french fry", "fries", "chips", "french fries"],
  },
  {
    key: "kitchen-pasta",
    name: "Pasta",
    slug: "pasta",
    description: "Pasta bowls tossed with rich, flavourful sauces",
    featured: false,
    displayOrder: 5,
    icon: HandPlatter,
    gradient: "from-rose-500 via-red-600 to-orange-700",
    keywords: ["pasta", "spaghetti", "macaroni", "penne"],
  },
  {
    key: "kitchen-garlic-bread",
    name: "Garlic Bread",
    slug: "garlic-bread",
    description: "Buttery, garlicky breads baked fresh",
    featured: false,
    displayOrder: 6,
    icon: Croissant,
    gradient: "from-orange-400 via-amber-500 to-yellow-600",
    keywords: ["garlic bread", "garlic"],
  },
  {
    key: "kitchen-momos",
    name: "Momos",
    slug: "momos",
    description: "Steamed and fried momos with spicy chutneys",
    featured: false,
    displayOrder: 7,
    icon: Soup,
    gradient: "from-teal-500 via-cyan-600 to-blue-700",
    keywords: ["momo"],
  },
  {
    key: "kitchen-nuggets",
    name: "Nuggets",
    slug: "nuggets",
    description: "Crispy chicken nuggets and bite-sized treats",
    featured: false,
    displayOrder: 8,
    icon: Drumstick,
    gradient: "from-amber-600 via-orange-700 to-red-800",
    keywords: ["nugget"],
  },
  {
    key: "kitchen-mojitos",
    name: "Mojitos",
    slug: "mojitos",
    description: "Chilled, refreshing mojitos in exciting flavours",
    featured: true,
    displayOrder: 9,
    icon: Martini,
    gradient: "from-fuchsia-500 via-purple-600 to-indigo-700",
    keywords: ["mojito"],
  },
  {
    key: "kitchen-thick-shakes",
    name: "Thick Shakes",
    slug: "thick-shakes",
    description: "Creamy, indulgent thick shakes",
    featured: false,
    displayOrder: 10,
    icon: CupSoda,
    gradient: "from-pink-500 via-rose-500 to-red-600",
    keywords: ["shake", "thick shake", "milkshake", "smoothie"],
  },
  {
    key: "kitchen-ice-cream",
    name: "Ice Cream",
    slug: "ice-cream",
    description: "Premium ice creams in classic and fun flavours",
    featured: false,
    displayOrder: 11,
    icon: IceCreamBowl,
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    keywords: ["ice cream", "icecream", "ice-cream"],
  },
  {
    key: "kitchen-desserts",
    name: "Desserts",
    slug: "desserts",
    description: "Sweet treats to end your meal on a high note",
    featured: false,
    displayOrder: 12,
    icon: CakeSlice,
    gradient: "from-pink-400 via-fuchsia-500 to-purple-600",
    keywords: ["dessert", "sweet"],
  },
  {
    key: "kitchen-combos",
    name: "Combos",
    slug: "combos",
    description: "Curated meal combos that give you more for less",
    featured: true,
    displayOrder: 13,
    icon: Combine,
    gradient: "from-emerald-500 via-teal-600 to-cyan-700",
    keywords: ["combo", "meal combo"],
  },
  {
    key: "kitchen-party-packs",
    name: "Party Packs",
    slug: "party-packs",
    description: "Shareable packs perfect for gatherings and events",
    featured: false,
    displayOrder: 14,
    icon: PartyPopper,
    gradient: "from-purple-500 via-fuchsia-600 to-pink-600",
    keywords: ["party pack", "party"],
  },
];

// ============================================================================
// Mart Categories
// ============================================================================

export const MART_CATEGORY_CATALOG: CategoryCatalog[] = [
  {
    key: "mart-cold-pressed-oils",
    name: "Cold Pressed Oils",
    slug: "cold-pressed-oils",
    description: "Wood-pressed oils that keep every nutrient intact",
    featured: true,
    displayOrder: 1,
    icon: Droplet,
    gradient: "from-yellow-500 via-amber-600 to-orange-700",
    keywords: ["oil", "cold pressed", "wood pressed", "mustard oil", "coconut oil"],
  },
  {
    key: "mart-honey",
    name: "Honey",
    slug: "honey",
    description: "Pure, unadulterated honey straight from the hive",
    featured: false,
    displayOrder: 2,
    icon: Flower2,
    gradient: "from-amber-400 via-yellow-500 to-orange-600",
    keywords: ["honey", "forest honey", "wild honey"],
  },
  {
    key: "mart-pickles",
    name: "Pickles",
    slug: "pickles",
    description: "Traditional homemade-style pickles full of flavour",
    featured: false,
    displayOrder: 3,
    icon: Container,
    gradient: "from-orange-500 via-red-600 to-rose-700",
    keywords: ["pickle", "achar", "achaar", "murabba"],
  },
  {
    key: "mart-millets",
    name: "Millets",
    slug: "millets",
    description: "Wholesome millets for healthy everyday cooking",
    featured: true,
    displayOrder: 4,
    icon: Wheat,
    gradient: "from-yellow-600 via-amber-700 to-orange-800",
    keywords: ["millet", "raagi", "bajra", "jowar"],
  },
  {
    key: "mart-dry-fruits",
    name: "Dry Fruits",
    slug: "dry-fruits",
    description: "Premium nuts and dry fruits, hand-selected",
    featured: true,
    displayOrder: 5,
    icon: Cherry,
    gradient: "from-rose-500 via-red-600 to-amber-700",
    keywords: ["dry fruit", "dryfruits", "nuts", "cashew", "almond", "raisin"],
  },
  {
    key: "mart-jaggery",
    name: "Jaggery",
    slug: "jaggery",
    description: "Natural unrefined jaggery for a healthier sweetener",
    featured: false,
    displayOrder: 6,
    icon: CandyCane,
    gradient: "from-amber-600 via-yellow-700 to-orange-800",
    keywords: ["jaggery", "gur", "gud"],
  },
  {
    key: "mart-rice",
    name: "Rice",
    slug: "rice",
    description: "Fine-grain rice for everyday meals",
    featured: false,
    displayOrder: 7,
    icon: CookingPot,
    gradient: "from-stone-400 via-stone-500 to-zinc-600",
    keywords: ["rice", "basmati", "sona masoori"],
  },
  {
    key: "mart-pulses",
    name: "Pulses",
    slug: "pulses",
    description: "Protein-rich dals and pulses, carefully cleaned",
    featured: false,
    displayOrder: 8,
    icon: Bean,
    gradient: "from-green-600 via-emerald-700 to-teal-800",
    keywords: ["pulse", "dal", "dals", "lentil", "chana", "moong", "toor"],
  },
  {
    key: "mart-spices",
    name: "Spices",
    slug: "spices",
    description: "Aromatic whole and ground spices for your kitchen",
    featured: false,
    displayOrder: 9,
    icon: Flame,
    gradient: "from-red-500 via-rose-600 to-orange-700",
    keywords: ["spice", "masala", "turmeric", "cumin", "chilli"],
  },
  {
    key: "mart-herbal-products",
    name: "Herbal Products",
    slug: "herbal-products",
    description: "Natural herbal wellness products",
    featured: false,
    displayOrder: 10,
    icon: Sprout,
    gradient: "from-green-500 via-emerald-600 to-teal-700",
    keywords: ["herbal", "herb", "ayurvedic", "wellness"],
  },
  {
    key: "mart-healthy-snacks",
    name: "Healthy Snacks",
    slug: "healthy-snacks",
    description: "Guilt-free snacking with healthy bites",
    featured: false,
    displayOrder: 11,
    icon: Salad,
    gradient: "from-lime-500 via-green-600 to-emerald-700",
    keywords: ["snack", "healthy snack", "granola", "energy bar"],
  },
  {
    key: "mart-instant-foods",
    name: "Instant Foods",
    slug: "instant-foods",
    description: "Quick-cook meals and ready-to-eat essentials",
    featured: false,
    displayOrder: 12,
    icon: Zap,
    gradient: "from-cyan-500 via-sky-600 to-blue-700",
    keywords: ["instant", "ready to eat", "instant noodles", "maggi"],
  },
  {
    key: "mart-beverages",
    name: "Beverages",
    slug: "beverages",
    description: "Everyday drinks, juices and refreshments",
    featured: true,
    displayOrder: 13,
    icon: GlassWater,
    gradient: "from-blue-500 via-indigo-600 to-violet-700",
    keywords: ["beverage", "drink", "juice", "cold drink", "water"],
  },
  {
    key: "mart-daily-essentials",
    name: "Daily Essentials",
    slug: "daily-essentials",
    description: "Your everyday household essentials, all in one place",
    featured: false,
    displayOrder: 14,
    icon: ShoppingBasket,
    gradient: "from-indigo-500 via-blue-600 to-sky-700",
    keywords: ["essential", "daily", "household", "staples", "grocery"],
  },
];

// ============================================================================
// Helpers
// ============================================================================

export function getCategoryCatalog(buSlug?: string | null): CategoryCatalog[] {
  const slug = buSlug?.toLowerCase() ?? "";
  if (slug.includes("kitchen") || slug.includes("food") || slug.includes("restaurant")) {
    return KITCHEN_CATEGORY_CATALOG;
  }
  if (slug.includes("mart") || slug.includes("grocery") || slug.includes("store")) {
    return MART_CATEGORY_CATALOG;
  }
  return [...KITCHEN_CATEGORY_CATALOG, ...MART_CATEGORY_CATALOG];
}

export function findCategoryCatalog(
  catalog: CategoryCatalog[],
  category: { slug?: string; name: string }
): CategoryCatalog | undefined {
  const slug = category.slug?.toLowerCase();
  const name = category.name.toLowerCase();
  return (
    catalog.find((c) => c.slug === slug) ??
    catalog.find((c) => c.keywords.some((k) => name.includes(k) || slug?.includes(k)))
  );
}

export function enrichCategory(
  category: Category,
  catalog: CategoryCatalog[]
): EnrichedCategory {
  const entry = findCategoryCatalog(catalog, category);
  return entry ? { ...category, catalog: entry } : category;
}
