// ============================================================================
// MB CRUNCHY - Analytics Foundation
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

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
    await requireAdminSession(ctx, args.sessionToken);
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
    await requireAdminSession(ctx, args.sessionToken);
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
    return await ctx.db.insert("analyticsEvents", {
      ...args,
      createdAt: Date.now(),
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
    await requireAdminSession(ctx, args.sessionToken);
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
    await requireAdminSession(ctx, args.sessionToken);
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
