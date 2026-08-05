// ============================================================================
// MB CRUNCHY - Products Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAdminSession } from "./utils/adminAuth";
import { firstActivePrice } from "./utils/variantHelper";

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

export const getByIds = query({
  args: { ids: v.array(v.id("products")) },
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
        optionName: v.string(),
        optionValue: v.string(),
        price: v.number(),
        compareAtPrice: v.optional(v.number()),
        sku: v.optional(v.string()),
        barcode: v.optional(v.string()),
        stock: v.optional(v.number()),
        costPrice: v.optional(v.number()),
        taxPercentage: v.optional(v.number()),
        image: v.optional(v.string()),
        minOrderQty: v.optional(v.number()),
        isDefault: v.boolean(),
        sortOrder: v.number(),
        active: v.boolean(),
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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    // Enforce unique slug within business unit
    if (await slugExists(ctx, args.businessUnitId, args.slug)) {
      throw new Error(`Slug "${args.slug}" is already in use`);
    }

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();
    const { price: defaultPrice, compareAtPrice: defaultCompare } =
      firstActivePrice(args.variants);

    // Insert product
    const productId = await ctx.db.insert("products", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });

    // Sync to catalog
    const catalogItemId = await ctx.runMutation(internal.catalogItems.sync, {
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

    // Auto-create inventory records for each active variant
    const activeVariants = args.variants.filter((v) => v.active);
    for (const variant of activeVariants) {
      const stockQty = variant.stock ?? args.stockQuantity ?? 0;
      await ctx.runMutation(api.inventory.upsert, {
        sessionToken: args.sessionToken,
        catalogItemId: catalogItemId as any,
        businessUnitId: args.businessUnitId,
        variantName: variant.optionValue,
        sku: variant.sku ?? args.sku,
        stockQuantity: stockQty,
        available: stockQty > 0 && args.available,
      });
    }

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
          optionName: v.string(),
          optionValue: v.string(),
          price: v.number(),
          compareAtPrice: v.optional(v.number()),
          sku: v.optional(v.string()),
          barcode: v.optional(v.string()),
          stock: v.optional(v.number()),
          costPrice: v.optional(v.number()),
          taxPercentage: v.optional(v.number()),
          image: v.optional(v.string()),
          minOrderQty: v.optional(v.number()),
          isDefault: v.boolean(),
          sortOrder: v.number(),
          active: v.boolean(),
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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { id, sessionToken: _, ...fields } = args;

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
      const { price: defaultPrice, compareAtPrice: defaultCompare } =
        firstActivePrice(product.variants);

      await ctx.runMutation(internal.catalogItems.sync, {
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

      // Sync inventory when variants, stock, SKU, or availability changes
      if (fields.variants || fields.stockQuantity !== undefined || fields.sku !== undefined || fields.available !== undefined) {
        const catalogItem = await ctx.db
          .query("catalogItems")
          .withIndex("by_source", (q) => q.eq("sourceId", id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .first();

        if (catalogItem) {
          const activeVariants = product.variants.filter((v) => v.active);
          for (const variant of activeVariants) {
            const stockQty = variant.stock ?? fields.stockQuantity ?? product.stockQuantity ?? 0;
            await ctx.runMutation(api.inventory.upsert, {
              sessionToken: args.sessionToken,
              catalogItemId: catalogItem._id,
              businessUnitId: product.businessUnitId,
              variantName: variant.optionValue,
              sku: variant.sku ?? fields.sku ?? product.sku,
              stockQuantity: stockQty,
              available: stockQty > 0 && (fields.available ?? product.available),
            });
          }
        }
      }
    }
  },
});

export const softDelete = mutation({
  args: { id: v.id("products"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });

    // Soft delete from catalog
    await ctx.runMutation(internal.catalogItems.softDeleteBySource, {
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
  args: { id: v.id("products"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });

    // Restore in catalog
    const product = await ctx.db.get(args.id);
    if (product) {
      const { price: defaultPrice, compareAtPrice: defaultCompare } =
        firstActivePrice(product.variants);

      await ctx.runMutation(internal.catalogItems.sync, {
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
