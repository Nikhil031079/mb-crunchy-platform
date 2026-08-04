// ============================================================================
// MB CRUNCHY - Inventory (Separate from Catalog)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";
import { logActivity } from "./orderActivities";

// ============================================================================
// Helpers
// ============================================================================

/** Compute available stock, treating missing reservedStock as 0. */
function availableStock(doc: { stockQuantity: number; reservedStock?: number }) {
  return doc.stockQuantity - (doc.reservedStock ?? 0);
}

/** Log a stock movement to the audit trail. */
export async function logMovement(
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
    sessionToken: v.optional(v.string()),
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
    if (args.sessionToken) {
      await requireAdminSession(ctx, args.sessionToken);
    }

    if (args.stockQuantity < 0) {
      throw new Error("Stock quantity cannot be negative");
    }

    const { sessionToken: _, ...insertArgs } = args;
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
        ...insertArgs,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("inventory", {
      ...insertArgs,
      reservedStock: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStock = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("inventory"),
    stockQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    if (args.stockQuantity < 0) {
      throw new Error("Stock quantity cannot be negative");
    }

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
    sessionToken: v.string(),
    id: v.id("inventory"),
    adjustment: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

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

    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new Error("Reservation quantity must be a positive integer");
    }

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

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: doc.businessUnitId,
      action: "inventory_reserved",
      newValue: `${args.quantity} × ${doc.variantName}`,
      actor: "system",
      visibleToCustomer: true,
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

    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new Error("Confirmation quantity must be a positive integer");
    }

    const reserved = doc.reservedStock ?? 0;

    // A confirmation may only consume an existing reservation — confirming
    // more than is reserved is an invalid transition and would corrupt the
    // ledger (e.g. confirming an order twice).
    if (reserved < args.quantity) {
      throw new Error(
        `Cannot confirm more than is reserved for "${doc.variantName}"`,
      );
    }
    // Never deduct more than is actually on hand.
    if (doc.stockQuantity < args.quantity) {
      throw new Error(
        `Insufficient stock to confirm "${doc.variantName}"`,
      );
    }

    const newStock = doc.stockQuantity - args.quantity;
    const newReserved = reserved - args.quantity;

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
    deducted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await ctx.db.get(args.inventoryId);
    if (!doc) throw new Error("Inventory item not found");

    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new Error("Restore quantity must be a positive integer");
    }

    const reserved = doc.reservedStock ?? 0;

    // Nothing was reserved for this order — already released or never
    // reserved. Tolerate as a no-op so repeated cancellations cannot
    // double-restore.
    if (reserved <= 0 && !args.deducted) {
      return;
    }

    if (args.deducted) {
      // The reservation was already confirmed, so the stock was deducted
      // from on-hand stock. Restoring adds it back; reservedStock was already
      // reduced at confirmation time and must not be touched again.
      const newStock = doc.stockQuantity + args.quantity;

      await ctx.db.patch(args.inventoryId, {
        stockQuantity: newStock,
        reservedStock: reserved,
        available: (newStock - reserved) > 0,
        updatedAt: now,
      });

      await logMovement(ctx, {
        inventoryId: args.inventoryId,
        businessUnitId: doc.businessUnitId,
        type: "restoration",
        quantity: args.quantity,
        previousStock: doc.stockQuantity,
        newStock,
        orderId: args.orderId,
      });
    } else {
      // Still reserved: release the reservation without touching on-hand
      // stock. Clamped so it can never release more than is reserved.
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
    }

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: doc.businessUnitId,
      action: "inventory_released",
      newValue: `${args.quantity} × ${doc.variantName}`,
      actor: "system",
      visibleToCustomer: true,
    });
  },
});

export const bulkUpdateStock = mutation({
  args: {
    sessionToken: v.string(),
    updates: v.array(
      v.object({
        inventoryId: v.id("inventory"),
        stockQuantity: v.number(),
      }),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();

    for (const update of args.updates) {
      if (update.stockQuantity < 0) {
        throw new Error("Stock quantity cannot be negative");
      }

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
  args: { sessionToken: v.string(), id: v.id("inventory") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
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
  args: { sessionToken: v.string(), id: v.id("inventory") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
