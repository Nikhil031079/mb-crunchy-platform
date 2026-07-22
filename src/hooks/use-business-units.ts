import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import type { BusinessUnit } from "@/types";

/**
 * Hook to fetch all active business units visible on the homepage
 */
export function useActiveBusinessUnits() {
  return useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined;
}

/**
 * Hook to fetch a single business unit by slug
 */
export function useBusinessUnitBySlug(slug: string) {
  return useQuery(api.businessUnits.getBySlug, { slug }) as
    | BusinessUnit
    | null
    | undefined;
}

/**
 * Hook to fetch all business units (admin)
 */
export function useAllBusinessUnits() {
  return useQuery(api.businessUnits.getAll) as BusinessUnit[] | undefined;
}
