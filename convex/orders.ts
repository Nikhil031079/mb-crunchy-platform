// ============================================================================
// MB CRUNCHY - Orders Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { requireAdminSession } from "./utils/adminAuth";
import { logActivity } from "./orderActivities";
import type { ActivityAction } from "./orderActivities";

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("customerPhone", args.phone))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByStatus = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .filter((q) =>
        q.and(
          q.eq(q.field("businessUnitId"), args.businessUnitId),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("desc")
      .collect();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("orders")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

// ============================================================================
// Helpers
// ============================================================================

async function findInventoryForOrderItem(
  ctx: any,
  catalogItemId: string,
  variantName: string,
) {
  const items = await ctx.db
    .query("inventory")
    .withIndex("by_catalog_item", (q: any) =>
      q.eq("catalogItemId", catalogItemId),
    )
    .filter((q: any) =>
      q.and(
        q.eq(q.field("variantName"), variantName),
        q.eq(q.field("deletedAt"), undefined),
      ),
    )
    .collect();

  return items[0] ?? null;
}

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.string(),
    customerEmail: v.optional(v.string()),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalogItems"),
        itemType: v.union(
          v.literal("product"),
          v.literal("combo"),
          v.literal("partyPack")
        ),
        name: v.string(),
        variantName: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        totalPrice: v.number(),
        image: v.optional(v.string()),
      })
    ),
    subtotal: v.number(),
    discount: v.number(),
    deliveryFee: v.number(),
    tax: v.number(),
    total: v.number(),
    orderType: v.union(v.literal("delivery"), v.literal("pickup")),
    deliveryAddress: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    offerId: v.optional(v.id("offers")),
    offerCode: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const prefix = "MB";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `${prefix}-${timestamp}-${random}`;
    const now = Date.now();

    const paymentStatus = args.paymentMethod === "upi_qr" ? "pending_verification" as const : "pending" as const;

    const { paymentMethod: _pm, ...restArgs } = args;

    const orderId = await ctx.db.insert("orders", {
      ...restArgs,
      orderNumber,
      status: "pending",
      paymentStatus,
      paymentMethod: args.paymentMethod,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId,
      businessUnitId: args.businessUnitId,
      action: "order_created",
      newValue: orderNumber,
      actor: "system",
      visibleToCustomer: true,
    });

    await logActivity(ctx, {
      orderId,
      businessUnitId: args.businessUnitId,
      action: "payment_pending",
      newValue: paymentStatus,
      actor: "system",
      visibleToCustomer: true,
    });

    // Reserve stock for each item
    for (const item of args.items) {
      const inventory = await findInventoryForOrderItem(
        ctx,
        item.catalogItemId,
        item.variantName,
      );

      if (inventory) {
        await ctx.runMutation(api.inventory.reserveStock, {
          inventoryId: inventory._id,
          quantity: item.quantity,
          orderId,
        });
      }
    }

    return { orderId, orderNumber };
  },
});

export const updateStatus = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
    paymentStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("pending_verification"),
        v.literal("paid"),
        v.literal("failed"),
        v.literal("refunded"),
        v.literal("rejected")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, ...patchArgs } = args;
    const order = await ctx.db.get(args.id);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    const previousStatus = order.status;
    const previousPayment = order.paymentStatus;

    // On confirm: deduct reserved stock from actual stock
    if (args.status === "confirmed" && order.status !== "confirmed") {
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(api.inventory.confirmReservation, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
          });
        }
      }
    }

    // On cancel/refund: release reserved stock
    if (
      (args.status === "cancelled" || args.status === "refunded") &&
      order.status !== "cancelled" &&
      order.status !== "refunded"
    ) {
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(api.inventory.restoreStock, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
          });
        }
      }
    }

    // Auto-award loyalty points on delivery
    if (args.status === "delivered" && order.status !== "delivered" && order.customerId) {
      await ctx.runMutation(api.loyalty.awardPoints, {
        customerId: order.customerId,
        orderId: args.id,
        orderTotal: order.total,
      });
    }

    await ctx.db.patch(args.id, { ...patchArgs, updatedAt: now });

    // ------------------------------------------------------------------
    // Audit timeline: record status / payment changes
    // ------------------------------------------------------------------
    if (args.status !== previousStatus) {
      const statusActions: Record<string, ActivityAction> = {
        confirmed: "order_accepted",
        preparing: "preparing",
        ready: "ready",
        out_for_delivery: "out_for_delivery",
        delivered: "delivered",
        cancelled: "cancelled",
        refunded: "refund_initiated",
        pending: "manual_status_change",
      };
      await logActivity(ctx, {
        orderId: args.id,
        businessUnitId: order.businessUnitId,
        action: statusActions[args.status] ?? "manual_status_change",
        previousValue: previousStatus,
        newValue: args.status,
        actor: admin.username,
        actorId: admin._id,
        visibleToCustomer: true,
      });
    }

    if (args.paymentStatus !== undefined && args.paymentStatus !== previousPayment) {
      const paymentActions: Record<string, ActivityAction> = {
        paid: "payment_verified",
        refunded: "refund_completed",
        failed: "payment_failed",
        rejected: "payment_rejected",
        pending: "payment_pending",
        pending_verification: "payment_pending",
      };
      await logActivity(ctx, {
        orderId: args.id,
        businessUnitId: order.businessUnitId,
        action: paymentActions[args.paymentStatus] ?? "manual_status_change",
        previousValue: previousPayment,
        newValue: args.paymentStatus,
        actor: admin.username,
        actorId: admin._id,
        visibleToCustomer: true,
      });
    }
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("orders") },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    const order = await ctx.db.get(args.id);
    if (!order) throw new Error("Order not found");

    const now = Date.now();

    // Release reserved stock if order hasn't been confirmed yet
    if (order.status !== "cancelled" && order.status !== "refunded") {
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(api.inventory.restoreStock, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
          });
        }
      }
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      deletedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: args.id,
      businessUnitId: order.businessUnitId,
      action: "cancelled",
      previousValue: order.status,
      newValue: "cancelled",
      actor: admin.username,
      actorId: admin._id,
      visibleToCustomer: true,
    });
  },
});
