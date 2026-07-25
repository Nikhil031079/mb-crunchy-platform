// ============================================================================
// MB CRUNCHY - Inventory (Separate from Catalog)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Helpers
// ============================================================================

/** Compute available stock, treating missing reservedStock as 0. */
function availableStock(doc: { stockQuantity: number; reservedStock?: number }) {
  return doc.stockQuantity - (doc.reservedStock ?? 0);
}

/** Log a stock movement to the audit trail. */
async function logMovement(
  ctx: any,
  args: {
    inventoryId: any;
    businessUnitId: any;
    type: "adjustment" | "reservation" | "reservation_release" | "deduction" | "restoration" | "restock";
    quantity: number;
    previousStock: number;
    newStock: number;
    reason?: string;
    orderId?: any;
    performedBy?: string;
  },
) {
  await ctx.db.insert("stockMovements", {
    ...args,
    createdAt: Date.now(),
  });
}

// ============================================================================
// Queries
// ============================================================================

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("inventory")
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("inventory")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.ids.map((id) => ctx.db.get(id)),
    );
    return results.filter(Boolean);
  },
});

export const getByCatalogItem = query({
  args: { catalogItemId: v.id("catalogItems") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", args.catalogItemId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getAvailable = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field("available"), true),
          q.eq(q.field("deletedAt"), undefined),
        ),
      )
      .collect();

    return items.filter((item) => availableStock(item) > 0);
  },
});

export const getBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getLowStock = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return items.filter(
      (item) =>
        item.lowStockAlert !== undefined &&
        item.stockQuantity <= item.lowStockAlert,
    );
  },
});

export const getOutOfStock = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return items.filter((item) => availableStock(item) <= 0);
  },
});

export const getInventorySummary = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let inventoryValue = 0;

    for (const item of items) {
      const reserved = item.reservedStock ?? 0;
      const avail = item.stockQuantity - reserved;
      totalStock += item.stockQuantity;
      totalReserved += reserved;
      totalAvailable += avail;
      if (item.lowStockAlert !== undefined && item.stockQuantity <= item.lowStockAlert) {
        lowStockCount++;
      }
      if (avail <= 0) {
        outOfStockCount++;
      }
      if (item.costPrice) {
        inventoryValue += item.stockQuantity * item.costPrice;
      }
    }

    return {
      totalItems: items.length,
      totalStock,
      totalReserved,
      totalAvailable,
      lowStockCount,
      outOfStockCount,
      inventoryValue,
    };
  },
});

export const getStockMovements = query({
  args: {
    inventoryId: v.id("inventory"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stockMovements")
      .withIndex("by_inventory", (q) => q.eq("inventoryId", args.inventoryId))
      .order("desc")
      .take(args.limit ?? 50);
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

    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q: any) =>
        q.eq("catalogItemId", args.catalogItemId),
      )
      .filter((q: any) =>
        q.and(
          q.eq(q.field("variantName"), args.variantName),
          q.eq(q.field("deletedAt"), undefined),
        ),
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
      reservedStock: 0,
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
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Inventory item not found");

    const reserved = doc.reservedStock ?? 0;
    const avail = args.stockQuantity - reserved;

    await ctx.db.patch(args.id, {
      stockQuantity: args.stockQuantity,
      available: avail > 0,
      updatedAt: now,
    });
  },
});

export const adjustStock = mutation({
  args: {
    id: v.id("inventory"),
    adjustment: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Inventory item not found");

    const previousStock = doc.stockQuantity;
    const newStock = Math.max(0, previousStock + args.adjustment);
    const reserved = doc.reservedStock ?? 0;
    const avail = newStock - reserved;

    await ctx.db.patch(args.id, {
      stockQuantity: newStock,
      available: avail > 0,
      updatedAt: now,
    });

    await logMovement(ctx, {
      inventoryId: args.id,
      businessUnitId: doc.businessUnitId,
      type: "adjustment",
      quantity: args.adjustment,
      previousStock,
      newStock,
      reason: args.reason,
    });

    return newStock;
  },
});

