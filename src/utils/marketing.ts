import type { Content, HomepageSection, Offer } from "@/types";

// ============================================================================
// Marketing helpers — shared date-validity logic for the dynamic homepage
// ============================================================================

/**
 * Whether a content record is currently valid.
 * Records without a start/end date are treated as always valid; otherwise the
 * record must fall inside its configured window.
 */
export function isContentActive(
  content: Pick<Content, "startDate" | "endDate"> | undefined | null
): boolean {
  if (!content) return false;
  const now = Date.now();
  if (content.startDate && now < content.startDate) return false;
  if (content.endDate && now > content.endDate) return false;
  return true;
}

/**
 * Whether an offer is currently within its active window.
 * Offers always carry required startsAt/endsAt timestamps.
 */
export function isOfferActive(
  offer: Pick<Offer, "startsAt" | "endsAt"> | undefined | null
): boolean {
  if (!offer) return false;
  const now = Date.now();
  return now >= offer.startsAt && now <= offer.endsAt;
}

/**
 * Build a promotional badge label from an offer's discount.
 * Supports percentage and fixed discount types.
 */
export function formatOfferBadge(offer: Pick<Offer, "discountType" | "discountValue">): string {
  if (offer.discountType === "percentage") {
    return `${offer.discountValue}% OFF`;
  }
  return `₹${offer.discountValue} OFF`;
}

// ============================================================================
// Campaign scheduling helpers (admin + customer)
// ============================================================================

export type CampaignWindowStatus = "active" | "scheduled" | "expired" | "none";

/**
 * Resolve the window state of a dated campaign relative to now.
 * A missing window is "none" (always on). Only "active" passes date checks.
 */
export function getCampaignWindowStatus(
  startDate?: number,
  endDate?: number,
  now: number = Date.now()
): CampaignWindowStatus {
  if (!startDate && !endDate) return "none";
  if (endDate && now > endDate) return "expired";
  if (startDate && now < startDate) return "scheduled";
  return "active";
}

/**
 * True when two [start, end] ranges overlap. Untimed ranges are treated as
 * open-ended and overlap with everything.
 */
export function hasDateOverlap(
  aStart: number | undefined,
  aEnd: number | undefined,
  bStart: number | undefined,
  bEnd: number | undefined
): boolean {
  const aOpen = !aStart && !aEnd;
  const bOpen = !bStart && !bEnd;
  if (aOpen || bOpen) return true;
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

// ============================================================================
// Typed settings accessors — Convex stores extended marketing fields in the
// flexible `settings` object so existing documents keep working.
// ============================================================================

export interface OfferMarketingSettings {
  featured: boolean;
  homeVisible: boolean;
  categoryVisible: boolean;
  isFlashSale: boolean;
  flashSalePriority: number;
  flashSaleFeatured: boolean;
}

export function getOfferMarketingSettings(offer: Pick<Offer, "settings"> | undefined | null): OfferMarketingSettings {
  const settings = (offer?.settings ?? {}) as Record<string, unknown>;
  return {
    featured: settings.featured === true,
    homeVisible: settings.homeVisible !== false,
    categoryVisible: settings.categoryVisible !== false,
    isFlashSale: settings.isFlashSale === true,
    flashSalePriority: typeof settings.flashSalePriority === "number" ? settings.flashSalePriority : 0,
    flashSaleFeatured: settings.flashSaleFeatured === true,
  };
}

export interface ContentMarketingSettings {
  mobileImage?: string;
  exclusive: boolean;
  backgroundColor?: string;
  textColor?: string;
  icon?: string;
  richText: boolean;
  sectionWidth?: "full" | "contained" | "narrow";
  contentBlockStyle?: "card" | "fullBleed";
}

export function getContentMarketingSettings(content: Pick<Content, "settings"> | undefined | null): ContentMarketingSettings {
  const settings = (content?.settings ?? {}) as Record<string, unknown>;
  return {
    mobileImage: typeof settings.mobileImage === "string" ? settings.mobileImage : undefined,
    exclusive: settings.exclusive === true,
    backgroundColor: typeof settings.backgroundColor === "string" ? settings.backgroundColor : undefined,
    textColor: typeof settings.textColor === "string" ? settings.textColor : undefined,
    icon: typeof settings.icon === "string" ? settings.icon : undefined,
    richText: settings.richText === true,
    sectionWidth: settings.sectionWidth === "full" || settings.sectionWidth === "narrow"
      ? settings.sectionWidth
      : "contained",
    contentBlockStyle: settings.contentBlockStyle === "fullBleed" ? "fullBleed" : "card",
  };
}

export interface HomepageSectionSettings {
  subtitle?: string;
  ctaLabel?: string;
  ctaLink?: string;
  startDate?: number;
  endDate?: number;
  priority: number;
  target?: "both" | string;
  hidden?: boolean;
}

export function getHomepageSectionSettings(section: Pick<HomepageSection, "settings"> | undefined | null): HomepageSectionSettings {
  const settings = (section?.settings ?? {}) as Record<string, unknown>;
  return {
    subtitle: typeof settings.subtitle === "string" ? settings.subtitle : undefined,
    ctaLabel: typeof settings.ctaLabel === "string" ? settings.ctaLabel : undefined,
    ctaLink: typeof settings.ctaLink === "string" ? settings.ctaLink : undefined,
    startDate: typeof settings.startDate === "number" ? settings.startDate : undefined,
    endDate: typeof settings.endDate === "number" ? settings.endDate : undefined,
    priority: typeof settings.priority === "number" ? settings.priority : 0,
    target: typeof settings.target === "string" ? settings.target : undefined,
    hidden: settings.hidden === true,
  };
}
