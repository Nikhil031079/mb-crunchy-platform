// ============================================================================
// MB CRUNCHY - Settings Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getBusinessUnitSettings = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settings")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getGlobalSettings = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("globalSettings")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const upsertBusinessUnitSettings = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    currency: v.string(),
    taxRate: v.number(),
    deliveryFee: v.number(),
    freeDeliveryThreshold: v.optional(v.number()),
    openingHours: v.optional(v.any()),
    isOpen: v.boolean(),

    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        instagram: v.optional(v.string()),
        facebook: v.optional(v.string()),
        twitter: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = Date.now();

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("settings", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertGlobalSettings = mutation({
  args: {
    siteName: v.string(),
    siteDescription: v.optional(v.string()),
    logo: v.optional(v.string()),
    favicon: v.optional(v.string()),
    primaryColor: v.string(),
    supportEmail: v.optional(v.string()),
    supportPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = Date.now();
    const existing = await ctx.db.query("globalSettings").first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("globalSettings", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});
