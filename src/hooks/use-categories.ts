import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import type { Category } from "@/types";

/**
 * Hook to fetch categories for a business unit
 */
export function useCategoriesByBusinessUnit(businessUnitId: string) {
  return useQuery(api.categories.getByBusinessUnit, { businessUnitId }) as
    | Category[]
    | undefined;
}

/**
 * Hook to fetch a single category by slug within a business unit
 */
export function useCategoryBySlug(
  businessUnitId: string,
  slug: string
) {
  return useQuery(api.categories.getBySlug, {
    businessUnitId,
    slug,
  }) as Category | null | undefined;
}
