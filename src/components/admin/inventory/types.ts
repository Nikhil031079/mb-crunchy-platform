import type { InventoryRecord } from "@/types";

export type InventorySortKey =
  | "itemName"
  | "variantName"
  | "sku"
  | "stockQuantity"
  | "reservedStock"
  | "availableStock"
  | "status"
  | "businessUnitName"
  | "costPrice";

export type SortDirection = "asc" | "desc";

export interface InventoryFilters {
  query: string;
  status: "all" | "in_stock" | "low_stock" | "out_of_stock";
  businessUnitId: string | "all";
}

export interface InventoryFormValues {
  catalogItemId: string;
  businessUnitId: string;
  variantName: string;
  sku: string;
  barcode: string;
  stockQuantity: string;
  lowStockAlert: string;
  costPrice: string;
  supplier: string;
  location: string;
}

export interface BulkUpdateEntry {
  inventoryId: string;
  itemName: string;
  variantName: string;
  currentStock: number;
  newStock: string;
}

export type { InventoryRecord };
