import { useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, ImageOff, TrendingUp } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { useAddToCart } from "@/hooks/use-add-to-cart";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// TrendingRailSection — Stitch-style horizontal trending rail (Phase 4D).
//
// Data comes from the EXISTING per-BU `catalogItems.getTrending` query
// (same call ProductPage already makes), issued once per visible business
// unit via fixed slots — no new backend query, no invented algorithm.
// The "Trending" label reflects the source query's meaning.
// Quick Add reuses the shared add-to-cart flow with a per-card
// duplicate-click guard — identical rules to every other section.
// ============================================================================

interface TrendingRailSectionProps {
  businessUnits: BusinessUnit[];
  onOpenItemDetails?: (item: CatalogItem) => void;
}

const RAIL_LIMIT = 6;
const RAIL_MAX_ITEMS = 8;
/** Below this, the rail is a plain row and carousel arrows would mislead. */
const RAIL_MIN_FOR_ARROWS = 4;

export function TrendingRailSection({
  businessUnits,
  onOpenItemDetails,
}: TrendingRailSectionProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const addCallback = useAddToCart();

  const buIds = useMemo(
    () => businessUnits.map((b) => b._id).slice(0, 2),
    [businessUnits],
  );

  // Fixed-slot pattern (cf. CartPage meal-deal slots): at most two BUs.
  const trending0 = useQuery(
    api.catalogItems.getTrending,
    buIds[0]
      ? { businessUnitId: buIds[0] as Id<"businessUnits">, limit: RAIL_LIMIT }
      : "skip",
  ) as CatalogItem[] | undefined;
  const trending1 = useQuery(
    api.catalogItems.getTrending,
    buIds[1]
      ? { businessUnitId: buIds[1] as Id<"businessUnits">, limit: RAIL_LIMIT }
      : "skip",
  ) as CatalogItem[] | undefined;

  const handleAddToCart = useCallback(
    (product: CatalogItem | CardProduct) => addCallback(product as CatalogItem),
    [addCallback],
  );

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: CatalogItem[] = [];
    const a = trending0 ?? [];
    const b = trending1 ?? [];
    for (let i = 0; i < Math.max(a.length, b.length) && out.length < RAIL_MAX_ITEMS; i++) {
      for (const item of [a[i], b[i]]) {
        if (item && !seen.has(item._id)) {
          seen.add(item._id);
          out.push(item);
        }
      }
    }
    return out;
  }, [trending0, trending1]);

  if (businessUnits.length === 0) return null;

  const isLoading =
    (buIds[0] !== undefined && trending0 === undefined) ||
    (buIds[1] !== undefined && trending1 === undefined);

  // Sparse-data rule (Phase 21C): with no products there is no heading and no
  // carousel affordance — the section disappears entirely.
  if (!isLoading && items.length === 0) return null;

  // 4+ cards → normal rail with arrows. 1–3 cards render without arrows.
  const showArrows = items.length >= RAIL_MIN_FOR_ARROWS;

  const scrollRail = (direction: 1 | -1) => {
    railRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  return (
    <section className="w-full py-10 sm:py-12" aria-label="Trending products">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-culinary-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-culinary-primary">
                Trending
              </span>
            </div>
            <h2 className="font-culinary-heading text-xl font-bold tracking-tight sm:text-2xl">
              Trending Now
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Popular across our stores
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showArrows && (
              <>
                <button
                  type="button"
                  onClick={() => scrollRail(-1)}
                  aria-label="Scroll trending products left"
                  className="glass-tier-1 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all hover:shadow-md active:scale-90"
                >
                  <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => scrollRail(1)}
                  aria-label="Scroll trending products right"
                  className="glass-tier-1 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all hover:shadow-md active:scale-90"
                >
                  <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden pb-4" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex min-w-[270px] animate-pulse items-center gap-3 rounded-2xl border border-border/50 p-3"
              >
                <div className="h-16 w-16 shrink-0 rounded-xl bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-secondary" />
                  <div className="h-3 w-1/3 rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? null : (
          <div
            ref={railRef}
            className="flex items-stretch gap-4 overflow-x-auto pb-4 scrollbar-none"
          >
            {items.map((item) => (
              <TrendingMiniCard
                key={item._id}
                item={item}
                onAdd={handleAddToCart}
                onOpen={onOpenItemDetails}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// TrendingMiniCard — 270px horizontal glass card with guarded Quick Add.
// ============================================================================

function TrendingMiniCard({
  item,
  onAdd,
  onOpen,
}: {
  item: CatalogItem;
  onAdd: (product: CatalogItem | CardProduct) => void | Promise<void>;
  onOpen?: (item: CatalogItem) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAdd(item);
    } finally {
      setIsAdding(false);
    }
  };

  const image = item.coverImage || item.thumbnail;

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `View ${item.name}` : undefined}
      onClick={onOpen ? () => onOpen(item) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(item);
              }
            }
          : undefined
      }
      className={cn(
        "glass-tier-1 flex min-w-[270px] max-w-[270px] items-center gap-3 rounded-2xl p-3 shadow-sm transition-shadow hover:shadow-md",
        onOpen && "cursor-pointer",
      )}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white bg-white p-1 shadow-inner">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-5 w-5 text-muted-foreground/30" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{item.name}</p>
        <p className="font-culinary-heading text-xs font-black text-culinary-primary">
          {formatCurrency(item.price)}
        </p>
        <button
          type="button"
          onClick={handleQuickAdd}
          disabled={isAdding}
          aria-label={isAdding ? `Adding ${item.name} to cart` : `Quick add ${item.name} to cart`}
          className="mt-1 flex items-center gap-0.5 text-[11px] font-bold text-culinary-primary transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-70"
        >
          {isAdding ? "Adding\u2026" : "+ Quick Add"}
        </button>
      </div>
    </div>
  );
}
