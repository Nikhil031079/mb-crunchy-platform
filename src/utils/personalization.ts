import type { CatalogItem, HomepageSection } from "@/types";
import { getHomepageSectionSettings } from "./marketing";

// ============================================================================
// MB CRUNCHY - Personalization & Merchandising helpers
// ============================================================================

// ----------------------------------------------------------------------------
// Homepage section lifecycle states
// ----------------------------------------------------------------------------

export type HomepageSectionState =
  | "active"
  | "scheduled"
  | "expired"
  | "hidden"
  | "draft";

/**
 * Resolve the lifecycle state of a homepage section relative to now:
 *  - "draft": created but not yet published (visible is false)
 *  - "hidden": explicitly hidden via settings.hidden or soft-deleted
 *  - "scheduled": visible but its configured start date is in the future
 *  - "expired": visible but its configured end date has passed
 *  - "active": visible and within its schedule window (or no window at all)
 */
export function getHomepageSectionState(
  section: Pick<
    HomepageSection,
    "visible" | "deletedAt" | "settings"
  >,
  now: number = Date.now()
): HomepageSectionState {
  if (section.deletedAt) return "hidden";
  if (!section.visible) return "draft";
  const settings = getHomepageSectionSettings(section);
  if (settings.hidden === true) return "hidden";
  if (settings.startDate && now < settings.startDate) return "scheduled";
  if (settings.endDate && now > settings.endDate) return "expired";
  return "active";
}

export function isActiveSection(
  section: Pick<HomepageSection, "visible" | "deletedAt" | "settings">,
  now: number = Date.now()
): boolean {
  return getHomepageSectionState(section, now) === "active";
}

/**
 * Order homepage sections for rendering:
 *  1. settings.priority (descending) — admins can override order
 *  2. sections tied to the preferred business unit (via businessUnitId or
 *     settings.target) first — BU personalization, never hiding others
 *  3. displayOrder (ascending)
 * Only "active" sections are returned.
 */
export function sortHomepageSections(
  sections: HomepageSection[],
  preferredBusinessUnitId?: string,
  now: number = Date.now()
): HomepageSection[] {
  return sections
    .filter((section) => isActiveSection(section, now))
    .sort((a, b) => {
      const priorityA = getHomepageSectionSettings(a).priority;
      const priorityB = getHomepageSectionSettings(b).priority;
      if (priorityA !== priorityB) return priorityB - priorityA;
      if (preferredBusinessUnitId) {
        const aPreferred =
          a.businessUnitId === preferredBusinessUnitId ||
          getHomepageSectionSettings(a).target === preferredBusinessUnitId
            ? 1
            : 0;
        const bPreferred =
          b.businessUnitId === preferredBusinessUnitId ||
          getHomepageSectionSettings(b).target === preferredBusinessUnitId
            ? 1
            : 0;
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      }
      return a.displayOrder - b.displayOrder;
    });
}

// ----------------------------------------------------------------------------
// Seasonal context
// ----------------------------------------------------------------------------

export type SeasonId = "summer" | "monsoon" | "festival" | "winter" | "none";

export interface SeasonalContext {
  season: SeasonId;
  isWeekend: boolean;
  hour: number;
  isEvening: boolean;
}

const FESTIVAL_RANGES: Array<[number, number, number, number]> = [
  // New Year / Christmas (Dec 20 – Jan 2)
  [12, 20, 1, 2],
  // Holi (Mar 7 – Mar 17)
  [3, 7, 3, 17],
  // Diwali (Oct 20 – Nov 20)
  [10, 20, 11, 20],
];

function isInFestivalRange(month: number, day: number): boolean {
  for (const [startMonth, startDay, endMonth, endDay] of FESTIVAL_RANGES) {
    const start = startMonth * 100 + startDay;
    const end = endMonth * 100 + endDay;
    const current = month * 100 + day;
    if (start <= end) {
      if (current >= start && current <= end) return true;
    } else if (current >= start || current <= end) {
      return true;
    }
  }
  return false;
}

/**
 * Derive a deterministic seasonal context from the current date/time.
 * Drives seasonal sections (festival banners, weekend specials, evening
 * snacks, summer drinks) without any admin configuration.
 */
export function getSeasonalContext(date: Date = new Date()): SeasonalContext {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  const hour = date.getHours();

  let season: SeasonId = "none";
  if (isInFestivalRange(month, day)) {
    season = "festival";
  } else if (month >= 4 && month <= 6) {
    season = "summer";
  } else if (month >= 7 && month <= 9) {
    season = "monsoon";
  } else if (month === 12 || month === 1 || month === 2) {
    season = "winter";
  }

  return {
    season,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    hour,
    isEvening: hour >= 17 && hour < 22,
  };
}

// ----------------------------------------------------------------------------
// Deterministic item ranking (no AI — weighted signal groups)
// ----------------------------------------------------------------------------

export interface RankedGroup {
  items: Array<CatalogItem | null | undefined>;
  weight: number;
}

/**
 * Merge ranked signal groups into a single deduped, score-ranked list.
 * Each item's score is the sum of weights of every group it appears in;
 * ties are broken lexicographically by _id so ordering is deterministic.
 */
export function rankCatalogItems(
  groups: RankedGroup[],
  limit: number
): CatalogItem[] {
  const scores = new Map<string, { item: CatalogItem; score: number }>();
  for (const group of groups) {
    for (const item of group.items) {
      if (!item) continue;
      const entry = scores.get(item._id);
      if (entry) {
        entry.score += group.weight;
      } else {
        scores.set(item._id, { item, score: group.weight });
      }
    }
  }
  return [...scores.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item._id < b.item._id ? -1 : 1;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Merge multiple item arrays into one array without duplicate ids,
 * preserving the order of first appearance.
 */
export function mergeUniqueById<T extends { _id: string }>(...arrays: T[][]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      if (!seen.has(item._id)) {
        seen.add(item._id);
        result.push(item);
      }
    }
  }
  return result;
}
