// ============================================================================
// MB CRUNCHY - Products Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Helpers
// ============================================================================

// TEMPORARY: Bypass auth for local development. Set to false before production.
const DEV_AUTH_BYPASS = true;

async function requireAuth(ctx: any) {
  if (DEV_AUTH_BYPASS) return;
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
}

async function slugExists(
  ctx: any,
  businessUnitId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("products")
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

export const getByCategory = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
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
      .query("products")
      .withIndex("by_slug_in_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("slug", args.slug)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getFeatured = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
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

export const getAllByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
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
    businessUnitId: v.id("businessUnits"),
    categoryId: v.id("categories"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    images: v.array(v.string()),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    variants: v.array(
      v.object({
        name: v.string(),
        price: v.number(),
        compareAtPrice: v.optional(v.number()),
      })
    ),
    tags: v.array(v.string()),
    sku: v.optional(v.string()),
    stockQuantity: v.optional(v.number()),
    unit: v.optional(v.union(v.literal("pcs"), v.literal("kg"), v.literal("litre"), v.literal("pack"), v.literal("dozen"), v.literal("box"))),
    vegNonVeg: v.optional(v.union(v.literal("veg"), v.literal("non-veg"))),
    taxPercentage: v.optional(v.number()),
    available: v.boolean(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    featured: v.boolean(),
    displayOrder: v.number(),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    metaKeywords: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Enforce unique slug within business unit
    if (await slugExists(ctx, args.businessUnitId, args.slug)) {
      throw new Error(`Slug "${args.slug}" is already in use`);
    }

    const now = Date.now();
    const defaultPrice = args.variants[0]?.price ?? 0;
    const defaultCompare = args.variants[0]?.compareAtPrice;

    // Insert product
    const productId = await ctx.db.insert("products", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    // Sync to catalog
    await ctx.runMutation("catalogItems:sync", {
      sourceId: productId,
      businessUnitId: args.businessUnitId,
      itemType: "product",
      name: args.name,
      slug: args.slug,
      description: args.description,
      price: defaultPrice,
      compareAtPrice: defaultCompare,
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
    });

    return productId;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    variants: v.optional(
      v.array(
        v.object({
          name: v.string(),
          price: v.number(),
          compareAtPrice: v.optional(v.number()),
        })
      )
    ),
    tags: v.optional(v.array(v.string())),
    sku: v.optional(v.string()),
    stockQuantity: v.optional(v.number()),
    unit: v.optional(v.union(v.literal("pcs"), v.literal("kg"), v.literal("litre"), v.literal("pack"), v.literal("dozen"), v.literal("box"))),
    vegNonVeg: v.optional(v.union(v.literal("veg"), v.literal("non-veg"))),
    taxPercentage: v.optional(v.number()),
    available: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))),
    featured: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    metaKeywords: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const { id, ...fields } = args;

    // Enforce unique slug on update
    if (fields.slug) {
      const existing = await ctx.db.get(id);
      if (existing && (await slugExists(ctx, existing.businessUnitId, fields.slug, id))) {
        throw new Error(`Slug "${fields.slug}" is already in use`);
      }
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });

    // Sync to catalog
    const product = await ctx.db.get(id);
    if (product) {
      const defaultPrice = product.variants[0]?.price ?? 0;
      const defaultCompare = product.variants[0]?.compareAtPrice;

      await ctx.runMutation("catalogItems:sync", {
        sourceId: id,
        businessUnitId: product.businessUnitId,
        itemType: "product",
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: defaultPrice,
        compareAtPrice: defaultCompare,
        coverImage: product.coverImage,
        thumbnail: product.thumbnail,
        tags: product.tags,
        status: product.status,
        featured: product.featured,
        displayOrder: product.displayOrder,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
        metaKeywords: product.metaKeywords,
        canonicalUrl: product.canonicalUrl,
      });
    }
  },
});

export const softDelete = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });

    // Soft delete from catalog
    await ctx.runMutation("catalogItems:softDeleteBySource", {
      sourceId: args.id,
    });
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

/**
 * Restore — clears deletedAt and reactivates the product.
 */
export const restore = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });

    // Restore in catalog
    const product = await ctx.db.get(args.id);
    if (product) {
      const defaultPrice = product.variants[0]?.price ?? 0;
      const defaultCompare = product.variants[0]?.compareAtPrice;

      await ctx.runMutation("catalogItems:sync", {
        sourceId: args.id,
        businessUnitId: product.businessUnitId,
        itemType: "product",
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: defaultPrice,
        compareAtPrice: defaultCompare,
        coverImage: product.coverImage,
        thumbnail: product.thumbnail,
        tags: product.tags,
        status: "active",
        featured: product.featured,
        displayOrder: product.displayOrder,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
        metaKeywords: product.metaKeywords,
        canonicalUrl: product.canonicalUrl,
      });
    }
  },
});
