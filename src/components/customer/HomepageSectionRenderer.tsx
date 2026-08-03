import { useMemo } from "react";

import { BusinessUnitSections } from "./BusinessUnitSections";
import { BestSellersSection } from "./BestSellersSection";
import { ComboOffersSection } from "./ComboOffersSection";
import { PartyPacksSection } from "./PartyPacksSection";
import { FeaturedOffersSection } from "./FeaturedOffersSection";
import { ContentSection } from "./ContentSection";
import { TestimonialsSection } from "./TestimonialsSection";

import { sortHomepageSections } from "@/utils";

import type { BusinessUnit, HomepageSection, SectionType } from "@/types";

// ============================================================================
// HomepageSectionRenderer — renders homepage sections dynamically, driven by
// the `homepageSections` collection ordering (per the primary business unit).
// Sections are filtered to their active lifecycle state and ordered by
// admin priority, preferred-business-unit personalization, then displayOrder.
// Falls back to a sensible default order when none are configured.
// ============================================================================

interface HomepageSectionRendererProps {
  sections?: HomepageSection[];
  businessUnits: BusinessUnit[];
  preferredBusinessUnitId?: string;
}

/** Section types that are rendered by this component (hero/footer handled elsewhere). */
const RENDERED_TYPES = new Set<SectionType>([
  "businessUnits",
  "featuredProducts",
  "combos",
  "partyPacks",
  "offers",
  "content",
  "testimonials",
]);

const DEFAULT_SECTION_ORDER: SectionType[] = [
  "businessUnits",
  "featuredProducts",
  "combos",
  "partyPacks",
  "offers",
  "content",
  "testimonials",
];

export function HomepageSectionRenderer({
  sections,
  businessUnits,
  preferredBusinessUnitId,
}: HomepageSectionRendererProps) {
  const order = useMemo(() => {
    if (sections && sections.length > 0) {
      const sorted = sortHomepageSections(sections, preferredBusinessUnitId);
      const configured = sorted
        .map((section) => section.sectionType)
        .filter((type) => RENDERED_TYPES.has(type));
      if (configured.length > 0) return Array.from(new Set(configured));
    }
    return DEFAULT_SECTION_ORDER;
  }, [sections, preferredBusinessUnitId]);

  return (
    <>
      {order.map((type) => {
        switch (type) {
          case "businessUnits":
            return <BusinessUnitSections key={type} businessUnits={businessUnits} />;
          case "featuredProducts":
            return <BestSellersSection key={type} businessUnits={businessUnits} />;
          case "combos":
            return <ComboOffersSection key={type} businessUnits={businessUnits} />;
          case "partyPacks":
            return <PartyPacksSection key={type} businessUnits={businessUnits} />;
          case "offers":
            return <FeaturedOffersSection key={type} businessUnits={businessUnits} />;
          case "content":
            return <ContentSection key={type} />;
          case "testimonials":
            return <TestimonialsSection key={type} />;
          default:
            return null;
        }
      })}
    </>
  );
}
