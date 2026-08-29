import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import { useCart } from "@/stores/cart";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";
import { useMealDeals } from "@/hooks/use-meal-deals";

import { SectionHeader } from "./SectionHeader";
import { PartyPackCard, PartyPackCardSkeleton } from "./PartyPackCard";

import type { BusinessUnit, PartyPack, CatalogItem, EnrichedMealDeal } from "@/types";

/**
 * Rule 17: Check whether a parent catalog item is eligible for a meal deal.
 * - undefined or empty parentCatalogItemIds → all eligible parents allowed
 * - non-empty parentCatalogItemIds → only listed IDs allowed
 */
function isParentAllowed(
  parentCatalogItemId: string,
  parentCatalogItemIds?: string[],
): boolean {
  if (!parentCatalogItemIds || parentCatalogItemIds.length === 0) return true;
  return parentCatalogItemIds.includes(parentCatalogItemId);
}

// ============================================================================
// PartyPacksSection — featured party packs across business units.
// ============================================================================

interface PartyPacksSectionProps {
  businessUnits: BusinessUnit[];
  title?: string;
  subtitle?: string;
  onOpenItemDetails?: (item: CatalogItem) => void;
}

const MAX_BUSINESS_UNITS = 4;

export function PartyPacksSection({
  businessUnits,
  title = "Party Packs",
  subtitle = "Perfect for gatherings and events",
  onOpenItemDetails,
}: PartyPacksSectionProps) {
  const navigate = useNavigate();
  const { cart, addItem, applyMealDeal } = useCart();
  const { bySource, catalogItemMap } = useCatalogItemMap(businessUnits);

  const packsEnabled = useMemo(
    () => businessUnits.filter((bu) => bu.enablePartyPacks),
    [businessUnits]
  );

  const b0 = packsEnabled[0]?._id;
  const b1 = packsEnabled[1]?._id;
  const b2 = packsEnabled[2]?._id;
  const b3 = packsEnabled[3]?._id;

  const r0 = useQuery(
    api.partyPacks.getFeatured,
    b0 ? { businessUnitId: b0 } : "skip",
  ) as PartyPack[] | undefined;
  const r1 = useQuery(
    api.partyPacks.getFeatured,
    b1 ? { businessUnitId: b1 } : "skip",
  ) as PartyPack[] | undefined;
  const r2 = useQuery(
    api.partyPacks.getFeatured,
    b2 ? { businessUnitId: b2 } : "skip",
  ) as PartyPack[] | undefined;
  const r3 = useQuery(
    api.partyPacks.getFeatured,
    b3 ? { businessUnitId: b3 } : "skip",
  ) as PartyPack[] | undefined;

  // Fetch active meal deals for each BU
  const md0 = useMealDeals(b0);
  const md1 = useMealDeals(b1);
  const md2 = useMealDeals(b2);
  const md3 = useMealDeals(b3);

  const expectedCount = Math.min(packsEnabled.length, MAX_BUSINESS_UNITS);
  const isLoading =
    expectedCount > 0 &&
    [r0, r1, r2, r3].slice(0, expectedCount).some((result) => result === undefined);

  const packs = useMemo(() => {
    const all = [...(r0 ?? []), ...(r1 ?? []), ...(r2 ?? []), ...(r3 ?? [])];
    const seen = new Set<string>();
    return all
      .filter((pack) => pack.status === "active")
      .filter((pack) => {
        if (seen.has(pack._id)) return false;
        seen.add(pack._id);
        return true;
      })
      .slice(0, 4);
  }, [r0, r1, r2, r3]);

  const firstBuSlug = packsEnabled[0]?.slug;

  // Map each pack's catalogItemId → best applicable meal deal
  const packMealDealMap = useMemo(() => {
    const allDeals = [...(md0 ?? []), ...(md1 ?? []), ...(md2 ?? []), ...(md3 ?? [])];
    if (allDeals.length === 0 || packs.length === 0) return new Map<string, EnrichedMealDeal>();

    const map = new Map<string, EnrichedMealDeal>();
    for (const pack of packs) {
      const packCatalogItemId = bySource.get(pack._id)?._id;
      const packDeals = allDeals.filter(
        (d) =>
          d.businessUnitId === pack.businessUnitId &&
          d.applyToPartyPacks &&
          isParentAllowed(packCatalogItemId ?? "", d.parentCatalogItemIds),
      );
      if (packDeals.length === 0) continue;
      const best = packDeals.reduce((a, b) => (a.savings > b.savings ? a : b));
      map.set(pack._id, best);
    }
    return map;
  }, [md0, md1, md2, md3, packs, bySource]);

  const handleAddToCart = useCallback(
    async (pack: PartyPack): Promise<boolean> => {
      const catalogItem = bySource.get(pack._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${pack.name} is temporarily unavailable. Please try again.`,
        });
        return false;
      }
      const bundleItems = pack.items?.map((pi) => ({
        name: catalogItemMap.get(pi.catalogItemId)?.name ?? "Item",
        quantity: pi.quantity,
      }));
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "partyPack",
        businessUnitId: catalogItem.businessUnitId,
        name: pack.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: pack.price,
        image: pack.coverImage || pack.thumbnail || pack.images?.[0],
        ...(bundleItems && bundleItems.length > 0 ? { bundleItems } : {}),
      });
      if (added) {
        toast.success("Added to cart", { description: pack.name });
      }
      return added;
    },
    [addItem, bySource, catalogItemMap]
  );

  const handleAddMealDeal = useCallback(
    async (deal: EnrichedMealDeal, sourceItem?: PartyPack) => {
      let sourceParentCatalogItemId: string | undefined;
      if (sourceItem) {
        sourceParentCatalogItemId = bySource.get(sourceItem._id)?._id;
        const parentAlreadyInCart = sourceParentCatalogItemId
          ? cart.items.some((i) => i.catalogItemId === sourceParentCatalogItemId)
          : false;
        if (!parentAlreadyInCart) {
          const added = await handleAddToCart(sourceItem);
          if (!added) return;
        }
      }
      try {
        await applyMealDeal(deal, 1, sourceParentCatalogItemId);
        toast.success("Meal deal applied", { description: deal.name });
      } catch {
        toast.error("Could not apply meal deal");
      }
    },
    [applyMealDeal, handleAddToCart, bySource, cart.items]
  );

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <PartyPackCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (packs.length === 0) return null;

  return (
    <section id="party-packs" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Gatherings
          </span>
        </div>
        <SectionHeader
          title={title}
          subtitle={subtitle}
          action={firstBuSlug
            ? {
                label: "View All Packs",
                onClick: () => navigate(`/${firstBuSlug}`),
              }
            : undefined}
          size="sm"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {packs.map((pack, index) => (
            <PartyPackCard
              key={pack._id}
              partyPack={pack}
              index={index}
              onAddToCart={handleAddToCart}
              onOpenItemDetails={() => {
                const catalogItem = bySource.get(pack._id);
                if (catalogItem && onOpenItemDetails) onOpenItemDetails(catalogItem);
              }}
              getItemName={(catalogItemId) => catalogItemMap.get(catalogItemId)?.name}
              mealDeal={packMealDealMap.get(pack._id) ?? null}
              onAddMealDeal={handleAddMealDeal}
            />
          ))}
        </div>
      </div>
    </section>
  );
}