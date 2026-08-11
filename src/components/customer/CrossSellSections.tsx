import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { HeartHandshake, Combine, PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useCart } from "@/stores/cart";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";
import { filterCatalogItemIds } from "@/utils";

import { SectionHeader } from "./SectionHeader";
import { ProductCard } from "./ProductCard";
import { ComboCard } from "./ComboCard";
import { PartyPackCard } from "./PartyPackCard";

import type { BusinessUnit, CatalogItem, Combo, PartyPack } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// CrossSellSections — "You may also like", "Recommended combo" and "Party
// pack" blocks rendered below a product, each with graceful fallbacks.
// ============================================================================

interface CrossSellSectionsProps {
  businessUnit: BusinessUnit;
  excludeIds: string[];
}

export function CrossSellSections({
  businessUnit,
  excludeIds,
}: CrossSellSectionsProps) {
  const { addItem } = useCart();
  const handleAddToCart = useAddToCart();
  const { bySource } = useCatalogItemMap([businessUnit]);

  const buId = businessUnit._id as Id<"businessUnits">;

  // Only catalogItems references are valid for getRecommended's excludeIds —
  // stale source-table IDs would fail v.id("catalogItems") validation.
  const safeExcludeIds = useMemo(
    () => filterCatalogItemIds(excludeIds),
    [excludeIds],
  );

  const mayAlsoLike = useQuery(
    api.catalogItems.getRecommended,
    { businessUnitId: buId, excludeIds: safeExcludeIds as Id<"catalogItems">[], limit: 4 },
  ) as CatalogItem[] | undefined;

  const combos = useQuery(
    api.combos.getFeatured,
    { businessUnitId: buId },
  ) as Combo[] | undefined;
  const partyPacks = useQuery(
    api.partyPacks.getFeatured,
    { businessUnitId: buId },
  ) as PartyPack[] | undefined;

  const handleAddCombo = useCallback(
    async (combo: Combo) => {
      const catalogItem = bySource.get(combo._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${combo.name} is temporarily unavailable. Please try again.`,
        });
        return;
      }
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "combo",
        businessUnitId: combo.businessUnitId,
        name: combo.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: combo.price,
        image: combo.coverImage || combo.thumbnail || combo.images?.[0],
      });
      if (added) {
        toast.success("Added to cart", { description: combo.name });
      }
    },
    [addItem, bySource],
  );

  const handleAddPartyPack = useCallback(
    async (partyPack: PartyPack) => {
      const catalogItem = bySource.get(partyPack._id);
      if (!catalogItem) {
        toast.error("Item unavailable", {
          description: `${partyPack.name} is temporarily unavailable. Please try again.`,
        });
        return;
      }
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "partyPack",
        businessUnitId: partyPack.businessUnitId,
        name: partyPack.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: partyPack.price,
        image: partyPack.coverImage || partyPack.thumbnail || partyPack.images?.[0],
      });
      if (added) {
        toast.success("Added to cart", { description: partyPack.name });
      }
    },
    [addItem, bySource],
  );

  const handleAddProduct = useCallback(
    (product: CatalogItem | CardProduct) =>
      handleAddToCart(product as CatalogItem),
    [handleAddToCart],
  );

  const recommendedCombos = useMemo(
    () => (combos ?? []).filter((combo) => combo.status === "active").slice(0, 2),
    [combos],
  );
  const recommendedPacks = useMemo(
    () =>
      (partyPacks ?? [])
        .filter((pack) => pack.status === "active")
        .slice(0, 2),
    [partyPacks],
  );

  const hasAny =
    (mayAlsoLike && mayAlsoLike.length > 0) ||
    recommendedCombos.length > 0 ||
    recommendedPacks.length > 0;

  if (!hasAny) return null;

  return (
    <div className="space-y-10">
      {mayAlsoLike && mayAlsoLike.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              More to Explore
            </span>
          </div>
          <SectionHeader title="You May Also Like" subtitle="Customers also looked at these" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
            {mayAlsoLike.map((item) => (
              <ProductCard
                key={item._id}
                product={item}
                businessUnitSlug={businessUnit.slug}
                index={0}
                compact
                onAddToCart={handleAddProduct}
              />
            ))}
          </div>
        </section>
      )}

      {recommendedCombos.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Combine className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              Bundles
            </span>
          </div>
          <SectionHeader title="Recommended Combo" subtitle="Save more when you bundle" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {recommendedCombos.map((combo, index) => (
              <ComboCard
                key={combo._id}
                combo={combo}
                index={index}
                onAddToCart={handleAddCombo}
              />
            ))}
          </div>
        </section>
      )}

      {recommendedPacks.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              For Celebrations
            </span>
          </div>
          <SectionHeader title="Party Packs" subtitle="Perfect for gatherings and events" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {recommendedPacks.map((partyPack, index) => (
              <PartyPackCard
                key={partyPack._id}
                partyPack={partyPack}
                index={index}
                onAddToCart={handleAddPartyPack}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
