// ============================================================================
// MB CRUNCHY - Catalog Items (Unified index for Products, Combos, Party Packs)
// ============================================================================

import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

/**
 * Authoritative, format-agnostic check that a list of raw strings are real
 * catalogItems document IDs. Uses Convex's own table-aware ID normalization
 * (IDs encode their table as a prefix), so it correctly rejects combos,
 * party packs and product source IDs without hardcoding any ID format.
 * Shared by the cart store (add-time guard + hydration sanitize).
 */
export const verifyCatalogItemIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const uniqueIds = Array.from(new Set(args.ids));
    const results: Record<string, boolean> = {};
    for (const rawId of uniqueIds) {
      const id = ctx.db.normalizeId("catalogItems", rawId);
      if (!id) {
        results[rawId] = false;
        continue;
      }
      const doc = await ctx.db.get(id);
      results[rawId] = !!doc && !doc.deletedAt;
    }
    return results;
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

/**
 * Returns recommended catalog items across ALL active business units,
 * excluding the provided item IDs. This is used for cross-BU recommendations
 * so that a cart containing only Kitchen items can still recommend Mart items,
 * and vice versa.
 *
 * The frontend should use this with a single stable useQuery call regardless
 * of cart contents, fixing the dynamic hook count violation.
 */
export const getRecommendedAcrossBusinessUnits = query({
  args: {
    excludeIds: v.array(v.id("catalogItems")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const excludeSet = new Set(args.excludeIds);
    // Query across ALL active business units by not filtering on businessUnitId
    const items = await ctx.db
      .query("catalogItems")
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

export const getByCategoryIds = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    categoryIds: v.array(v.id("categories")),
    excludeIds: v.optional(v.array(v.id("catalogItems"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    if (args.categoryIds.length === 0) return [];
    const excludeSet = new Set(args.excludeIds ?? []);

    const sourceIds = new Set<string>();
    for (const categoryId of args.categoryIds) {
      const products = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("deletedAt"), undefined)
          )
        )
        .collect();
      for (const product of products) sourceIds.add(product._id);
    }
    if (sourceIds.size === 0) return [];

    const items = await ctx.db
      .query("catalogItems")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("itemType"), "product")
        )
      )
      .collect();

    return items
      .filter(
        (item) => sourceIds.has(item.sourceId) && !excludeSet.has(item._id)
      )
      .slice(0, limit);
  },
});

export const getCoPurchased = query({
  args: {
    catalogItemId: v.id("catalogItems"),
    businessUnitId: v.id("businessUnits"),
    excludeIds: v.optional(v.array(v.id("catalogItems"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;
    const excludeSet = new Set(args.excludeIds ?? []);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.gte(q.field("createdAt"), cutoff)
        )
      )
      .collect();

    const coCounts = new Map<string, number>();
    for (const order of orders) {
      const containsTarget = order.items.some(
        (i) => i.catalogItemId === args.catalogItemId
      );
      if (!containsTarget) continue;
      for (const item of order.items) {
        if (item.catalogItemId === args.catalogItemId) continue;
        const key = item.catalogItemId as string;
        coCounts.set(key, (coCounts.get(key) ?? 0) + 1);
      }
    }

    if (coCounts.size === 0) return [];

    const sorted = [...coCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const items = await Promise.all(
      sorted.map(async ([id]) => await ctx.db.get(id as Id<"catalogItems">))
    );

    return items.filter(
      (item): item is NonNullable<typeof item> =>
        !!item &&
        item.status === "active" &&
        !item.deletedAt &&
        !excludeSet.has(item._id)
    );
  },
});

export const getTrendingRanked = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    excludeIds: v.optional(v.array(v.id("catalogItems"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const excludeSet = new Set(args.excludeIds ?? []);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const viewCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

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
      .collect();

    if (items.length === 0) return [];

    const orderCounts = new Map<string, number>();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.gte(q.field("createdAt"), cutoff)
        )
      )
      .collect();
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.catalogItemId as string;
        orderCounts.set(key, (orderCounts.get(key) ?? 0) + item.quantity);
      }
    }

    const viewCounts = new Map<string, number>();
    const views = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).gte("createdAt", viewCutoff)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("eventType"), "view"),
          q.neq(q.field("catalogItemId"), undefined)
        )
      )
      .collect();
    for (const e of views) {
      if (e.catalogItemId) {
        const key = e.catalogItemId as string;
        viewCounts.set(key, (viewCounts.get(key) ?? 0) + 1);
      }
    }

    return items
      .filter((item) => !excludeSet.has(item._id))
      .map((item) => ({
        item,
        score:
          (item.featured ? 1_000_000 : 0) +
          (orderCounts.get(item._id as string) ?? 0) * 100 +
          (viewCounts.get(item._id as string) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.item);
  },
});

// ============================================================================
// Internal sync mutation (called by product/combo/partyPack mutations only)
// ============================================================================

export const sync = internalMutation({
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
 * Soft delete a catalog item by source ID.
 * Internal-only: called by the admin-gated product/combo/partyPack deletions.
 */
export const softDeleteBySource = internalMutation({
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
