// ============================================================================
// MB CRUNCHY - Analytics Foundation
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdminRole } from "./utils/adminAuth";

// ============================================================================
// Daily Metrics Queries
// ============================================================================

export const getDailyMetrics = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    return await ctx.db
      .query("dailyMetrics")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("date", args.date)
      )
      .first();
  },
});

export const getMetricsRange = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    return await ctx.db
      .query("dailyMetrics")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), args.startDate),
          q.lte(q.field("date"), args.endDate)
        )
      )
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Daily Metrics Mutations
// ============================================================================

export const upsertDailyMetric = internalMutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    date: v.string(),
    totalOrders: v.number(),
    totalRevenue: v.number(),
    averageOrderValue: v.number(),
    topProducts: v.optional(v.any()),
    topCombos: v.optional(v.any()),
    popularCategories: v.optional(v.any()),
    mostSearched: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("dailyMetrics")
      .withIndex("by_business_unit", (q: any) =>
        q.eq("businessUnitId", args.businessUnitId).eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("dailyMetrics", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Analytics Events
// ============================================================================

// ============================================================================
// Analytics Events — abuse hardening (Phase 10G)
// ----------------------------------------------------------------------------
// trackEvent is intentionally public: guest browsing / guest checkout is an
// intentional product flow, so anonymous analytics must keep working and no
// login is required. It is hardened instead of gated:
//
// 1. eventType is a closed literal union (view/search/add_to_cart/purchase/
//    share) enforced by the Convex argument validator — free-form or
//    oversized event names are rejected before the handler runs.
// 2. sessionId stays optional but is bounded server-side (max length,
//    control-character rejection). Empty/whitespace-only values normalize to
//    "absent" (anonymous) instead of being stored as junk.
// 3. metadata stays v.any() at the validator level (back-compat) but is
//    constrained at runtime: must be a plain JSON object, JSON-serializable,
//    with a serialized-size cap. Payloads are rejected, never silently
//    truncated (truncation would change analytics meaning).
// 4. Rate limiting is server-side and DB-backed (no in-memory Map, no Redis,
//    works across instances): a single by_business_unit window query counts
//    recent events, following the orders.create per-phone precedent.
//    Key = (businessUnitId, sessionId-or-anonymous). No IP is used — Convex
//    mutations expose no trustworthy server-side client IP, and a
//    browser-supplied id is treated as a weak abuse-reduction key, not a
//    security identity.
//
// Rejections throw (project convention, same as the orders rate limit).
// trackEvent writes ONLY to analyticsEvents, so a rejection can never mutate
// order/payment/loyalty/coupon/inventory state. Future callers must still
// treat analytics as best-effort (try/catch, fire-and-forget).
// ============================================================================

export const ANALYTICS_EVENT_TYPES = [
  "view",
  "search",
  "add_to_cart",
  "purchase",
  "share",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const ANALYTICS_SESSION_ID_MAX_LENGTH = 128;
export const ANALYTICS_METADATA_MAX_BYTES = 2048;
export const ANALYTICS_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const ANALYTICS_MAX_EVENTS_PER_SESSION_PER_WINDOW = 120;
export const ANALYTICS_MAX_ANONYMOUS_EVENTS_PER_WINDOW = 300;
export const ANALYTICS_MAX_EVENTS_PER_BUSINESS_UNIT_PER_WINDOW = 2000;

function hasAnalyticsControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normalize and bound a client-supplied session id.
 * Returns undefined for absent/blank ids (anonymous analytics).
 * Throws on oversized or control-character-containing values.
 */
export function normalizeAnalyticsSessionId(
  sessionId?: string
): string | undefined {
  if (sessionId === undefined) return undefined;
  if (typeof sessionId !== "string") {
    throw new Error("Invalid analytics sessionId: must be a string.");
  }
  const trimmed = sessionId.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > ANALYTICS_SESSION_ID_MAX_LENGTH) {
    throw new Error(
      `Invalid analytics sessionId: must be at most ${ANALYTICS_SESSION_ID_MAX_LENGTH} characters.`
    );
  }
  if (hasAnalyticsControlChars(trimmed)) {
    throw new Error(
      "Invalid analytics sessionId: must not contain control characters."
    );
  }
  return trimmed;
}

/**
 * Bound analytics metadata without changing its meaning.
 * Must be a plain JSON object (arrays/null/scalars rejected), must be
 * JSON-serializable (circular structures rejected), and the serialized form
 * must fit within ANALYTICS_METADATA_MAX_BYTES. Oversized payloads are
 * rejected — never truncated.
 */
export function validateAnalyticsMetadata(metadata?: unknown): void {
  if (metadata === undefined) return;
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Invalid analytics metadata: must be a JSON object.");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    throw new Error(
      "Invalid analytics metadata: must be JSON-serializable."
    );
  }
  if (typeof serialized !== "string") {
    throw new Error(
      "Invalid analytics metadata: must be JSON-serializable."
    );
  }
  if (serialized.length > ANALYTICS_METADATA_MAX_BYTES) {
    throw new Error(
      `Invalid analytics metadata: serialized size exceeds the limit of ${ANALYTICS_METADATA_MAX_BYTES} characters.`
    );
  }
}

