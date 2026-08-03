import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { ShoppingBag } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useCart } from "@/stores/cart";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCategorySignals } from "@/hooks/use-category-signals";

import { ProductGridSection } from "./ProductGridSection";

import type { BusinessUnit, CatalogItem } from "@/types";
import type { CardProduct } from "./ProductCard";

// ============================================================================
// ContinueShoppingSection — when the cart holds products, suggest related
// items from the same categories so shoppers can add complementary goods.
// Falls back to the BU's best sellers when no category matches exist.
// ============================================================================

interface ContinueShoppingSectionProps {
  businessUnits: BusinessUnit[];
}

export function ContinueShoppingSection({
  businessUnits,
}: ContinueShoppingSectionProps) {
  const { cart } = useCart();
  const handleAddToCart = useAddToCart();

  const cartItems = cart.items;
  const cartIds = useMemo(() => cartItems.map((item) => item.catalogItemId), [cartItems]);
  const businessUnitId = cart.businessUnitId ?? cartItems[0]?.businessUnitId;

  const { categoryIds, isLoading: categoryLoading } = useCategorySignals(cartIds);

  const relatedItems = useQuery(
    api.catalogItems.getByCategoryIds,
    businessUnitId && categoryIds.length > 0
      ? {
          businessUnitId: businessUnitId as Id<"businessUnits">,
          categoryIds: categoryIds as Id<"categories">[],
          excludeIds: cartIds as Id<"catalogItems">[],
          limit: 10,
        }
      : "skip",
  ) as CatalogItem[] | undefined;

  const fallbackItems = useQuery(
    api.catalogItems.getBestSellers,
    businessUnitId &&
      relatedItems !== undefined &&
      relatedItems.length === 0 &&
      cartIds.length > 0
      ? { businessUnitId: businessUnitId as Id<"businessUnits">, limit: 10 }
      : "skip",
  ) as CatalogItem[] | undefined;

  const buSlugsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits) map.set(bu._id, bu.slug);
    return map;
  }, [businessUnits]);

  const handleAdd = useCallback(
    (product: CatalogItem | CardProduct) =>
      handleAddToCart(product as CatalogItem),
    [handleAddToCart],
  );

  if (cartIds.length === 0) return null;

  const items = relatedItems && relatedItems.length > 0
    ? relatedItems
    : fallbackItems ?? [];

  return (
    <ProductGridSection
      id="continue-shopping"
      eyebrow="Complete Your Order"
      eyebrowIcon={ShoppingBag}
      title="Continue Shopping"
      subtitle="Add complementary products from your cart's categories"
      items={items}
      buSlugsById={buSlugsById}
      onAddToCart={handleAdd}
      loading={categoryLoading}
      variant="secondary"
    />
  );
}