export const reserveStock = mutation({
  args: {
    inventoryId: v.id("inventory"),
    quantity: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await ctx.db.get(args.inventoryId);
    if (!doc) throw new Error("Inventory item not found");

    const reserved = doc.reservedStock ?? 0;
    const avail = doc.stockQuantity - reserved;

    if (avail < args.quantity) {
      throw new Error(
        `Insufficient stock for "${doc.variantName}". Available: ${avail}, requested: ${args.quantity}`,
      );
    }

    const newReserved = reserved + args.quantity;
    await ctx.db.patch(args.inventoryId, {
      reservedStock: newReserved,
      available: (doc.stockQuantity - newReserved) > 0,
      updatedAt: now,
    });

    await logMovement(ctx, {
      inventoryId: args.inventoryId,
      businessUnitId: doc.businessUnitId,
      type: "reservation",
      quantity: args.quantity,
      previousStock: doc.stockQuantity,
      newStock: doc.stockQuantity,
      orderId: args.orderId,
    });
  },
});

export const confirmReservation = mutation({
  args: {
    inventoryId: v.id("inventory"),
    quantity: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await ctx.db.get(args.inventoryId);
    if (!doc) throw new Error("Inventory item not found");

    const reserved = doc.reservedStock ?? 0;
    const newStock = doc.stockQuantity - args.quantity;
    const newReserved = Math.max(0, reserved - args.quantity);

    await ctx.db.patch(args.inventoryId, {
      stockQuantity: newStock,
      reservedStock: newReserved,
      available: (newStock - newReserved) > 0,
      updatedAt: now,
    });

    await logMovement(ctx, {
      inventoryId: args.inventoryId,
      businessUnitId: doc.businessUnitId,
      type: "deduction",
      quantity: -args.quantity,
      previousStock: doc.stockQuantity,
      newStock,
      orderId: args.orderId,
    });
  },
});

export const restoreStock = mutation({
  args: {
    inventoryId: v.id("inventory"),
    quantity: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await ctx.db.get(args.inventoryId);
    if (!doc) throw new Error("Inventory item not found");

    const reserved = doc.reservedStock ?? 0;
    const newReserved = Math.max(0, reserved - args.quantity);

    await ctx.db.patch(args.inventoryId, {
      reservedStock: newReserved,
      available: (doc.stockQuantity - newReserved) > 0,
      updatedAt: now,
    });

    await logMovement(ctx, {
      inventoryId: args.inventoryId,
      businessUnitId: doc.businessUnitId,
      type: "reservation_release",
      quantity: -args.quantity,
      previousStock: doc.stockQuantity,
      newStock: doc.stockQuantity,
      orderId: args.orderId,
    });
  },
});

export const bulkUpdateStock = mutation({
  args: {
    updates: v.array(
      v.object({
        inventoryId: v.id("inventory"),
        stockQuantity: v.number(),
      }),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const update of args.updates) {
      const doc = await ctx.db.get(update.inventoryId);
      if (!doc) continue;

      const previousStock = doc.stockQuantity;
      const reserved = doc.reservedStock ?? 0;
      const avail = update.stockQuantity - reserved;

      await ctx.db.patch(update.inventoryId, {
        stockQuantity: update.stockQuantity,
        available: avail > 0,
        updatedAt: now,
      });

      await logMovement(ctx, {
        inventoryId: update.inventoryId,
        businessUnitId: doc.businessUnitId,
        type: "restock",
        quantity: update.stockQuantity - previousStock,
        previousStock,
        newStock: update.stockQuantity,
        reason: args.reason ?? "Bulk update",
      });
    }

    return args.updates.length;
  },
});

export const markUnavailable = mutation({
  args: { id: v.id("inventory") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      available: false,
      stockQuantity: 0,
      reservedStock: 0,
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
