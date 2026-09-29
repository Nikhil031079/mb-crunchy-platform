import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, ChefHat, Store } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { Button } from "@/components/ui/button";

import type { BusinessUnit, CatalogItem } from "@/types";

// ============================================================================
// DualHeroSection — Stitch-style 12-column dual business-unit hero.
//
// LEFT (~7 cols): MB Kitchen dark culinary panel.
// RIGHT (~5 cols): MB Mart frosted glass panel.
//
// VISUAL rearrangement only. All content comes from existing data:
// - headings/CTAs/brand from existing hero props and BusinessUnit records
// - product visuals + prices from the best-sellers query the homepage
//   already fires (convex-react dedupes the identical call — no new
//   backend dependency, no fake products, no hardcoded prices).
// - tapping a product visual opens the existing ItemDetailsModal flow.
// ============================================================================

export interface DualHeroAction {
  label: string;
  href: string;
}

interface DualHeroSectionProps {
  title?: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  kitchenBU?: BusinessUnit | null;
  martBU?: BusinessUnit | null;
  kitchenAction?: DualHeroAction | null;
  martAction?: DualHeroAction | null;
  onOpenItemDetails?: (item: CatalogItem) => void;
}

function pickWithImage(
  items: CatalogItem[] | undefined,
  businessUnitId: string | undefined,
  count: number,
): CatalogItem[] {
  if (!items || !businessUnitId) return [];
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const item of items) {
    if (item.businessUnitId !== businessUnitId) continue;
    if (!item.coverImage && !item.thumbnail) continue;
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

export function DualHeroSection({
  title,
  subtitle,
  description,
  badge,
  kitchenBU,
  martBU,
  kitchenAction,
  martAction,
  onOpenItemDetails,
}: DualHeroSectionProps) {
  // Same query BestSellersSection already issues on this page — deduped,
  // so this component adds zero new backend dependencies.
  const bestSellersRaw = useQuery(
    api.catalogItems.getBestSellersAcrossBusinessUnits,
    { limit: 16 },
  ) as CatalogItem[] | undefined;

  const kitchenPick = useMemo(
    () => pickWithImage(bestSellersRaw, kitchenBU?._id, 1)[0],
    [bestSellersRaw, kitchenBU],
  );
  const martTrio = useMemo(
    () => pickWithImage(bestSellersRaw, martBU?._id, 3),
    [bestSellersRaw, martBU],
  );

  if (!kitchenBU && !martBU) return null;
  const dual = Boolean(kitchenBU && martBU);

  return (
    <section className="relative w-full overflow-hidden" aria-label="Featured stores">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Tagline pill — existing hero badge copy */}
        {badge && (
          <div className="mb-8 flex flex-wrap items-center gap-4">
            <span className="glass-tier-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-culinary-primary">
              {badge}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          {/* ============================================================ */}
          {/* LEFT — MB Kitchen dark culinary panel                        */}
          {/* ============================================================ */}
          {kitchenBU && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className={cn(
                "relative flex flex-col justify-between overflow-hidden rounded-3xl text-white",
                "border border-amber-500/30 bg-gradient-to-br from-[#27130a] via-[#381e0e] to-[#1e1008]",
                "p-8 shadow-[0_20px_50px_rgba(247,103,7,0.22)] sm:p-10",
                dual ? "lg:col-span-7" : "lg:col-span-12",
              )}
            >
              {/* Static ember glow accents (presentation only) */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-gradient-to-br from-amber-500/25 to-rose-600/20 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-orange-700/20 blur-3xl"
              />

              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-culinary-primary px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow-md">
                    <ChefHat className="h-[15px] w-[15px]" aria-hidden />
                    {kitchenBU.name}
                  </span>
                  {kitchenBU.enableDelivery && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs text-amber-200 backdrop-blur-md">
                      Fast local delivery
                    </span>
                  )}
                </div>

                <div className="max-w-lg">
                  <h1 className="font-culinary-heading text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    {title ?? `Welcome to ${SITE_NAME}`}
                  </h1>
                  {description && (
                    <p className="mt-4 max-w-md text-base leading-relaxed text-amber-100/90">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <div className="relative z-10 mt-10 flex flex-wrap items-center gap-4 border-t border-white/15 pt-6">
                {kitchenAction && (
                  <Link to={kitchenAction.href}>
                    <Button variant="crunch" size="lg" className="gap-2 px-7 text-sm font-bold">
                      {kitchenAction.label}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </Link>
                )}
              </div>

              {/* Floating product visual — real best-seller data + price */}
              {kitchenPick && (
                <KitchenPickBadge item={kitchenPick} onOpen={onOpenItemDetails} />
              )}
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* RIGHT — MB Mart frosted glass panel                           */}
          {/* ============================================================ */}
          {martBU && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className={cn(
                "glass-tier-2 relative flex flex-col justify-between overflow-hidden rounded-3xl p-8",
                dual ? "lg:col-span-5" : "lg:col-span-12",
              )}
            >
              <div className="relative z-10">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-culinary-primary-deep px-3 py-1 text-xs uppercase tracking-wider text-white shadow-sm">
                    <Store className="h-[14px] w-[14px]" aria-hidden />
                    {martBU.name}
                  </span>
                  {martBU.enableDelivery ? (
                    <span className="rounded-full bg-culinary-primary/15 px-2.5 py-0.5 text-xs font-bold text-culinary-primary">
                      Delivery
                    </span>
                  ) : martBU.enablePickup ? (
                    <span className="rounded-full bg-culinary-primary/15 px-2.5 py-0.5 text-xs font-bold text-culinary-primary">
                      Pickup
                    </span>
                  ) : null}
                </div>
                <h2 className="font-culinary-heading text-3xl font-extrabold tracking-tight">
                  {subtitle ?? martBU.name}
                </h2>
                {martBU.description && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {martBU.description}
                  </p>
                )}
              </div>

              {martTrio.length > 0 && (
                <div className="relative z-10 my-6 grid grid-cols-3 gap-3">
                  {martTrio.map((item) => (
                    <MartMiniCard
                      key={item._id}
                      item={item}
                      onOpen={onOpenItemDetails}
                    />
                  ))}
                </div>
              )}

              {martAction && (
                <div className="relative z-10">
                  <Link to={martAction.href}>
                    <Button variant="crunch" size="lg" className="w-full gap-2 text-sm font-bold">
                      {martAction.label}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// KitchenPickBadge — floating glass visual for a real best-selling item.
// "Best Seller" tag is truthful: the item comes from the best-sellers query.
// ============================================================================

function KitchenPickBadge({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen?: (item: CatalogItem) => void;
}) {
  const inner = (
    <>
      <span className="relative mb-2 block h-28 w-full overflow-hidden rounded-xl">
        <img
          src={item.coverImage || item.thumbnail}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
          Best Seller
        </span>
      </span>
      <span className="flex items-center justify-between px-1">
        <span className="truncate text-xs font-bold">{item.name}</span>
        <span className="ml-2 shrink-0 font-culinary-heading text-xs font-black text-culinary-primary">
          {formatCurrency(item.price)}
        </span>
      </span>
    </>
  );

  const className =
    "absolute bottom-6 right-6 hidden w-52 rounded-2xl glass-tier-2 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5 sm:block";

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={className}
        aria-label={`View ${item.name}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

// ============================================================================
// MartMiniCard — compact glass visual for a real Mart item.
// ============================================================================

function MartMiniCard({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen?: (item: CatalogItem) => void;
}) {
  const inner = (
    <>
      <span className="mb-2 block h-20 w-full overflow-hidden rounded-xl bg-secondary/50">
        <img
          src={item.coverImage || item.thumbnail}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
      <span className="block truncate text-[11px] font-bold">{item.name}</span>
      <span className="mt-0.5 block font-culinary-heading text-xs font-extrabold text-culinary-primary">
        {formatCurrency(item.price)}
      </span>
    </>
  );

  const className =
    "glass-tier-1 rounded-2xl p-2.5 text-center transition-transform hover:-translate-y-1";

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={className}
        aria-label={`View ${item.name}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
