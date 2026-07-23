export const productStatuses = ["active", "inactive", "archived"] as const;

export type ProductStatus = (typeof productStatuses)[number];

export const productUnits = ["pcs", "kg", "litre", "pack", "dozen", "box"] as const;

export type ProductUnit = (typeof productUnits)[number];

export const vegNonVegOptions = ["veg", "non-veg"] as const;

export type VegNonVeg = (typeof vegNonVegOptions)[number];

export interface Product {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  stockQuantity?: number;
  unit?: ProductUnit;
  vegNonVeg?: VegNonVeg;
  taxPercentage?: number;
  available: boolean;
  tags: string[];
  status: ProductStatus;
  featured: boolean;
  displayOrder: number;
}

export interface ProductFormValues {
  businessUnitId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  price: number;
  compareAtPrice: string;
  sku: string;
  stockQuantity: string;
  unit: ProductUnit;
  vegNonVeg: VegNonVeg;
  taxPercentage: string;
  available: boolean;
  tags: string;
  status: ProductStatus;
  featured: boolean;
  displayOrder: number;
}

export type ProductSortKey = "name" | "slug" | "businessUnitName" | "categoryName" | "status" | "displayOrder" | "price";
export type SortDirection = "asc" | "desc";

export interface ProductFilters {
  query: string;
  status: ProductStatus | "all";
  businessUnitId: string | "all";
}
