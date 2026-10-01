// ============================================================================
// MB CRUNCHY - Inventory (Separate from Catalog)
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdminRole } from "./utils/adminAuth";
import { sanitizeInventoryForStorefront } from "./utils/customerAccess";
import { logActivity } from "./orderActivities";

// ============================================================================
// Helpers
// ============================================================================

/** Compute available stock, treating missing reservedStock as 0. */
function availableStock(doc: { stockQuantity: number; reservedStock?: number }) {
  return doc.stockQuantity - (doc.reservedStock ?? 0);
}

/** One inventory row plus the quantity an order line requires from it. */
export interface InventoryReservationExpansion {
  inventory: any;
  quantity: number;
}

/**
 * Resolve the inventory rows an order line reserves against.
 *
 * Established model: every reservation site works per order line against the
 * inventory row keyed by (catalogItemId, variantName). Combo and Party Pack
 * lines additionally carry server-side component references
 * (combos.items / partyPacks.items), which this helper expands so bundle
 * components participate in the same authoritative mechanism:
 *
 * 1. If a bundle-level inventory row exists for the line, it alone is
 *    reserved (existing behavior preserved — never double-reserve).
 * 2. Otherwise, for combo/partyPack lines, each component consumes its own
 *    row ONLY when exactly one non-deleted inventory row exists for that
 *    component catalog item. Zero rows (untracked/made-to-order) or multiple
 *    rows (variant ambiguity) resolve to nothing — identical to today.
 * 3. Required quantity is always ordered bundle quantity x component
 *    required quantity (integers only; anything else resolves to nothing).
 * 4. Identical rows are aggregated within the line.
 *
 * Returns an empty list when nothing is resolvable; callers keep the legacy
 * `continue` (skip) behavior in that case. No client data is trusted: the
 * bundle definition comes from the combos/partyPacks tables.
 *
 * Phase 21D-B — `options.failOnVariantMismatch` (reserve-time only): a line
 * whose variantName matches no inventory row would otherwise resolve to
 * "untracked" and silently skip stock. With strict mode enabled, that is only
 * acceptable when the item genuinely has NO inventory rows at all; if rows
 * exist under other variant keys the configuration and the cart line disagree
 * and the caller must fail closed instead of proceeding. Bundle lines keep the
 * documented expansion rules above.
 */
export async function resolveInventoryReservations(
  ctx: any,
  line: {
    catalogItemId: string;
    variantName: string;
    itemType?: string;
    quantity: number;
  },
  options?: { failOnVariantMismatch?: boolean },
): Promise<InventoryReservationExpansion[]> {
  const liveRows = await ctx.db
    .query("inventory")
    .withIndex("by_catalog_item", (q: any) =>
      q.eq("catalogItemId", line.catalogItemId),
    )
    .filter((q: any) =>
      q.and(
        q.eq(q.field("variantName"), line.variantName),
        q.eq(q.field("deletedAt"), undefined),
      ),
    )
    .collect();
  const bundleRow = liveRows[0] ?? null;
  if (bundleRow) return [{ inventory: bundleRow, quantity: line.quantity }];

  const isBundleLine =
    line.itemType === "combo" || line.itemType === "partyPack";

  // Tracked-vs-untracked guard for product lines (bundles are covered by the
  // component expansion below, which has its own single-row rule).
  if (options?.failOnVariantMismatch && !isBundleLine) {
    const itemRows = await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q: any) =>
        q.eq("catalogItemId", line.catalogItemId),
      )
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    if (itemRows.length > 0) {
      const catalogItem = await ctx.db.get(line.catalogItemId);
      const itemName = catalogItem?.name ?? "This item";
      throw new Error(
        `The selected variant for "${itemName}" is no longer available. Please review your cart.`,
      );
    }
    // Zero rows: the item is genuinely untracked — legacy skip behavior stands.
    return [];
  }

  if (!isBundleLine) return [];
  if (!Number.isInteger(line.quantity) || line.quantity < 1) return [];

  const catalogItem = await ctx.db.get(line.catalogItemId);
  if (!catalogItem) return [];
  const sourceTable =
    line.itemType === "combo" ? "combos" : "partyPacks";
  if (catalogItem.itemType && catalogItem.itemType !== line.itemType) return [];
  if (typeof catalogItem.sourceId !== "string") return [];
  const source = await ctx.db.get(catalogItem.sourceId);
  if (!source || !Array.isArray(source.items) || source.items.length === 0) {
    return [];
  }

  const aggregated = new Map<string, InventoryReservationExpansion>();
  for (const component of source.items) {
    if (!component || !component.catalogItemId) continue;
    if (!Number.isInteger(component.quantity) || component.quantity < 1) {
      continue;
    }
    const componentRows = await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q: any) =>
        q.eq("catalogItemId", component.catalogItemId),
      )
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    // Exactly one row: unambiguous. Zero (untracked) or multiple (variant
    // ambiguity) resolve to nothing, preserving current behavior.
    if (componentRows.length !== 1) continue;
    const required = component.quantity * line.quantity;
    const existing = aggregated.get(componentRows[0]._id);
    if (existing) {
      existing.quantity += required;
    } else {
      aggregated.set(componentRows[0]._id, {
        inventory: componentRows[0],
        quantity: required,
      });
    }
  }
  return [...aggregated.values()];
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    return await ctx.db
      .query("inventory")
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getStorefrontAll = query({
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("inventory")
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return docs.map(sanitizeInventoryForStorefront);
  },
});

export const getByIds = query({
  args: { sessionToken: v.string(), ids: v.array(v.id("inventory")) },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const results = await Promise.all(
      args.ids.map((id) => ctx.db.get(id)),
    );
    return results.filter(Boolean);
  },
});

export const getByCatalogItem = query({
  args: { catalogItemId: v.id("catalogItems") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("inventory")
      .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", args.catalogItemId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return docs.map(sanitizeInventoryForStorefront);
  },
});

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return docs.map(sanitizeInventoryForStorefront);
  },
});

export const getAvailable = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
  args: { sessionToken: v.string(), sku: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    return await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getByBarcode = query({
  args: { sessionToken: v.string(), barcode: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    return await ctx.db
      .query("inventory")
      .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getLowStock = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const items = await ctx.db
      .query("inventory")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return items.filter((item) => availableStock(item) <= 0);
  },
});

export const getInventorySummary = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    sessionToken: v.string(),
    inventoryId: v.id("inventory"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    sessionToken: v.string(),
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

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

export const reserveStock = internalMutation({
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

export const confirmReservation = internalMutation({
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

export const restoreStock = internalMutation({
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
