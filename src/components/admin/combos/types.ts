export const comboStatuses = ["active", "inactive", "archived"] as const;

export type ComboStatus = (typeof comboStatuses)[number];

export interface ComboItemValue {
  catalogItemId: string;
  quantity: number;
}

export interface Combo {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  items: ComboItemValue[];
  price: number;
  compareAtPrice?: number;
  savingsPercentage?: number;
  status: ComboStatus;
  featured: boolean;
  displayOrder: number;
  /** Marketing extensions stored in the combo `settings` object. */
  settings?: Record<string, unknown>;
}

export interface ComboFormValues {
  businessUnitId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  items: ComboItemValue[];
  price: number;
  compareAtPrice: number;
  savingsPercentage: number;
  status: ComboStatus;
  featured: boolean;
  displayOrder: number;
  /** Short label rendered as a badge on the combo card, e.g. "Bestseller". */
  highlightBadge: string;
}

export type ComboSortKey = "name" | "slug" | "businessUnitName" | "status" | "displayOrder" | "price";
export type SortDirection = "asc" | "desc";

export interface ComboFilters {
  query: string;
  status: ComboStatus | "all";
  businessUnitId: string | "all";
}
