// ============================================================================
// MB CRUNCHY - Notifications Module
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("notifications")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getChannel = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("sms"),
      v.literal("email"),
      v.literal("push")
    ),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("notifications")
      .withIndex("by_channel", (q) =>
        q
          .eq("businessUnitId", args.businessUnitId)
          .eq("channel", args.channel)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getEnabledChannels = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("notifications")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("enabled"), true),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const upsertChannel = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("sms"),
      v.literal("email"),
      v.literal("push")
    ),
    enabled: v.boolean(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    // Check if config already exists for this channel
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_channel", (q: any) =>
        q
          .eq("businessUnitId", args.businessUnitId)
          .eq("channel", args.channel)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        config: {
          ...(existing.config as Record<string, unknown>),
          ...(args.config as Record<string, unknown>),
        },
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("notifications", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("notifications") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
