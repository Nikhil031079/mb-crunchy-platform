// ============================================================================
// MB CRUNCHY - Admin Meal Deals Types
// ============================================================================

import type { MealDeal, MealDealQualifyingItem } from "@/types";

export type MealDealStatus = "active" | "inactive";

export interface MealDealRecord {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  name: string;
  status: MealDealStatus;
  dealPrice: number;
  qualifyingItems: MealDealQualifyingItem[];
  applyToCombos: boolean;
  applyToPartyPacks: boolean;
  parentCatalogItemIds?: string[];
  cartSmartDetection: boolean;
  displayOrder: number;
}

export interface MealDealFormValues {
  businessUnitId: string;
  name: string;
  status: MealDealStatus;
  dealPrice: number;
  qualifyingItems: MealDealQualifyingItem[];
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
