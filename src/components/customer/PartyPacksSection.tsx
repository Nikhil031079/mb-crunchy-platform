import { useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import { useCart } from "@/stores/cart";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";
import { needsMealDealSelection } from "@/hooks/use-meal-deals";

import { SectionHeader } from "./SectionHeader";
import { PartyPackCard, PartyPackCardSkeleton } from "./PartyPackCard";
import { MealDealVariantDialog } from "./MealDealVariantDialog";

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
  const [pendingMealDeal, setPendingMealDeal] = useState<{
    deal: EnrichedMealDeal;
    sourceParentCatalogItemId?: string;
  } | null>(null);
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);

  const packsEnabled = useMemo(
    () => businessUnits.filter((bu) => bu.enablePartyPacks),
    [businessUnits]
  );

  // Single aggregated query — returns all featured party packs across ALL BUs
  const allPacksRaw = useQuery(
    api.partyPacks.getAllFeaturedAcrossBusinessUnits,
  ) as PartyPack[] | undefined;

  // Single aggregated query — returns all active meal deals across ALL BUs
  const allMealDealsRaw = useQuery(
    api.mealDeals.getAllActiveForCustomerAcrossBusinessUnits,
  ) as EnrichedMealDeal[] | undefined;

  const isLoading = allPacksRaw === undefined || allMealDealsRaw === undefined;

  const packs = useMemo(() => {
    if (!allPacksRaw) return [];
    const enabledIds = new Set(packsEnabled.map((bu) => bu._id));
    const seen = new Set<string>();
    return allPacksRaw
      .filter((pack) => enabledIds.has(pack.businessUnitId))
      .filter((pack) => pack.status === "active")
      .filter((pack) => {
        if (seen.has(pack._id)) return false;
        seen.add(pack._id);
        return true;
      })
      .slice(0, 4);
  }, [allPacksRaw, packsEnabled]);

  const firstBuSlug = packsEnabled[0]?.slug;

  // Group meal deals by BU for lookup
  const mealDealsByBu = useMemo(() => {
    if (!allMealDealsRaw) return new Map<string, EnrichedMealDeal[]>();
    const map = new Map<string, EnrichedMealDeal[]>();
    for (const deal of allMealDealsRaw) {
      const existing = map.get(deal.businessUnitId) ?? [];
      existing.push(deal);
      map.set(deal.businessUnitId, existing);
    }
    return map;
  }, [allMealDealsRaw]);

  // Map each pack's catalogItemId → best applicable meal deal
  const packMealDealMap = useMemo(() => {
    if (mealDealsByBu.size === 0 || packs.length === 0) return new Map<string, EnrichedMealDeal>();

    const map = new Map<string, EnrichedMealDeal>();
    for (const pack of packs) {
      const packCatalogItemId = bySource.get(pack._id)?._id;
      const packDeals = (mealDealsByBu.get(pack.businessUnitId) ?? []).filter(
        (d) =>
          d.applyToPartyPacks &&
          isParentAllowed(packCatalogItemId ?? "", d.parentCatalogItemIds),
      );
      if (packDeals.length === 0) continue;
      const best = packDeals.reduce((a, b) => (a.savings > b.savings ? a : b));
      map.set(pack._id, best);
    }
    return map;
  }, [mealDealsByBu, packs, bySource]);

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

      if (needsMealDealSelection(deal)) {
        setPendingMealDeal({ deal, sourceParentCatalogItemId });
        setVariantDialogOpen(true);
      } else {
        try {
          await applyMealDeal(deal, 1, sourceParentCatalogItemId);
          toast.success("Meal deal applied", { description: deal.name });
        } catch {
          toast.error("Could not apply meal deal");
        }
      }
    },
    [applyMealDeal, handleAddToCart, bySource, cart.items]
  );

  const handleDialogConfirm = useCallback(
    async (selections: import("./MealDealVariantDialog").MealDealSelections) => {
      if (!pendingMealDeal) return;
      try {
        await applyMealDeal(
          pendingMealDeal.deal,
          1,
          pendingMealDeal.sourceParentCatalogItemId,
          selections.variantSelections,
          selections.itemSelections,
        );
        toast.success("Meal deal applied", { description: pendingMealDeal.deal.name });
      } catch {
        toast.error("Could not apply meal deal");
      }
      setPendingMealDeal(null);
    },
    [pendingMealDeal, applyMealDeal],
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

      {pendingMealDeal && (
        <MealDealVariantDialog
          open={variantDialogOpen}
          onOpenChange={setVariantDialogOpen}
          deal={pendingMealDeal.deal}
          onConfirm={handleDialogConfirm}
        />
      )}
    </section>
  );
}