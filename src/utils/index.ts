// ============================================================================
// MB CRUNCHY - Utility Functions
// ============================================================================

/**
 * Generate a URL-friendly slug from a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number,
  currency: string = "INR"
): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date from timestamp
 */
export function formatDate(timestamp: number, format: "short" | "long" | "relative" = "short"): string {
  const date = new Date(timestamp);

  if (format === "relative") {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(timestamp, "short");
  }

  if (format === "long") {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a date and time string
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/**
 * Calculate discount percentage
 */
export function calculateDiscount(price: number, compareAtPrice: number): number {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/**
 * Generate a random order number
 */
export function generateOrderNumber(): string {
  const prefix = "MB";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate cart totals
 */
export function calculateCartTotals(items: Array<{
  quantity: number;
  unitPrice: number;
}>) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return { subtotal };
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Build a business unit URL
 */
export function buildBusinessUnitUrl(slug: string): string {
  return `/${slug}`;
}

/**
 * Build a category URL
 */
export function buildCategoryUrl(buSlug: string, catSlug: string): string {
  return `/${buSlug}/${catSlug}`;
}

/**
 * Build a product URL
 */
export function buildProductUrl(buSlug: string, catSlug: string, productSlug: string): string {
  return `/${buSlug}/${catSlug}/${productSlug}`;
}

/**
 * Check if an object is empty
 */
export function isEmpty(obj: Record<string, unknown> | null | undefined): boolean {
  if (!obj) return true;
  return Object.keys(obj).length === 0;
}

/**
 * Safely parse JSON
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convex document IDs are compact, table-encoded strings (e.g. catalogItems
 * IDs look like `k975w87y2njk22dtq5g29zxpxn8c1gdc` — NOT `catalogItems_...`).
 * A cart item must reference a catalogItems document; combos, party packs and
 * products keep their own tables and are synced into catalogItems separately.
 *
 * This is a cheap structural pre-filter: it accepts any well-formed Convex
 * document ID and rejects clearly-invalid values (empty, non-strings, legacy
 * `combos_...`/`partyPacks_...` references). Authoritative, table-aware
 * validation that an ID really belongs to the catalogItems table is done
 * server-side via `catalogItems:verifyCatalogItemIds` whenever a value enters
 * or is restored into the cart.
 */
export function isCatalogItemId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length >= 16 &&
    /^[a-z0-9]+$/.test(id)
  );
}

export function filterCatalogItemIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(isCatalogItemId)));
}

export {
  toCSV,
  downloadCSV,
  downloadJSON,
  downloadText,
} from "./csv";

export {
  isStoreCurrentlyOpen,
  getNextOpenTime,
  getTodayHours,
} from "./store-hours";
export type { NextOpenTime } from "./store-hours";

export {
  isContentActive,
  isOfferActive,
  formatOfferBadge,
  getCampaignWindowStatus,
  hasDateOverlap,
  getOfferMarketingSettings,
  getContentMarketingSettings,
  getHomepageSectionSettings,
} from "./marketing";

export {
  getHomepageSectionState,
  isActiveSection,
  sortHomepageSections,
  getSeasonalContext,
  rankCatalogItems,
  mergeUniqueById,
} from "./personalization";
export type {
  HomepageSectionState,
  SeasonId,
  SeasonalContext,
  RankedGroup,
} from "./personalization";
export {
  isValidCoordinate,
  hasValidLocationCoordinates,
  isValidIndianPin,
  haversineDistance,
  checkKitchenServiceability,
  PIN_APPROXIMATION_BUFFER_KM,
} from "./location";
export type {
  KitchenServiceability,
  ServiceabilityBU,
  ServiceabilityReason,
} from "./location";
