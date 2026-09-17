export const businessUnitStatuses = ["active", "inactive", "archived"] as const;

export type BusinessUnitStatus = (typeof businessUnitStatuses)[number];

export interface BusinessUnit {
  id: string;
  name: string;
  slug: string;
  status: BusinessUnitStatus;
  homepageVisible: boolean;
  themeColor: string;
  displayOrder: number;
  logoUrl?: string;
  enableCombos?: boolean;
  enablePartyPacks?: boolean;
  enableDelivery?: boolean;
  serviceabilityMode?: "coordinate_radius" | "pincode_region" | "manual";
  originLatitude?: number;
  originLongitude?: number;
  deliveryRadiusKm?: number;
  iconName?: string;
  catalogMode?: "food" | "grocery";
  catalogLabel?: string;
}

export interface BusinessUnitFormValues {
  name: string;
  slug: string;
  status: BusinessUnitStatus;
  homepageVisible: boolean;
  themeColor: string;
  displayOrder: number;
  logoUrl: string;
  enableCombos?: boolean;
  enablePartyPacks?: boolean;
  enableDelivery?: boolean;
  serviceabilityMode?: "coordinate_radius" | "pincode_region" | "manual";
  originLatitude?: number;
  originLongitude?: number;
  deliveryRadiusKm?: number;
  iconName?: string;
  catalogMode?: "food" | "grocery";
  catalogLabel?: string;
}

export type BusinessUnitSortKey = "name" | "slug" | "status" | "displayOrder";
export type SortDirection = "asc" | "desc";

export interface BusinessUnitFilters {
  query: string;
  status: BusinessUnitStatus | "all";
}
