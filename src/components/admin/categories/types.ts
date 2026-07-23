export const categoryStatuses = ["active", "inactive", "archived"] as const;

export type CategoryStatus = (typeof categoryStatuses)[number];

export interface Category {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  name: string;
  slug: string;
  imageUrl?: string;
  displayOrder: number;
  status: CategoryStatus;
}

export interface CategoryFormValues {
  businessUnitId: string;
  name: string;
  slug: string;
  imageUrl: string;
  displayOrder: number;
  status: CategoryStatus;
}

export type CategorySortKey = "name" | "slug" | "status" | "displayOrder" | "businessUnitName";
export type SortDirection = "asc" | "desc";

export interface CategoryFilters {
  query: string;
  status: CategoryStatus | "all";
  businessUnitId: string | "all";
}
