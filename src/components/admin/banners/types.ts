export const bannerStatuses = ["active", "inactive", "archived"] as const;
export type BannerStatus = (typeof bannerStatuses)[number];

export const contentTypes = ["hero", "promotion", "offer", "homepageCard", "announcement", "popup", "seasonal"] as const;
export type ContentType = (typeof contentTypes)[number];

export const contentTypeLabels: Record<ContentType, string> = {
  hero: "Hero Banner",
  promotion: "Promotion",
  offer: "Offer",
  homepageCard: "Homepage Card",
  announcement: "Announcement",
  popup: "Popup",
  seasonal: "Seasonal",
};

export interface Banner {
  id: string;
  businessUnitId?: string;
  businessUnitName?: string;
  contentType: ContentType;
  title: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonLink?: string;
  displayOrder: number;
  status: BannerStatus;
  startDate?: number;
  endDate?: number;
}

export interface BannerFormValues {
  businessUnitId: string;
  contentType: ContentType;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  buttonText: string;
  buttonLink: string;
  displayOrder: number;
  status: BannerStatus;
  startDate: string;
  endDate: string;
}

export type BannerSortKey = "title" | "contentType" | "status" | "displayOrder" | "businessUnitName";
export type SortDirection = "asc" | "desc";

export interface BannerFilters {
  query: string;
  status: BannerStatus | "all";
  contentType: ContentType | "all";
  businessUnitId: string | "all";
}
