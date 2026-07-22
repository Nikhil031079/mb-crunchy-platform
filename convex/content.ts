// ============================================================================
// MB CRUNCHY - Content Management (Hero, Promotion, Announcement, etc.)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getActive = query({
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("content")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("startDate"), undefined),
          q.lte(q.field("startDate"), now),
          q.neq(q.field("endDate"), undefined),
          q.gte(q.field("endDate"), now)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("content")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getByType = query({
  args: {
    businessUnitId: v.optional(v.id("businessUnits")),
    contentType: v.union(
      v.literal("hero"),
      v.literal("promotion"),
      v.literal("offer"),
      v.literal("homepageCard"),
      v.literal("announcement"),
      v.literal("popup"),
      v.literal("seasonal")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let query = ctx.db
      .query("content")
      .withIndex("by_content_type", (q) => q.eq("contentType", args.contentType))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("status"), "active")
        )
      );

    if (args.businessUnitId) {
      query = query.filter((q) =>
        q.eq(q.field("businessUnitId"), args.businessUnitId)
      );
    }

    return await query.order("asc").collect();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("content")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    businessUnitId: v.optional(v.id("businessUnits")),
    contentType: v.union(
      v.literal("hero"),
      v.literal("promotion"),
      v.literal("offer"),
      v.literal("homepageCard"),
      v.literal("announcement"),
      v.literal("popup"),
      v.literal("seasonal")
    ),
    title: v.string(),
    subtitle: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.array(v.string()),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    buttonLink: v.optional(v.string()),
    displayOrder: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = Date.now();

    return await ctx.db.insert("content", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("content"),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    buttonLink: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const softDelete = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});
