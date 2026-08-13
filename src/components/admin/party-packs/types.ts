export const partyPackStatuses = ["active", "inactive", "archived"] as const;

export type PartyPackStatus = (typeof partyPackStatuses)[number];

export interface PartyPackItemValue {
  catalogItemId: string;
  quantity: number;
}

export interface PartyPack {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  items: PartyPackItemValue[];
  minServings: number;
  maxServings: number;
  price: number;
  compareAtPrice?: number;
  status: PartyPackStatus;
  featured: boolean;
  displayOrder: number;
}

export interface PartyPackFormValues {
  businessUnitId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  items: PartyPackItemValue[];
  minServings: number;
  maxServings: number;
  price: number;
  compareAtPrice: number;
  status: PartyPackStatus;
  featured: boolean;
  displayOrder: number;
}

export type PartyPackSortKey = "name" | "slug" | "businessUnitName" | "status" | "displayOrder" | "price";
export type SortDirection = "asc" | "desc";

export interface PartyPackFilters {
  query: string;
  status: PartyPackStatus | "all";
  businessUnitId: string | "all";
}
