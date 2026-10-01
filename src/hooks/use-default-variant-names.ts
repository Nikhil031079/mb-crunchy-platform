import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { getDefaultActiveVariant } from "@/utils/product-variants";

import type { CatalogItem, Product, ProductVariant } from "@/types";

// ============================================================================
// use-default-variant-names — canonical default-variant identity for cards
// (Phase 21C-FIX)
//
// ProductCard must match the SAME cart line quick-add writes:
//   catalogItemId + the canonical default active variant's optionValue
// (21D-B rule: active `isDefault` -> first active by sortOrder -> "Default"
// only when there are zero active variants — the exact resolution in
// resolveQuickAddVariantLine / getDefaultActiveVariant).
//
// Plain CatalogItems carry no variants, so the identity is resolved from the
// products table exactly like quick-add already does:
//
//   1. `knownProducts` already loaded by the caller (BusinessUnitPage /
//      CategoryPage `allProducts`) — zero extra queries.
//   2. otherwise one shared `products.getByIds` subscription for the missing
//      source ids (Convex dedupes identical args across every section, same
//      mechanism as useProductCategorySlugs).
//
// Returns a map keyed by `catalogItems.sourceId`.
// ============================================================================

/** Minimal shape a customer card needs to resolve its default variant. */
export interface VariantResolvableItem {
  itemType?: CatalogItem["itemType"];
  sourceId?: string;
  variants?: ProductVariant[] | undefined;
}

/**
 * Canonical default variant identity for a product's variants — the exact
 * 21D-B rule quick-add writes: the active `isDefault` variant, else the
 * first active variant by sortOrder, else "Default" (zero active variants).
 * Never resolves to an inactive variant and never picks by array position.
 */
export function canonicalDefaultVariantName(
  variants: ProductVariant[] | undefined,
): string {
  return getDefaultActiveVariant(variants)?.optionValue ?? "Default";
}

/**
 * `catalogItems.sourceId` (= `products._id`) -> canonical default variant
 * name for the given cards.
 *
 * @param items         the cards being rendered (used to collect product ids)
 * @param knownProducts optional products already loaded by the caller — ids
 *                      covered by this list are never refetched, so screens
 *                      that already query `products.*` pay nothing extra.
 */
export function useDefaultVariantNames(
  items: readonly VariantResolvableItem[] | undefined,
  knownProducts?: readonly Pick<Product, "_id" | "variants">[],
): Map<string, string> {
  const productSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items ?? []) {
      // Only `product` entries map to the products table — combo/partyPack
      // sourceIds live in their own tables and would fail id validation.
      if ((item.itemType ?? "product") !== "product") continue;
      // Cards carrying inline variants resolve locally (ProductCard reads
      // them first), so there is nothing to fetch for them.
      if (item.variants && item.variants.length > 0) continue;
      if (item.sourceId) ids.add(item.sourceId);
    }
    // Sorted so the query args are value-stable across renders.
    return Array.from(ids).sort();
  }, [items]);

  const resolvedByCaller = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of knownProducts ?? []) {
      map.set(product._id, canonicalDefaultVariantName(product.variants));
    }
    return map;
  }, [knownProducts]);

  const missingIds = useMemo(
    () =>
      productSourceIds.filter((id) => !resolvedByCaller.has(id)) as Id<"products">[],
    [productSourceIds, resolvedByCaller],
  );

  const fetchedProducts = useQuery(
    api.products.getByIds,
    missingIds.length > 0 ? { ids: missingIds } : "skip",
  ) as Product[] | undefined;

  return useMemo(() => {
    const map = new Map(resolvedByCaller);
    for (const product of fetchedProducts ?? []) {
      map.set(product._id, canonicalDefaultVariantName(product.variants));
    }
    return map;
  }, [resolvedByCaller, fetchedProducts]);
}
