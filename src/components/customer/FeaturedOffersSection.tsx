import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { Percent } from "lucide-react";

import { api } from "@convex/_generated/api";

import { SectionHeader } from "./SectionHeader";
import { OfferBanner } from "./OfferBanner";
import { isOfferActive, getOfferMarketingSettings } from "@/utils";

import type { BusinessUnit, Offer } from "@/types";

// ============================================================================
// FeaturedOffersSection — active offers across business units.
// Sources `offers.getActive` (active status + startsAt/endsAt window) and
// renders premium cards that support percentage & fixed discounts.
// ============================================================================

interface FeaturedOffersSectionProps {
  businessUnits: BusinessUnit[];
  title?: string;
  subtitle?: string;
}

const MAX_BUSINESS_UNITS = 4;

export function FeaturedOffersSection({
  businessUnits,
  title = "Featured Offers",
  subtitle = "Limited-time offers you don't want to miss",
}: FeaturedOffersSectionProps) {
  const navigate = useNavigate();

  const offerEnabled = useMemo(
    () => businessUnits.filter((bu) => bu.enableOffers),
    [businessUnits]
  );

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

  const offers = useMemo(() => {
    const all = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    return all
      .filter((offer) => offer.status === "active" && isOfferActive(offer))
      .filter((offer) => getOfferMarketingSettings(offer).homeVisible)
      .filter((offer) => {
        if (seen.has(offer._id)) return false;
        seen.add(offer._id);
        return true;
      })
      .sort((a, b) => {
        const featuredA = getOfferMarketingSettings(a).featured ? 1 : 0;
        const featuredB = getOfferMarketingSettings(b).featured ? 1 : 0;
        if (featuredB !== featuredA) return featuredB - featuredA;
        return a.displayOrder - b.displayOrder;
      })
      .slice(0, 6);
  }, [r0, r1, r2, r3]);

  const firstBuSlug = offerEnabled[0]?.slug;

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (offers.length === 0) return null;

  return (
    <section id="featured-offers" className="py-12 sm:py-16 bg-gradient-to-b from-secondary/30 to-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <Percent className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Offers
          </span>
        </div>
        <SectionHeader
          title={title}
          subtitle={subtitle}
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
          {offers.map((offer, index) => (
            <OfferBanner
              key={offer._id}
              banner={offer}
              index={index}
              variant="card"
              showCountdown
              endsAt={offer.endsAt}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
