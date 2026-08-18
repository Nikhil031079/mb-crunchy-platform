// ============================================================================
// MB CRUNCHY - Party Packs Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Helpers
// ============================================================================

async function slugExists(
  ctx: any,
  businessUnitId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("partyPacks")
    .withIndex("by_slug_in_business_unit", (q: any) =>
      q.eq("businessUnitId", businessUnitId).eq("slug", slug)
    )
    .first();
  if (!existing) return false;
  if (excludeId && existing._id === excludeId) return false;
  return true;
}

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partyPacks")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
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
      .query("partyPacks")
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

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    images: v.array(v.string()),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    items: v.array(
      v.object({ catalogItemId: v.id("catalogItems"), quantity: v.number() })
    ),
    minServings: v.number(),
    maxServings: v.number(),
    price: v.number(),
    compareAtPrice: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    featured: v.boolean(),
    displayOrder: v.number(),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    metaKeywords: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    // Enforce unique slug
    if (await slugExists(ctx, args.businessUnitId, args.slug)) {
      throw new Error(`Slug "${args.slug}" is already in use`);
    }

    // Validate each component item is a product in the same business unit
    let serverCompareAtPrice = 0;
    for (const item of args.items) {
      const catalogItem = await ctx.db.get(item.catalogItemId);
      if (!catalogItem) {
        throw new Error(`Catalog item ${item.catalogItemId} not found`);
      }
      if (catalogItem.itemType !== "product") {
        throw new Error(`Party pack components must be products, got "${catalogItem.itemType}"`);
      }
      if (catalogItem.businessUnitId !== args.businessUnitId) {
        throw new Error(
          `Catalog item "${catalogItem.name}" belongs to a different business unit`
        );
      }
      const componentCompareAt =
        catalogItem.compareAtPrice !== undefined && catalogItem.compareAtPrice > 0
          ? catalogItem.compareAtPrice
          : 0;
      serverCompareAtPrice += componentCompareAt * item.quantity;
    }

    // Only store compareAtPrice if at least one component has one
    const finalCompareAtPrice = serverCompareAtPrice > 0 ? serverCompareAtPrice : undefined;

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    const packId = await ctx.db.insert("partyPacks", {
      ...insertArgs,
      compareAtPrice: finalCompareAtPrice,
      createdAt: now,
      updatedAt: now,
    });

    // Sync to catalog
    await ctx.runMutation(internal.catalogItems.sync, {
      sourceId: packId,
      businessUnitId: args.businessUnitId,
      itemType: "partyPack",
      name: args.name,
      slug: args.slug,
      description: args.description,
      price: args.price,
      compareAtPrice: finalCompareAtPrice,
      coverImage: args.coverImage,
      thumbnail: args.thumbnail,
      tags: [],
      status: args.status,
      featured: args.featured,
      displayOrder: args.displayOrder,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      metaKeywords: args.metaKeywords,
      canonicalUrl: args.canonicalUrl,
    });

    return packId;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("partyPacks"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    items: v.optional(
      v.array(
        v.object({ catalogItemId: v.id("catalogItems"), quantity: v.number() })
      )
    ),
    minServings: v.optional(v.number()),
    maxServings: v.optional(v.number()),
    price: v.optional(v.number()),
    compareAtPrice: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
    featured: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    metaKeywords: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, id, ...fields } = args;

    // Enforce unique slug on update
    if (fields.slug) {
      const existingDoc = await ctx.db.get(id);
      if (existingDoc && (await slugExists(ctx, existingDoc.businessUnitId, fields.slug, id))) {
        throw new Error(`Slug "${fields.slug}" is already in use`);
      }
    }

    // If items are being updated, validate and recalculate pricing
    const patchFields: Record<string, unknown> = { ...fields, updatedAt: Date.now() };
    if (fields.items) {
      const existingDoc = await ctx.db.get(id);
      const businessUnitId = existingDoc?.businessUnitId;
      if (!businessUnitId) throw new Error("Party pack not found");

      let serverCompareAtPrice = 0;
      for (const item of fields.items) {
        const catalogItem = await ctx.db.get(item.catalogItemId);
        if (!catalogItem) {
          throw new Error(`Catalog item ${item.catalogItemId} not found`);
        }
        if (catalogItem.itemType !== "product") {
          throw new Error(`Party pack components must be products, got "${catalogItem.itemType}"`);
        }
        if (catalogItem.businessUnitId !== businessUnitId) {
          throw new Error(
            `Catalog item "${catalogItem.name}" belongs to a different business unit`
          );
        }
        const componentCompareAt =
          catalogItem.compareAtPrice !== undefined && catalogItem.compareAtPrice > 0
            ? catalogItem.compareAtPrice
            : 0;
        serverCompareAtPrice += componentCompareAt * item.quantity;
      }

      // Only store compareAtPrice if at least one component has one
      const finalCompareAtPrice = serverCompareAtPrice > 0 ? serverCompareAtPrice : undefined;

      patchFields.compareAtPrice = finalCompareAtPrice;
    }

    await ctx.db.patch(id, patchFields);

    // Sync to catalog
    const pack = await ctx.db.get(id);
    if (pack) {
      await ctx.runMutation(internal.catalogItems.sync, {
        sourceId: id,
        businessUnitId: pack.businessUnitId,
        itemType: "partyPack",
        name: pack.name,
        slug: pack.slug,
        description: pack.description,
        price: pack.price,
        compareAtPrice: pack.compareAtPrice,
        coverImage: pack.coverImage,
        thumbnail: pack.thumbnail,
        tags: [],
        status: pack.status,
        featured: pack.featured,
        displayOrder: pack.displayOrder,
        metaTitle: pack.metaTitle,
        metaDescription: pack.metaDescription,
        metaKeywords: pack.metaKeywords,
        canonicalUrl: pack.canonicalUrl,
      });
    }
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("partyPacks") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.catalogItems.softDeleteBySource, {
      sourceId: args.id,
    });
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("partyPacks")) },
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

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("partyPacks")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

/**
 * Restore — clears deletedAt and reactivates the party pack.
 */
export const restore = mutation({
  args: { sessionToken: v.string(), id: v.id("partyPacks") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });

    // Restore in catalog
    const pack = await ctx.db.get(args.id);
    if (pack) {
      await ctx.runMutation(internal.catalogItems.sync, {
        sourceId: args.id,
        businessUnitId: pack.businessUnitId,
        itemType: "partyPack",
        name: pack.name,
        slug: pack.slug,
        description: pack.description,
        price: pack.price,
        compareAtPrice: pack.compareAtPrice,
        coverImage: pack.coverImage,
        thumbnail: pack.thumbnail,
        tags: [],
        status: "active",
        featured: pack.featured,
        displayOrder: pack.displayOrder,
        metaTitle: pack.metaTitle,
        metaDescription: pack.metaDescription,
        metaKeywords: pack.metaKeywords,
        canonicalUrl: pack.canonicalUrl,
      });
    }
  },
});
