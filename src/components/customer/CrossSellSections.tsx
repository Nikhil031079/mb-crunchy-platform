import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { HeartHandshake } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useProductCategorySlugs } from "@/hooks/use-product-routes";
import { useDefaultVariantNames } from "@/hooks/use-default-variant-names";
import { filterCatalogItemIds } from "@/utils";

import { SectionHeader } from "./SectionHeader";
import { ProductCard } from "./ProductCard";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// CrossSellSections — product-level "You may also like" rendered below a
// product. Storefront-level combo / party-pack rails were removed by Phase
// 21G-B: those belong to the homepage + store catalog, not a product page.
// ============================================================================

interface CrossSellSectionsProps {
  businessUnit: BusinessUnit;
  excludeIds: string[];
}

export function CrossSellSections({
  businessUnit,
  excludeIds,
}: CrossSellSectionsProps) {
  const handleAddToCart = useAddToCart();

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

  const handleAddProduct = useCallback(
    (product: CatalogItem | CardProduct) =>
      handleAddToCart(product as CatalogItem),
    [handleAddToCart],
  );

  const hasAny = mayAlsoLike && mayAlsoLike.length > 0;

  const categorySlugBySourceId = useProductCategorySlugs(mayAlsoLike);
  const defaultVariantNameBySourceId = useDefaultVariantNames(mayAlsoLike);

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
                categorySlug={categorySlugBySourceId.get(item.sourceId)}
                index={0}
                compact
                onAddToCart={handleAddProduct}
                defaultVariantName={defaultVariantNameBySourceId.get(item.sourceId)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
