export const offerStatuses = ["active", "inactive", "archived"] as const;

export type OfferStatus = (typeof offerStatuses)[number];

export const discountTypes = ["percentage", "fixed"] as const;

export type DiscountType = (typeof discountTypes)[number];

export interface Offer {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  title: string;
  description?: string;
  code?: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  startsAt: number;
  endsAt: number;
  usageLimit?: number;
  usedCount: number;
  status: OfferStatus;
  displayOrder: number;
  banner?: string;
}

export interface OfferFormValues {
  businessUnitId: string;
  title: string;
  description: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  status: OfferStatus;
  displayOrder: number;
  banner: string;
}

export type OfferSortKey = "title" | "code" | "businessUnitName" | "status" | "displayOrder" | "discountValue";
export type SortDirection = "asc" | "desc";

export interface OfferFilters {
  query: string;
  status: OfferStatus | "all";
  businessUnitId: string | "all";
}
