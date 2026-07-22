// ============================================================================
// MB CRUNCHY - Catalog Items (Unified index for Products, Combos, Party Packs)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogItems")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getFeatured = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogItems")
      .withIndex("by_featured", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("featured", true)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getBySlug = query({
  args: { businessUnitId: v.id("businessUnits"), slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogItems")
      .withIndex("by_slug_in_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("slug", args.slug)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getBySourceId = query({
  args: { sourceId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogItems")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("catalogItems")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const search = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("catalogItems")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("asc")
      .collect();

    if (!args.query.trim()) return items;

    const normalizedQuery = args.query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.tags?.some((t) => t.toLowerCase().includes(normalizedQuery)) ||
        item.description?.toLowerCase().includes(normalizedQuery)
    );
  },
});

// ============================================================================
// Internal sync mutation (called by product/combo/partyPack mutations)
// ============================================================================

export const sync = mutation({
  args: {
    sourceId: v.string(),
    businessUnitId: v.id("businessUnits"),
    itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    compareAtPrice: v.optional(v.number()),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    tags: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    featured: v.boolean(),
    displayOrder: v.number(),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    metaKeywords: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if a catalog item already exists for this source
    const existing = await ctx.db
      .query("catalogItems")
      .withIndex("by_source", (q: any) => q.eq("sourceId", args.sourceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        slug: args.slug,
        description: args.description,
        price: args.price,
        compareAtPrice: args.compareAtPrice,
        coverImage: args.coverImage,
        thumbnail: args.thumbnail,
        tags: args.tags,
        status: args.status,
        featured: args.featured,
        displayOrder: args.displayOrder,
        metaTitle: args.metaTitle,
        metaDescription: args.metaDescription,
        metaKeywords: args.metaKeywords,
        canonicalUrl: args.canonicalUrl,
        updatedAt: now,
        // If the source is being restored, clear deletedAt
        deletedAt: args.status === "active" ? undefined : existing.deletedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("catalogItems", {
      ...args,
      createdAt: now,
      updatedAt: now,
      thumbnail: args.thumbnail || args.coverImage,
    });
  },
});

/**
 * Soft delete a catalog item by source ID
 */
export const softDeleteBySource = mutation({
  args: { sourceId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("catalogItems")
      .withIndex("by_source", (q: any) => q.eq("sourceId", args.sourceId))
      .first();

    if (existing) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        status: "archived",
        deletedAt: now,
        updatedAt: now,
      });
    }
  },
});
