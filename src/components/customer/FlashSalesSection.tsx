import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { Zap, Flame, ArrowRight } from "lucide-react";

import { api } from "@convex/_generated/api";

import { isOfferActive, formatCurrency, getOfferMarketingSettings } from "@/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./SectionHeader";
import { CountdownTimer } from "./CountdownTimer";

import type { BusinessUnit, Offer } from "@/types";

// ============================================================================
// FlashSalesSection — time-urgent active offers shown with a live countdown.
//
// NOTE: a dedicated `flashSales` collection does not exist yet, so flash sales
// are derived from currently active offers ordered by most urgent end time.
// The countdown is a placeholder — richer animation arrives with the Motion
// Sprint.
// ============================================================================

interface FlashSalesSectionProps {
  businessUnits: BusinessUnit[];
  limit?: number;
}

const MAX_BUSINESS_UNITS = 4;
const DEFAULT_LIMIT = 3;

export function FlashSalesSection({
  businessUnits,
  limit = DEFAULT_LIMIT,
}: FlashSalesSectionProps) {
  const navigate = useNavigate();

  const offerEnabled = useMemo(
    () => businessUnits.filter((bu) => bu.enableOffers),
    [businessUnits]
  );

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  const b0 = offerEnabled[0]?._id;
  const b1 = offerEnabled[1]?._id;
  const b2 = offerEnabled[2]?._id;
  const b3 = offerEnabled[3]?._id;

  const r0 = useQuery(
    api.offers.getActive,
    b0 ? { businessUnitId: b0 } : "skip",
  ) as Offer[] | undefined;
  const r1 = useQuery(
    api.offers.getActive,
    b1 ? { businessUnitId: b1 } : "skip",
  ) as Offer[] | undefined;
  const r2 = useQuery(
    api.offers.getActive,
    b2 ? { businessUnitId: b2 } : "skip",
  ) as Offer[] | undefined;
  const r3 = useQuery(
    api.offers.getActive,
    b3 ? { businessUnitId: b3 } : "skip",
  ) as Offer[] | undefined;

  const expectedCount = Math.min(offerEnabled.length, MAX_BUSINESS_UNITS);
  const isLoading =
    expectedCount > 0 &&
    [r0, r1, r2, r3].slice(0, expectedCount).some((result) => result === undefined);

  const flashSales = useMemo(() => {
    const all = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    const deduped = all.filter((offer) => {
      if (!isOfferActive(offer)) return false;
      const settings = getOfferMarketingSettings(offer);
      if (!settings.isFlashSale) return false;
      if (seen.has(offer._id)) return false;
      seen.add(offer._id);
      return true;
    });
    return deduped
      .sort((a, b) => {
        const priorityA = getOfferMarketingSettings(a).flashSalePriority;
        const priorityB = getOfferMarketingSettings(b).flashSalePriority;
        if (priorityB !== priorityA) return priorityB - priorityA;
        return a.endsAt - b.endsAt;
      })
      .slice(0, limit);
  }, [r0, r1, r2, r3, limit]);

  const firstBuSlug = offerEnabled[0]?.slug;

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (flashSales.length === 0) return null;

  return (
    <section id="flash-sales" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-orange-500">
            Flash Sale
          </span>
        </div>
        <SectionHeader
          title="Flash Sales"
          subtitle="Big drops, short windows — grab them before time runs out"
          action={
            firstBuSlug
              ? {
                  label: "View All Offers",
                  onClick: () => navigate(`/${firstBuSlug}`),
                }
              : undefined
          }
          size="sm"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flashSales.map((offer) => (
            <FlashSaleCard key={offer._id} offer={offer} businessUnitSlug={buSlugsById.get(offer.businessUnitId)} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// FlashSaleCard — single time-boxed deal
// ============================================================================

function FlashSaleCard({
  offer,
  businessUnitSlug,
}: {
  offer: Offer;
  businessUnitSlug?: string;
}) {
  const image = offer.banner;
  const isPercentage = offer.discountType === "percentage";
  const discountLabel = isPercentage
    ? `${offer.discountValue}% OFF`
    : `${formatCurrency(offer.discountValue)} OFF`;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-orange-200/60 bg-gradient-to-br from-orange-50 via-background to-background p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/5 dark:border-orange-950/60">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-orange-500/10" />
      <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-amber-500/10" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Badge
            variant="default"
            className="gap-1 bg-orange-500 text-white text-[10px] font-bold"
          >
            <Zap className="h-3 w-3 fill-current" />
            Flash Sale
          </Badge>
          <h3 className="font-semibold leading-snug">{offer.title}</h3>
          {offer.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {offer.description}
            </p>
          )}
        </div>
        {image && (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4">
        <span className="text-lg font-extrabold text-orange-600 dark:text-orange-400">
          {discountLabel}
        </span>
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-3">
        <CountdownTimer target={offer.endsAt} />
        {businessUnitSlug && (
          <Link to={`/${businessUnitSlug}`}>
            <Button size="sm" className="gap-1.5 rounded-lg text-xs">
              Shop Now
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