/**
 * Pure rate-limit verdict over counts observed in the current window.
 * Returns null when the event may be recorded, otherwise the rejection
 * reason. Kept pure (no ctx) so it is unit-testable without Convex.
 */
export function evaluateAnalyticsRateLimit(args: {
  recentTotal: number;
  sessionCount: number;
  hasSession: boolean;
}): string | null {
  if (
    args.recentTotal >= ANALYTICS_MAX_EVENTS_PER_BUSINESS_UNIT_PER_WINDOW
  ) {
    return "Too many analytics events right now. Please try again later.";
  }
  const bucketLimit = args.hasSession
    ? ANALYTICS_MAX_EVENTS_PER_SESSION_PER_WINDOW
    : ANALYTICS_MAX_ANONYMOUS_EVENTS_PER_WINDOW;
  if (args.sessionCount >= bucketLimit) {
    return "Too many analytics events right now. Please try again later.";
  }
  return null;
}

export const trackEvent = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    eventType: v.union(
      v.literal("view"),
      v.literal("search"),
      v.literal("add_to_cart"),
      v.literal("purchase"),
      v.literal("share")
    ),
    catalogItemId: v.optional(v.id("catalogItems")),
    sessionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const sessionId = normalizeAnalyticsSessionId(args.sessionId);
    validateAnalyticsMetadata(args.metadata);

    const now = Date.now();
    const cutoff = now - ANALYTICS_RATE_LIMIT_WINDOW_MS;
    const recent = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).gte("createdAt", cutoff)
      )
      .collect();

    const bucketKey = sessionId ?? "";
    let sessionCount = 0;
    for (const event of recent) {
      if ((event.sessionId ?? "") === bucketKey) sessionCount++;
    }

    const denial = evaluateAnalyticsRateLimit({
      recentTotal: recent.length,
      sessionCount,
      hasSession: sessionId !== undefined,
    });
    if (denial) {
      throw new Error(denial);
    }

    return await ctx.db.insert("analyticsEvents", {
      businessUnitId: args.businessUnitId,
      eventType: args.eventType,
      ...(args.catalogItemId !== undefined
        ? { catalogItemId: args.catalogItemId }
        : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      createdAt: now,
    });
  },
});

export const getEvents = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    eventType: v.optional(
      v.union(
        v.literal("view"),
        v.literal("search"),
        v.literal("add_to_cart"),
        v.literal("purchase"),
        v.literal("share")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    let query = ctx.db
      .query("analyticsEvents")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      );

    if (args.eventType) {
      query = query.filter((q) => q.eq(q.field("eventType"), args.eventType));
    }

    const results = await query.order("desc").collect();
    return args.limit ? results.slice(0, args.limit) : results;
  },
});

export const getMostViewed = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const events = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_event_type", (q) => q.eq("eventType", "view"))
      .filter((q) => q.eq(q.field("businessUnitId"), args.businessUnitId))
      .order("desc")
      .collect();

    // Count views per catalog item
    const viewCounts = new Map<string, number>();
    for (const event of events) {
      if (event.catalogItemId) {
        const count = viewCounts.get(event.catalogItemId) || 0;
        viewCounts.set(event.catalogItemId, count + 1);
      }
    }

    // Sort by count descending
    const sorted = [...viewCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.limit || 10)
      .map(([catalogItemId, count]) => ({ catalogItemId, count }));

    return sorted;
  },
});
