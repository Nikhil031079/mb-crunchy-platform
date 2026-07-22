// ============================================================================
// MB CRUNCHY - Inventory (Separate from Catalog)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getByCatalogItem = query({
  args: { catalogItemId: v.id("catalogItems") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", args.catalogItemId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getAvailable = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_available", (q) => q.eq("available", true))
      .filter((q) =>
        q.and(
          q.eq(q.field("businessUnitId"), args.businessUnitId),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();
  },
});

export const getBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getLowStock = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return items.filter(
      (item) =>
        item.lowStockAlert !== undefined &&
        item.stockQuantity <= item.lowStockAlert
    );
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const upsert = mutation({
  args: {
    catalogItemId: v.id("catalogItems"),
    businessUnitId: v.id("businessUnits"),
    variantName: v.string(),
    sku: v.optional(v.string()),
    stockQuantity: v.number(),
    available: v.boolean(),
    lowStockAlert: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    supplier: v.optional(v.string()),
    barcode: v.optional(v.string()),
    lastRestocked: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if inventory record already exists for this variant
    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q: any) =>
        q.eq("catalogItemId", args.catalogItemId)
      )
      .filter((q: any) =>
        q.and(
          q.eq(q.field("variantName"), args.variantName),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("inventory", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStock = mutation({
  args: {
    id: v.id("inventory"),
    stockQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      stockQuantity: args.stockQuantity,
      available: args.stockQuantity > 0,
      updatedAt: now,
    });
  },
});

export const markUnavailable = mutation({
  args: { id: v.id("inventory") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      available: false,
      stockQuantity: 0,
      updatedAt: now,
    });
  },
});

export const softDelete = mutation({
  args: { id: v.id("inventory") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
