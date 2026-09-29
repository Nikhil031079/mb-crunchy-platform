export const productStatuses = ["active", "inactive", "archived"] as const;

export type ProductStatus = (typeof productStatuses)[number];

export const productUnits = ["pcs", "kg", "litre", "pack", "dozen", "box"] as const;

export type ProductUnit = (typeof productUnits)[number];

export const vegNonVegOptions = ["veg", "non-veg"] as const;

export type VegNonVeg = (typeof vegNonVegOptions)[number];

// ---------------------------------------------------------------------------
// Variant types
// ---------------------------------------------------------------------------

export interface AdminVariant {
  optionName: string;
  optionValue: string;
  price: number;
  compareAtPrice: string;
  sku: string;
  barcode: string;
  stock: string;
  costPrice: string;
  taxPercentage: string;
  image: string;
  minOrderQty: string;
  isDefault: boolean;
  sortOrder: number;
  active: boolean;
  netWeightGrams: string;
  volumeMl: string;
}

export function emptyVariant(sortOrder = 0): AdminVariant {
  return {
    optionName: "",
    optionValue: "",
    price: 0,
    compareAtPrice: "",
    sku: "",
    barcode: "",
    stock: "",
    costPrice: "",
    taxPercentage: "",
    image: "",
    minOrderQty: "",
    isDefault: sortOrder === 0,
    sortOrder,
    active: true,
    netWeightGrams: "",
    volumeMl: "",
  };
}

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
  images: string[];
  price: number;
  compareAtPrice?: number;
  variants: AdminVariant[];
  stockTotal?: number;
  sku?: string;
  stockQuantity?: number;
  unit?: ProductUnit;
  vegNonVeg?: VegNonVeg;
  taxPercentage?: number;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  shippable?: boolean;
  available: boolean;
  tags: string[];
  status: ProductStatus;
  featured: boolean;
  displayOrder: number;
  deletedAt?: number;
}

export interface ProductFormValues {
  businessUnitId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  price: number;
  compareAtPrice: string;
  variants: AdminVariant[];
  hasVariants: boolean;
  sku: string;
  stockQuantity: string;
  unit: ProductUnit;
  vegNonVeg: VegNonVeg;
  taxPercentage: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  shippable: boolean;
  available: boolean;
  tags: string;
  status: ProductStatus;
  featured: boolean;
  displayOrder: number;
}

export type ProductSortKey = "name" | "slug" | "businessUnitName" | "categoryName" | "status" | "displayOrder" | "price" | "stockTotal";
export type SortDirection = "asc" | "desc";

export interface ProductFilters {
  query: string;
  status: ProductStatus | "all";
  businessUnitId: string | "all";
  shipping: "all" | "needs-weight" | "non-shippable";
}

// ---------------------------------------------------------------------------
// Courier-shipping applicability (13D UI clarity)
// ---------------------------------------------------------------------------
// Mirrors the backend engine switch (orders.create §4a): only
// serviceabilityMode === "pincode_region" (MB Mart courier model) uses
// courier shipping weights. Kitchen (coordinate_radius / legacy undefined)
// uses local delivery/pickup and never needs them. UI-only decision helper;
// backend behavior is unchanged.
// ---------------------------------------------------------------------------

export function requiresCourierShipping(
  serviceabilityMode?: string,
): boolean {
  return serviceabilityMode === "pincode_region";
}

// ---------------------------------------------------------------------------
// Shipping weight status (12D admin visibility)
// ---------------------------------------------------------------------------
// Client-side mirror of the backend classifyProductWeight rule
// (convex/products.ts): product weightGrams wins; otherwise every ACTIVE
// variant must carry netWeightGrams; shippable === false is explicit
// opt-out. Backend aggregates remain authoritative for the summary counts.
// ---------------------------------------------------------------------------

export type ProductShippingState = "ok" | "needs-weight" | "non-shippable";

export function productShippingState(product: {
  shippable?: boolean;
  weightGrams?: number;
  variants?: Array<{ active?: boolean; netWeightGrams?: string | number }>;
}): ProductShippingState {
  if (product.shippable === false) return "non-shippable";
  if (typeof product.weightGrams === "number" && product.weightGrams > 0) {
    return "ok";
  }
  const active = (product.variants ?? []).filter((v) => v.active);
  if (
    active.length > 0 &&
    active.every((v) => {
      const grams = typeof v.netWeightGrams === "number" ? v.netWeightGrams : Number(v.netWeightGrams);
      return Number.isFinite(grams) && grams > 0;
    })
  ) {
    return "ok";
  }
  return "needs-weight";
}
