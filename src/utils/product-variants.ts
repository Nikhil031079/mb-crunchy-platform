import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { convexClient } from "@/lib/convex";

import type { ProductVariant } from "@/types";

// ============================================================================
// Canonical client-side variant resolution (Phase 21D-B)
//
// Single source of truth for the storefront. The functions below mirror
// convex/utils/variantHelper.ts (server) and were extracted from ProductPage
// so the PDP, ProductCard and EVERY customer quick-add path resolve the same
// default variant identity:
//
//   isDefault active variant -> first active variant by sortOrder
//
// "variantName: Default" is only a legitimate cart identity when the product
// has ZERO active variants (the non-variant case).
// ============================================================================

/** Active variants ordered by the canonical sortOrder. */
export function getActiveVariants(
  variants: ProductVariant[] | undefined
): ProductVariant[] {
  return (variants ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The canonical default ACTIVE variant: the entry flagged `isDefault`,
 * otherwise the first active variant by sortOrder.
 * Returns undefined when the product has no active variants at all.
 */
export function getDefaultActiveVariant(
  variants: ProductVariant[] | undefined
): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  return active.find((v) => v.isDefault) ?? active[0];
}

/**
 * Product Detail Page resolution: the canonical default active variant,
 * falling back to the raw first entry so the PDP keeps its existing
 * behavior for products whose variants are all inactive.
 */
export function getDefaultVariant(
  variants: ProductVariant[] | undefined
): ProductVariant | undefined {
  return getDefaultActiveVariant(variants) ?? (variants ?? [])[0];
}

export function getVariantGroups(
  variants: ProductVariant[] | undefined
): { groupName: string; options: ProductVariant[] }[] {
  const active = getActiveVariants(variants);
  const groupMap = new Map<string, ProductVariant[]>();
  for (const v of active) {
    const key = v.optionName || "";
    const list = groupMap.get(key) ?? [];
    list.push(v);
    groupMap.set(key, list);
  }
  return Array.from(groupMap.entries())
    .map(([groupName, options]) => ({
      groupName,
      options: options.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((g) => g.groupName !== "" || g.options.length > 1);
}

export function getDefaultSelections(
  variants: ProductVariant[] | undefined
): Record<string, string> {
  const groups = getVariantGroups(variants);
  const selections: Record<string, string> = {};
  for (const group of groups) {
    const def = group.options.find((o) => o.isDefault) ?? group.options[0];
    if (def) selections[group.groupName] = def.optionValue;
  }
  return selections;
}

export function findMatchingVariant(
  variants: ProductVariant[] | undefined,
  selections: Record<string, string>
): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  for (const v of active) {
    const group = v.optionName;
    const sel = selections[group];
    if (sel !== undefined && sel === v.optionValue) return v;
  }
  return getDefaultVariant(variants);
}

// ============================================================================
// Quick-add cart line — canonical variant identity + price
// ============================================================================

export interface QuickAddVariantLine {
  variantName: string;
  unitPrice: number;
}

/**
 * Variant data already attached to the object being added (CardProduct or a
 * loaded Product document). Plain CatalogItems carry no variants.
 */
export function getInlineVariants(
  item: unknown
): ProductVariant[] | undefined {
  if (item && typeof item === "object" && "variants" in item) {
    const variants = (item as { variants?: unknown }).variants;
    if (Array.isArray(variants)) return variants as ProductVariant[];
  }
  return undefined;
}

/**
 * Best-effort product fetch for quick-add paths that only hold a CatalogItem.
 * Returns the product's variants, or null when the product identity cannot be
 * resolved (missing sourceId, deleted source, or a transient query failure).
 * Callers MUST treat null as "cannot add" — never fall back to an arbitrary
 * "Default" identity for a product that may have real variants.
 */
async function fetchProductVariants(
  sourceId: string | undefined
): Promise<ProductVariant[] | null> {
  if (!sourceId) return null;
  try {
    const docs = await convexClient.query(api.products.getByIds, {
      ids: [sourceId as Id<"products">],
    });
    const doc = docs[0];
    if (!doc) return null;
    return doc.variants ?? [];
  } catch {
    return null;
  }
}

/**
 * Resolve the cart line identity + unit price a quick-add must write.
 *
 * - Non-variant item types (combo / partyPack): "Default" + item price.
 * - Product with ACTIVE variants: the canonical default active variant's
 *   optionValue + price (server re-validates and re-prices the same way).
 *   An optional `selectedVariantName` (explicit user choice, e.g. the item
 *   details modal) is honored only when it matches an ACTIVE variant —
 *   otherwise the canonical default is used, never an arbitrary identity.
 * - Product with ZERO active variants: "Default" + catalog price, matching
 *   the server's non-variant price fallback.
 * - Product whose variants cannot be resolved: null — the caller must abort
 *   the add instead of writing an unverified identity.
 */
export async function resolveQuickAddVariantLine(item: {
  itemType: string;
  name?: string;
  price?: number;
  sourceId?: string;
  variants?: ProductVariant[];
  selectedVariantName?: string;
}): Promise<QuickAddVariantLine | null> {
  if (item.itemType !== "product") {
    return { variantName: "Default", unitPrice: item.price ?? 0 };
  }

  let variants = item.variants;
  if (!variants) {
    const fetched = await fetchProductVariants(item.sourceId);
    if (fetched === null) return null;
    variants = fetched;
  }

  const active = getActiveVariants(variants);
  if (active.length === 0) {
    return { variantName: "Default", unitPrice: item.price ?? 0 };
  }

  const chosen = item.selectedVariantName
    ? active.find((v) => v.optionValue === item.selectedVariantName)
    : undefined;
  const line = chosen ?? active.find((v) => v.isDefault) ?? active[0];
  return { variantName: line.optionValue, unitPrice: line.price };
}
