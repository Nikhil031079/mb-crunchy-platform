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

/**
 * Find a product that is actively using this slug (non-deleted).
 * Returns the conflicting product if any, or null.
 */
async function findSlugConflict(
  ctx: any,
  businessUnitId: string,
  slug: string,
  excludeId?: string
): Promise<{ name: string; status: string } | null> {
  const existing = await ctx.db
    .query("products")
    .withIndex("by_slug_in_business_unit", (q: any) =>
      q.eq("businessUnitId", businessUnitId).eq("slug", slug)
    )
    .first();
  if (!existing) return null;
  if (existing.deletedAt) return null;
  if (excludeId && existing._id === excludeId) return null;
  return { name: existing.name, status: existing.status };
}

/**
 * Get the business unit name for error messages.
 */
async function getBusinessUnitName(ctx: any, businessUnitId: string): Promise<string> {
  const bu = await ctx.db.get(businessUnitId);
  return bu?.name ?? "Unknown Business Unit";
}

/**
 * Check if a product's catalog item is referenced by combos or party packs.
 * Returns an array of dependency descriptions, or empty array if none.
 */
async function getProductDependencies(
  ctx: any,
  productId: string
): Promise<string[]> {
  const dependencies: string[] = [];

  // Find the catalog item for this product
  const catalogItem = await ctx.db
    .query("catalogItems")
    .withIndex("by_source", (q: any) => q.eq("sourceId", productId))
    .first();

  if (!catalogItem) return dependencies;

  const catalogItemId = catalogItem._id as string;

  // Check combos
  const combos = await ctx.db.query("combos").collect();
  for (const combo of combos) {
    if (combo.deletedAt) continue;
    const hasItem = combo.items?.some(
      (item: any) => item.catalogItemId === catalogItemId
    );
    if (hasItem) {
      dependencies.push(`Combo "${combo.name}"`);
    }
  }

  // Check party packs
  const partyPacks = await ctx.db.query("partyPacks").collect();
  for (const pack of partyPacks) {
    if (pack.deletedAt) continue;
    const hasItem = pack.items?.some(
      (item: any) => item.catalogItemId === catalogItemId
    );
    if (hasItem) {
      dependencies.push(`Party Pack "${pack.name}"`);
    }
  }

  // Check offers
  const offers = await ctx.db.query("offers").collect();
  for (const offer of offers) {
    if (offer.deletedAt) continue;
    const hasItem = offer.applicableCatalogItemIds?.some(
      (id: any) => id === catalogItemId
    );
    if (hasItem) {
      dependencies.push(`Offer "${offer.title}"`);
    }
  }

  return dependencies;
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

    // Enforce unique slug within business unit (only non-deleted products block)
    const slugConflict = await findSlugConflict(ctx, args.businessUnitId, args.slug);
    if (slugConflict) {
      const buName = await getBusinessUnitName(ctx, args.businessUnitId);
      if (slugConflict.status === "active") {
        throw new Error(`An active product "${slugConflict.name}" already uses this slug in ${buName}.`);
      }
      throw new Error(`A product "${slugConflict.name}" already uses this slug in ${buName}.`);
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
    businessUnitId: v.optional(v.id("businessUnits")),
    categoryId: v.optional(v.id("categories")),
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

    const product = await ctx.db.get(id);
    if (!product) {
      throw new Error("Product not found.");
    }

    const targetBusinessUnitId = fields.businessUnitId ?? product.businessUnitId;
    const targetCategoryId = fields.categoryId ?? product.categoryId;

    // Check if BU/category is being changed
    const isBuChange = fields.businessUnitId && fields.businessUnitId !== product.businessUnitId;
    const isCategoryChange = fields.categoryId && fields.categoryId !== product.categoryId;

    // If changing BU or category, check for dependencies
    if (isBuChange || isCategoryChange) {
      const dependencies = await getProductDependencies(ctx, id);
      if (dependencies.length > 0) {
        throw new Error(
          `Cannot change Business Unit or Category. This product is referenced by: ${dependencies.join(", ")}. ` +
          `Please remove it from these items first, or create a new product instead.`
        );
      }
    }

    // Enforce unique slug on update (only non-deleted products block)
    if (fields.slug) {
      const slugConflict = await findSlugConflict(ctx, targetBusinessUnitId, fields.slug, id);
      if (slugConflict) {
        const buName = await getBusinessUnitName(ctx, targetBusinessUnitId);
        if (slugConflict.status === "active") {
          throw new Error(`An active product "${slugConflict.name}" already uses this slug in ${buName}.`);
        }
        throw new Error(`A product "${slugConflict.name}" already uses this slug in ${buName}.`);
      }
    }

    // If changing BU, also check slug uniqueness in the new BU
    if (isBuChange && !fields.slug) {
      const slugConflict = await findSlugConflict(ctx, targetBusinessUnitId, product.slug, id);
      if (slugConflict) {
        const buName = await getBusinessUnitName(ctx, targetBusinessUnitId);
        throw new Error(
          `Cannot move to ${buName}: the slug "${product.slug}" is already in use by another product.`
        );
      }
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });

    // Sync to catalog
    const updatedProduct = await ctx.db.get(id);
    if (updatedProduct) {
      const { price: defaultPrice, compareAtPrice: defaultCompare } =
        firstActivePrice(updatedProduct.variants);

      await ctx.runMutation(internal.catalogItems.sync, {
        sourceId: id,
        businessUnitId: updatedProduct.businessUnitId,
        itemType: "product",
        name: updatedProduct.name,
        slug: updatedProduct.slug,
        description: updatedProduct.description,
        price: defaultPrice,
        compareAtPrice: defaultCompare,
        coverImage: updatedProduct.coverImage,
        thumbnail: updatedProduct.thumbnail,
        tags: updatedProduct.tags,
        status: updatedProduct.status,
        featured: updatedProduct.featured,
        displayOrder: updatedProduct.displayOrder,
        metaTitle: updatedProduct.metaTitle,
        metaDescription: updatedProduct.metaDescription,
        metaKeywords: updatedProduct.metaKeywords,
        canonicalUrl: updatedProduct.canonicalUrl,
      });

      // Sync inventory when BU, variants, stock, SKU, or availability changes
      if (isBuChange || fields.variants || fields.stockQuantity !== undefined || fields.sku !== undefined || fields.available !== undefined) {
        const catalogItem = await ctx.db
          .query("catalogItems")
          .withIndex("by_source", (q) => q.eq("sourceId", id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .first();

        if (catalogItem) {
          const activeVariants = updatedProduct.variants.filter((v) => v.active);
          for (const variant of activeVariants) {
            const stockQty = variant.stock ?? fields.stockQuantity ?? updatedProduct.stockQuantity ?? 0;
            await ctx.runMutation(api.inventory.upsert, {
              sessionToken: args.sessionToken,
              catalogItemId: catalogItem._id,
              businessUnitId: updatedProduct.businessUnitId,
              variantName: variant.optionValue,
              sku: variant.sku ?? fields.sku ?? updatedProduct.sku,
              stockQuantity: stockQty,
              available: stockQty > 0 && (fields.available ?? updatedProduct.available),
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    // Return ALL products including archived/deleted for admin management
    return await ctx.db
      .query("products")
      .order("asc")
      .collect();
  },
});

/**
 * Restore — clears deletedAt and reactivates the product.
 * Checks for slug conflicts before restoring.
 */
export const restore = mutation({
  args: { id: v.id("products"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Product not found.");
    }

    // Check if the slug is already in use by another active product
    const slugConflict = await findSlugConflict(ctx, product.businessUnitId, product.slug, args.id);
    if (slugConflict) {
      const buName = await getBusinessUnitName(ctx, product.businessUnitId);
      if (slugConflict.status === "active") {
        throw new Error(
          `Cannot restore "${product.name}": the slug "${product.slug}" is already in use by active product "${slugConflict.name}" in ${buName}. ` +
          `Please change the slug before restoring, or archive the conflicting product first.`
        );
      }
      throw new Error(
        `Cannot restore "${product.name}": the slug "${product.slug}" is already in use by "${slugConflict.name}" in ${buName}.`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });

    // Restore in catalog
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
  },
});
