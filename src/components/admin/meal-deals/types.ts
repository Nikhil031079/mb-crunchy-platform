// ============================================================================
// MB CRUNCHY - Admin Meal Deals Types
// ============================================================================

import type { MealDealStatus } from "@/types";

export type { MealDealStatus };

export interface MealDealRecord {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  name: string;
  status: MealDealStatus;
  dealPrice: number;
  qualifyingItems: AdminQualifyingItem[];
  applyToCombos: boolean;
  applyToPartyPacks: boolean;
  parentCatalogItemIds?: string[];
  cartSmartDetection: boolean;
  displayOrder: number;
}

/** Admin qualifying item: raw catalog item IDs for alternatives (not enriched). */
export interface AdminQualifyingItem {
  catalogItemId: string;
  quantity: number;
  alternatives?: string[];
}

export interface MealDealFormValues {
  businessUnitId: string;
  name: string;
  status: MealDealStatus;
  dealPrice: number;
  qualifyingItems: AdminQualifyingItem[];
  applyToCombos: boolean;
  applyToPartyPacks: boolean;
  parentCatalogItemIds?: string[];
  cartSmartDetection: boolean;
  displayOrder: number;
}

export type MealDealSortKey = "name" | "status" | "dealPrice" | "displayOrder";

export type MealDealFilters = {
  query: string;
  status: "all" | MealDealStatus;
  businessUnitId: string;
};

export type SortDirection = "asc" | "desc";
