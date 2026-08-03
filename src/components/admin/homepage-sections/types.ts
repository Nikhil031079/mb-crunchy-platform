import type { SectionType } from "@/types";

export const sectionTypes: SectionType[] = [
  "hero",
  "businessUnits",
  "featuredProducts",
  "combos",
  "partyPacks",
  "offers",
  "content",
  "testimonials",
  "footer",
];

export const sectionTypeLabels: Record<SectionType, string> = {
  hero: "Hero Banner",
  businessUnits: "Business Units",
  featuredProducts: "Featured Products",
  combos: "Combos",
  partyPacks: "Party Packs",
  offers: "Offers",
  content: "Content Blocks",
  testimonials: "Testimonials",
  footer: "Footer",
};

export type SectionTarget = "both" | string;

export interface HomepageSectionRow {
  sectionType: SectionType;
  title?: string;
  displayOrder: number;
  visible: boolean;
  target: SectionTarget;
  /** BU ids this row currently applies to */
  businessUnitIds: string[];
  /** Raw section doc id from the primary BU (used for preview identity) */
  id: string;
  startDate?: number;
  endDate?: number;
  ctaLabel?: string;
  ctaLink?: string;
  subtitle?: string;
}

export interface HomepageSectionFormValues {
  sectionType: SectionType;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  target: SectionTarget;
  displayOrder: number;
  visible: boolean;
  startDate: string;
  endDate: string;
}

export const defaultSectionTarget: SectionTarget = "both";
