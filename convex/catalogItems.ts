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

export const getByIds = query({
  args: { ids: v.array(v.id("catalogItems")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.ids.map(async (id) => {
        const doc = await ctx.db.get(id);
        if (!doc || doc.deletedAt) return null;
        return doc;
      }),
    );
    return results.filter(Boolean);
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

export const getBestSellers = query({
  args: { businessUnitId: v.id("businessUnits"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
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
      .take(limit);
  },
});

export const getRecommended = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    excludeIds: v.array(v.id("catalogItems")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const excludeSet = new Set(args.excludeIds);
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

    return items.filter((item) => !excludeSet.has(item._id)).slice(0, limit);
  },
});

export const getRelatedByTags = query({
  args: {
    catalogItemId: v.id("catalogItems"),
    tags: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;
    if (args.tags.length === 0) return [];

    const results: Awaited<ReturnType<typeof ctx.db.get>>[] = [];
    const seen = new Set<string>();
    seen.add(args.catalogItemId);

    // Search by each tag
    for (const tag of args.tags) {
      const matches = await ctx.db
        .query("catalogItems")
        .withIndex("by_tags", (q) =>
          (q as any).eq("tags", tag)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("deletedAt"), undefined),
          )
        )
        .take(limit + args.tags.length);

      for (const item of matches) {
        if (!seen.has(item._id as string)) {
          seen.add(item._id as string);
          results.push(item);
        }
      }
      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  },
});

export const getTrending = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).gte("createdAt", cutoff)
      )
      .filter((q) => q.neq(q.field("catalogItemId"), undefined))
      .collect();

    // Count by item
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.catalogItemId) {
        const id = e.catalogItemId as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    // Sort by count desc
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

    if (sorted.length === 0) return [];

    const ids = sorted.map(([id]) => id as any);
    const items = await Promise.all(ids.map(async (id) => await ctx.db.get(id)));
    return items.filter(Boolean);
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
