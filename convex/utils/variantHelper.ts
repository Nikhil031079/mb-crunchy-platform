import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type Doc<T extends keyof DataModel> = ReturnType<
  GenericQueryCtx<DataModel>["db"]["get"]
> extends Promise<infer D extends { _type: string } | null>
  ? D extends null
    ? never
    : D
  : never;

export type ProductVariant = {
  optionName: string;
  optionValue: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  barcode?: string;
  stock?: number;
  costPrice?: number;
  taxPercentage?: number;
  image?: string;
  minOrderQty?: number;
  isDefault: boolean;
  sortOrder: number;
  active: boolean;
};

export function getActiveVariants(
  variants: ProductVariant[]
): ProductVariant[] {
  return variants
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getDefaultVariant(
  variants: ProductVariant[]
): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  return active.find((v) => v.isDefault) ?? active[0] ?? variants[0];
}

export function getVariantGroups(
  variants: ProductVariant[]
): { groupName: string; options: ProductVariant[] }[] {
  const active = getActiveVariants(variants);
  const groupMap = new Map<string, ProductVariant[]>();
  for (const v of active) {
    const key = v.optionName || "";
    const list = groupMap.get(key) ?? [];
    list.push(v);
    groupMap.set(key, list);
  }
  return Array.from(groupMap.entries()).map(([groupName, options]) => ({
    groupName,
    options: options.sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function matchVariant(
  variants: ProductVariant[],
  selections: Record<string, string>
): ProductVariant | undefined {
  const active = getActiveVariants(variants);
  for (const v of active) {
    let match = true;
    for (const [group, value] of Object.entries(selections)) {
      if (group === "") {
        if (v.optionName !== "" && v.optionName !== value) {
          match = false;
          break;
        }
      } else {
        if (v.optionName !== group || v.optionValue !== value) {
          match = false;
          break;
        }
      }
    }
    if (match) return v;
  }
  return undefined;
}

export function getDefaultSelections(
  variants: ProductVariant[]
): Record<string, string> {
  const groups = getVariantGroups(variants);
  const selections: Record<string, string> = {};
  for (const group of groups) {
    const def =
      group.options.find((o) => o.isDefault) ?? group.options[0];
    if (def) selections[group.groupName] = def.optionValue;
  }
  return selections;
}

export function buildDefaultVariant(
  price: number,
  compareAtPrice?: number
): ProductVariant {
  return {
    optionName: "",
    optionValue: "Default",
    price,
    compareAtPrice,
    isDefault: true,
    sortOrder: 0,
    active: true,
  };
}

export function firstActivePrice(variants: ProductVariant[]): {
  price: number;
  compareAtPrice?: number;
} {
  const def = getDefaultVariant(variants);
  return {
    price: def?.price ?? variants[0]?.price ?? 0,
    compareAtPrice: def?.compareAtPrice ?? variants[0]?.compareAtPrice,
  };
}

export function priceRange(variants: ProductVariant[]): {
  min: number;
  max: number;
} {
  const active = getActiveVariants(variants);
  if (active.length === 0) return { min: 0, max: 0 };
  const prices = active.map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
