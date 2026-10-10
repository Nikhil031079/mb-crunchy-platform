import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import type { HomepageSection, SectionType } from "@/types";

// ============================================================================
// Phase 14A — Admin "Homepage Sections" -> storefront homepage wiring
// ============================================================================
//
// The customer homepage (/) is a single cross-store surface, so admin rows
// (one per business unit) must be merged before they can drive it.
//
// APPROVED MERGE RULES
// --------------------
// 1. Visibility (AND): a mapped type is hidden if ANY active-BU row for it
//    has visible === false. A missing row is NOT false, and a type with no
//    rows at all keeps its default visibility (never hidden by absence).
// 2. Ordering: `displayOrder` is the single source of truth.
//    `settings.priority` is ignored. When several active-BU rows exist for
//    a type, the MINIMUM displayOrder wins. Ties resolve deterministically
//    (default slot, then type key).
// 3. Partial configuration: an unconfigured type keeps its own default slot;
//    only configured types are reordered, and only within the union of their
//    own default slots. With no configuration at all, the existing homepage
//    composition and ordering are preserved exactly.
// 4. Only featuredProducts / combos / partyPacks are mapped (slots 7 / 9 / 10
//    of the 13-slot homepage). Everything else (hero, businessUnits, offers,
//    content, testimonials, footer) is inert in this phase.
// 5. Soft-deleted rows are ignored; rows are only ever read for active,
//    homepage-visible business units (businessUnits.getActive).
// 6. Schedules (settings.startDate / settings.endDate) remain inert — they
//    are stored by the admin form but NOT enforced by the storefront yet.
//
// Scope caps mirror the admin page: at most MAX_HOMEPAGE_BUSINESS_UNITS
// business units are read (the admin UI writes to the same set).
// ============================================================================

export const MAX_HOMEPAGE_BUSINESS_UNITS = 4;

/** The only section types this phase renders from admin configuration. */
export const MAPPED_SECTION_TYPES = ["featuredProducts", "combos", "partyPacks"] as const;

export type MappedSectionType = (typeof MAPPED_SECTION_TYPES)[number];

/** Existing homepage slots (of 13) the three mapped components occupy. */
export const MAPPED_DEFAULT_SLOTS: Record<MappedSectionType, number> = {
  featuredProducts: 7,
  combos: 9,
  partyPacks: 10,
};

export interface HomepageSectionsConfig {
  /** Mapped type -> hidden. Absence of rows keeps the default (true). */
  visible: Record<MappedSectionType, boolean>;
  /** The three mapped types ordered by homepage slot (7 -> 9 -> 10). */
  orderedTypes: MappedSectionType[];
}

function isMappedSectionType(sectionType: SectionType): sectionType is MappedSectionType {
  return (MAPPED_SECTION_TYPES as readonly SectionType[]).includes(sectionType);
}

/** Baseline: identical to the pre-Phase-14A homepage composition. */
export function baselineHomepageSections(): HomepageSectionsConfig {
  return {
    visible: { featuredProducts: true, combos: true, partyPacks: true },
    orderedTypes: [...MAPPED_SECTION_TYPES],
  };
}

/**
 * Pure merge of every active-BU row for the three mapped section types.
 * See the merge rules at the top of this file.
 */
export function mergeHomepageSectionRows(rows: readonly HomepageSection[]): HomepageSectionsConfig {
  const config = baselineHomepageSections();
  const rowsByType = new Map<MappedSectionType, HomepageSection[]>();

  for (const row of rows) {
    if (row.deletedAt) continue;
    if (!isMappedSectionType(row.sectionType)) continue;
    // Rule 1: one hidden business unit hides the section for everyone.
    if (!row.visible) config.visible[row.sectionType] = false;
    const existing = rowsByType.get(row.sectionType);
    if (existing) {
      existing.push(row);
    } else {
      rowsByType.set(row.sectionType, [row]);
    }
  }

  const configured = MAPPED_SECTION_TYPES.filter((type) => rowsByType.has(type));
  // Rule 3: no configuration -> existing composition and ordering, exactly.
  if (configured.length === 0) return config;

  // Unconfigured types keep their own default slot; configured types are
  // distributed over exactly those default slots they own, in merged
  // displayOrder order (min across active-BU rows, deterministic ties).
  const slotByType = new Map<MappedSectionType, number>();
  for (const type of MAPPED_SECTION_TYPES) {
    if (!configured.includes(type)) slotByType.set(type, MAPPED_DEFAULT_SLOTS[type]);
  }
  const freeSlots = configured
    .map((type) => MAPPED_DEFAULT_SLOTS[type])
    .sort((a, b) => a - b);

  const mergedOrder = (type: MappedSectionType) =>
    (rowsByType.get(type) ?? []).reduce(
      (min, row) => Math.min(min, row.displayOrder),
      Number.POSITIVE_INFINITY,
    );

  const orderedConfigured = [...configured].sort((a, b) => {
    const orderDiff = mergedOrder(a) - mergedOrder(b);
    if (orderDiff !== 0) return orderDiff;
    const slotDiff = MAPPED_DEFAULT_SLOTS[a] - MAPPED_DEFAULT_SLOTS[b];
    if (slotDiff !== 0) return slotDiff;
    return a.localeCompare(b);
  });

  orderedConfigured.forEach((type, index) => slotByType.set(type, freeSlots[index]));

  config.orderedTypes = [...MAPPED_SECTION_TYPES].sort(
    (a, b) => (slotByType.get(a) ?? 0) - (slotByType.get(b) ?? 0),
  );
  return config;
}

/**
 * Subscribes to the homepage-section rows of the active business units and
 * merges them per the rules above.
 *
 * While any expected row set is still loading the baseline config is
 * returned, so a slow query can never hide or displace a section.
 */
export function useHomepageSections(businessUnitIds: readonly string[]): HomepageSectionsConfig {
  const bu0 = businessUnitIds[0];
  const bu1 = businessUnitIds[1];
  const bu2 = businessUnitIds[2];
  const bu3 = businessUnitIds[3];

  const s0 = useQuery(api.homepageSections.getByBusinessUnit, bu0 ? { businessUnitId: bu0 as Id<"businessUnits"> } : "skip");
  const s1 = useQuery(api.homepageSections.getByBusinessUnit, bu1 ? { businessUnitId: bu1 as Id<"businessUnits"> } : "skip");
  const s2 = useQuery(api.homepageSections.getByBusinessUnit, bu2 ? { businessUnitId: bu2 as Id<"businessUnits"> } : "skip");
  const s3 = useQuery(api.homepageSections.getByBusinessUnit, bu3 ? { businessUnitId: bu3 as Id<"businessUnits"> } : "skip");

  const ids = [bu0, bu1, bu2, bu3];
  const results = [s0, s1, s2, s3];
  const stillLoading = ids.some((id, index) => id !== undefined && results[index] === undefined);
  if (stillLoading) return baselineHomepageSections();

  const rows: HomepageSection[] = [];
  for (const result of results) {
    if (result) rows.push(...result);
  }
  return mergeHomepageSectionRows(rows);
}
