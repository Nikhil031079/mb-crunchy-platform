import { useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { Utensils, Package, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCart } from "@/stores/cart";
import { useCatalogItemMap } from "@/hooks/use-catalog-map";

import { SectionHeader } from "./SectionHeader";
import { ProductCard } from "./ProductCard";
import { PartyPackCard } from "./PartyPackCard";
import { CardGridSkeleton } from "./Skeleton";

import type { BusinessUnit, CatalogItem, PartyPack } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// BusinessUnitSections — renders per-business-unit storefront sections
// (featured products "Popular Items" + party packs).
// ============================================================================

interface BusinessUnitSectionsProps {
  businessUnits: BusinessUnit[];
}

export function BusinessUnitSections({ businessUnits }: BusinessUnitSectionsProps) {
  return (
    <>
      {businessUnits.map((bu, buIndex) => (
        <BusinessUnitSection key={bu._id} bu={bu} buIndex={buIndex} />
      ))}
    </>
  );
}

// ============================================================================
// BusinessUnitSection — per-BU child component with its own hooks
// ============================================================================

function BusinessUnitSection({
  bu,
  buIndex,
}: {
  bu: BusinessUnit;
  buIndex: number;
}) {
  const featuredProducts = useQuery(api.catalogItems.getFeatured, {
    businessUnitId: bu._id,
  });

  const partyPacks = useQuery(
    api.partyPacks.getByBusinessUnit,
    bu.enablePartyPacks ? { businessUnitId: bu._id } : "skip",
  ) as PartyPack[] | undefined;

  const { bySource, catalogItemMap } = useCatalogItemMap([bu]);

  const navigate = useNavigate();
  const addCallback = useAddToCart();
  const { addItem } = useCart();
  const handleAddToCart = useCallback(
    (product: CatalogItem | CardProduct) => addCallback(product as CatalogItem),
    [addCallback],
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
      const bundleItems = partyPack.items?.map((pi) => ({
        name: catalogItemMap.get(pi.catalogItemId)?.name ?? "Item",
        quantity: pi.quantity,
      }));
      const added = await addItem({
        catalogItemId: catalogItem._id,
        itemType: "partyPack",
        businessUnitId: catalogItem.businessUnitId,
        name: partyPack.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: partyPack.price,
        image: partyPack.coverImage || partyPack.thumbnail || partyPack.images?.[0],
        ...(bundleItems && bundleItems.length > 0 ? { bundleItems } : {}),
      });
      if (added) {
        toast.success("Added to cart", { description: partyPack.name });
      }
    },
    [addItem, bySource, catalogItemMap]
  );

  const isDataLoaded =
    featuredProducts !== undefined &&
    (partyPacks !== undefined || !bu.enablePartyPacks);

  const hasFeatured = featuredProducts && featuredProducts.length > 0;
  const hasPartyPacks = partyPacks && partyPacks.length > 0;

  if (!isDataLoaded) {
    return <BusinessUnitSectionSkeleton buIndex={buIndex} />;
  }

  if (!hasFeatured && !hasPartyPacks) return null;

  const buSlug = bu.slug;

  return (
    <section
      key={bu._id}
      className={cn("py-12 sm:py-16", buIndex % 2 === 1 && "bg-secondary/20")}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* BU Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {bu.logo ? (
              <img
                src={bu.logo}
                alt=""
                className="h-10 w-10 rounded-xl object-cover shadow-sm"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: bu.themeColor || "#000" }}
              >
                {buIndex === 0 ? (
                  <Utensils className="h-5 w-5 text-white" />
                ) : (
                  <Package className="h-5 w-5 text-white" />
                )}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">{bu.name}</h2>
              {bu.description && (
                <p className="text-sm text-muted-foreground">{bu.description}</p>
              )}
            </div>
          </div>
          <Link
            to={`/${buSlug}`}
            className="hidden items-center gap-1 text-sm font-medium text-accent transition-colors hover:underline sm:flex"
          >
            View All
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Featured Products */}
        {hasFeatured && (
          <div className="mb-10">
            <SectionHeader
              title="Popular Items"
              subtitle="Our most-loved selections"
              action={{
                label: `Browse ${bu.name}`,
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {featuredProducts!.slice(0, 10).map((item, index) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  businessUnitSlug={buSlug}
                  index={index}
                  compact
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          </div>
        )}

        {/* Best Sellers — consolidated in the global BestSellersSection */}
        {/* Combos — consolidated in the global ComboOffersSection */}

        {/* Party Packs */}
        {hasPartyPacks && (
          <div>
            <SectionHeader
              title={`${bu.name} Party Packs`}
              subtitle="Perfect for gatherings and events"
              action={{
                label: "View All Packs",
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {partyPacks!.slice(0, 4).map((pack, index) => (
                <PartyPackCard
                  key={pack._id}
                  partyPack={pack}
                  index={index}
                  onAddToCart={handleAddPartyPack}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// BusinessUnitSectionSkeleton
// ============================================================================

export function BusinessUnitSectionSkeleton({ buIndex }: { buIndex: number }) {
  return (
    <section className={cn("py-12 sm:py-16", buIndex % 2 === 0 && "bg-secondary/20")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-secondary" />
          <div className="space-y-2">
            <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
          </div>
        </div>
        <div className="mb-5">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="h-6 w-36 animate-pulse rounded bg-secondary" />
        </div>
        <CardGridSkeleton count={5} columns={4} type="product" />
      </div>
    </section>
  );
}
