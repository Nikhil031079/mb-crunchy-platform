import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { Combine } from "lucide-react";

import { api } from "@convex/_generated/api";

import { SectionHeader } from "./SectionHeader";
import { ComboCard, ComboCardSkeleton } from "./ComboCard";

import type { BusinessUnit, Combo } from "@/types";

// ============================================================================
// ComboOffersSection — global "Combo Offers" row across active business units
// ============================================================================

interface ComboOffersSectionProps {
  businessUnits: BusinessUnit[];
}

export function ComboOffersSection({ businessUnits }: ComboOffersSectionProps) {
  const navigate = useNavigate();

  const combosEnabled = businessUnits.filter((bu) => bu.enableCombos);

  const b0 = combosEnabled[0]?._id;
  const b1 = combosEnabled[1]?._id;
  const b2 = combosEnabled[2]?._id;
  const b3 = combosEnabled[3]?._id;

  const r0 = useQuery(
    api.combos.getFeatured,
    b0 ? { businessUnitId: b0 } : "skip",
  ) as Combo[] | undefined;
  const r1 = useQuery(
    api.combos.getFeatured,
    b1 ? { businessUnitId: b1 } : "skip",
  ) as Combo[] | undefined;
  const r2 = useQuery(
    api.combos.getFeatured,
    b2 ? { businessUnitId: b2 } : "skip",
  ) as Combo[] | undefined;
  const r3 = useQuery(
    api.combos.getFeatured,
    b3 ? { businessUnitId: b3 } : "skip",
  ) as Combo[] | undefined;

  const expectedCount = Math.min(combosEnabled.length, 4);
  const isLoading =
    expectedCount > 0 &&
    [r0, r1, r2, r3].slice(0, expectedCount).some((result) => result === undefined);

  const combos = useMemo(() => {
    const items = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    return items
      .filter((combo) => combo.status === "active")
      .filter((combo) => {
        if (seen.has(combo._id)) return false;
        seen.add(combo._id);
        return true;
      })
      .slice(0, 6);
  }, [r0, r1, r2, r3]);

  const firstBuSlug = combosEnabled[0]?.slug;

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <ComboCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (combos.length === 0) return null;

  return (
    <section id="combo-offers" className="bg-gradient-to-b from-secondary/30 to-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <Combine className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Bundles
          </span>
        </div>
        <SectionHeader
          title="Combo Offers"
          subtitle="Curated bundles and party packs that give you more for less"
          action={
            firstBuSlug
              ? {
                  label: "View All Combos",
                  onClick: () => navigate(`/${firstBuSlug}`),
                }
              : undefined
          }
          size="sm"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {combos.slice(0, 4).map((combo, index) => (
            <ComboCard key={combo._id} combo={combo} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
