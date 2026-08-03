import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import {
  Sun,
  CloudRain,
  Snowflake,
  Gift,
  UtensilsCrossed,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAddToCart } from "@/hooks/use-add-to-cart";
import { getSeasonalContext, mergeUniqueById } from "@/utils";
import type { SeasonalContext } from "@/utils";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// SeasonalSection — automatically surfaces a themed product row driven by the
// current date/time (festival banners, weekend specials, evening snacks,
// summer drinks). No admin configuration required.
// ============================================================================

interface SeasonalConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  keywords: string[];
}

function getSeasonalConfig(context: SeasonalContext): SeasonalConfig | null {
  if (context.season === "festival") {
    return {
      eyebrow: "Festive Season",
      title: "Festive Favourites",
      subtitle: "Celebration-ready picks for the season",
      icon: Gift,
      keywords: ["festival", "festive", "diwali", "holi", "gift", "sweet", "combo", "party"],
    };
  }
  if (context.isEvening) {
    return {
      eyebrow: "Evening Cravings",
      title: "Evening Snacks",
      subtitle: "Perfect munchies for your evening",
      icon: UtensilsCrossed,
      keywords: ["snack", "evening", "fry", "pakora", "chai", "tea", "noodle", "roll"],
    };
  }
  if (context.isWeekend) {
    return {
      eyebrow: "Weekend Deals",
      title: "Weekend Specials",
      subtitle: "Treat yourself — it's the weekend",
      icon: PartyPopper,
      keywords: ["weekend", "family", "combo", "party", "family-pack", "special"],
    };
  }
  switch (context.season) {
    case "summer":
      return {
        eyebrow: "Season's Special",
        title: "Cool Summer Drinks & Treats",
        subtitle: "Refreshing picks to beat the heat",
        icon: Sun,
        keywords: ["summer", "drink", "cool", "refresh", "juice", "smoothie", "ice", "soda"],
      };
    case "monsoon":
      return {
        eyebrow: "Monsoon Munchies",
        title: "Rainy-Day Comforts",
        subtitle: "Hot, crispy and comforting",
        icon: CloudRain,
        keywords: ["monsoon", "snack", "pakora", "fry", "chai", "tea", "soup"],
      };
    case "winter":
      return {
        eyebrow: "Winter Warmers",
        title: "Winter Comforts",
        subtitle: "Warm up with seasonal favourites",
        icon: Snowflake,
        keywords: ["winter", "soup", "coffee", "hot", "warm", "beverage"],
      };
    default:
      return null;
  }
}

interface SeasonalSectionProps {
  businessUnits: BusinessUnit[];
}

export function SeasonalSection({ businessUnits }: SeasonalSectionProps) {
  const handleAddToCart = useAddToCart();

  const config = useMemo(() => getSeasonalConfig(getSeasonalContext()), []);

  const targetBuIds = useMemo(() => {
    const buSet = new Set<string>();
    for (const bu of businessUnits) {
      buSet.add(bu._id);
      if (buSet.size >= 2) break;
    }
    return Array.from(buSet);
  }, [businessUnits]);

  const r0 = useQuery(
    api.catalogItems.getBestSellers,
    targetBuIds[0] ? { businessUnitId: targetBuIds[0] as Id<"businessUnits">, limit: 10 } : "skip",
  ) as CatalogItem[] | undefined;
  const r1 = useQuery(
    api.catalogItems.getBestSellers,
    targetBuIds[1] ? { businessUnitId: targetBuIds[1] as Id<"businessUnits">, limit: 10 } : "skip",
  ) as CatalogItem[] | undefined;

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  const handleAdd = useCallback(
    (product: CatalogItem | CardProduct) =>
      handleAddToCart(product as CatalogItem),
    [handleAddToCart],
  );

  const items = useMemo(() => {
    if (!config) return [];
    const all = mergeUniqueById(r0 ?? [], r1 ?? []);
    if (all.length === 0) return [];
    const matched = all.filter((item) =>
      item.tags.some((tag) => config.keywords.some((k) => tag.toLowerCase().includes(k)))
    );
    return matched.length >= 3
      ? matched.slice(0, 10)
      : mergeUniqueById(matched, all).slice(0, 10);
  }, [r0, r1, config]);

  if (!config || businessUnits.length === 0) return null;

  const isLoading =
    targetBuIds.length > 0 &&
    [r0, r1].slice(0, targetBuIds.length).some((result) => result === undefined);

  return (
    <ProductGridSection
      id="seasonal-picks"
      eyebrow={config.eyebrow}
      eyebrowIcon={config.icon}
      title={config.title}
      subtitle={config.subtitle}
      items={items}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      loading={isLoading}
      variant="secondary"
    />
  );
}
