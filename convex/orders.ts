// ============================================================================
// MB CRUNCHY - Orders Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdminSession } from "./utils/adminAuth";
import { canReadCustomerData, sanitizeOrderForCustomer } from "./utils/customerAccess";
import { logActivity } from "./orderActivities";
import type { ActivityAction } from "./orderActivities";
import { logMovement } from "./inventory";
import { ensureCustomerByPhone } from "./customers";
import { validateCouponInternal } from "./offers";
import { getMaxRedeemableInternal } from "./loyalty";
import { notify } from "./notificationService";
import { getAllowedTransitions } from "./orderWorkflow";
import { isStoreCurrentlyOpen } from "./utils/storeHours";

// ============================================================================
// Constants
// ============================================================================

// Client-submitted money values are display-only; the server recomputes every
// value from current catalog data. These tolerances allow harmless float
// rounding while rejecting any real mismatch (stale cart / tampered prices).
const PRICE_TOLERANCE = 0.01;

// Minimum gap between two customer payment claims on the same order. Keeps
// claim logging idempotent so a double-tap never produces duplicate activities.
const CLAIM_COOLDOWN_MS = 2 * 60 * 1000;

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("orders")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByCustomer = query({
  args: { sessionToken: v.optional(v.string()), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const allowed = await canReadCustomerData(ctx, {
      customerId: args.customerId,
      sessionToken: args.sessionToken,
    });
    if (!allowed) return [];

    const docs = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();

    // Admin sessions read the full document (UTR, address, contact details).
    // Customer-owner reads are projected so PII and internal metadata never
    // leave the server.
    return args.sessionToken ? docs : docs.map(sanitizeOrderForCustomer);
  },
});

export const getByPhone = query({
  args: { sessionToken: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
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
    sessionToken: v.string(),
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
    await requireAdminSession(ctx, args.sessionToken);
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("orders")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { sessionToken: v.string(), orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db.get(args.orderId);
  },
});

// ============================================================================
// Public order tracking
// ============================================================================

/**
 * Secure guest order tracking. The caller must present BOTH the phone number
 * used at checkout AND the order number shown on the receipt. Returns exactly
 * one order (never a list) with all PII stripped, plus the customer-visible
 * activity timeline.
 *
 * The arg object + return shape are deliberately stable: a future
 * "phone + order number + OTP" verification step can be added as an extra
 * optional arg (e.g. `otp`) with an additional server-side check inside this
 * handler — no call-site or response-shape change required.
 */
export const getByPhoneAndOrderNumber = query({
  args: { phone: v.string(), orderNumber: v.string() },
  handler: async (ctx, args) => {
    const phone = args.phone.trim();
    const orderNumber = args.orderNumber.trim().toUpperCase();
    if (!phone || !orderNumber) return null;

    const order = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("customerPhone", phone))
      .filter((q) =>
        q.and(
          q.eq(q.field("orderNumber"), orderNumber),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .first();

    if (!order) return null;

    const activities = await ctx.db
      .query("orderActivities")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .filter((q) => q.eq(q.field("visibleToCustomer"), true))
      .order("desc")
      .collect();

    return {
      order: sanitizeOrderForCustomer(order),
      activities,
    };
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
// Server-side order pricing validation
// ============================================================================

type ProductVariantLike = {
  optionName: string;
  optionValue: string;
  price: number;
  active: boolean;
};

type ResolvableDoc = {
  name?: string;
  businessUnitId?: string;
  sourceId?: string;
  itemType?: "product" | "combo" | "partyPack";
  status?: string;
  deletedAt?: number;
  price?: number;
  variants?: ProductVariantLike[];
};

type OrderLine = {
  catalogItemId: Id<"catalogItems">;
  itemType: "product" | "combo" | "partyPack";
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  image?: string;
};

/**
 * Resolve an order line against the current catalog and recompute its price.
 * The `catalogItemId` normally points at a catalogItems doc whose `sourceId`
 * references the underlying product / combo / party pack. Legacy carts may
 * store the source document id directly, so we accept either form.
 */
async function resolveOrderLine(
  ctx: MutationCtx,
  item: {
    catalogItemId: Id<"catalogItems">;
    itemType: "product" | "combo" | "partyPack";
    variantName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    image?: string;
  },
  businessUnitId: Id<"businessUnits">,
): Promise<OrderLine> {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error("Invalid quantity");
  }

  const doc = (await ctx.db.get(
    item.catalogItemId as Id<"catalogItems">,
  )) as unknown as ResolvableDoc | null;

  if (!doc) {
    throw new Error("Item not found in catalog");
  }
  if (doc.businessUnitId !== businessUnitId) {
    throw new Error("Item does not belong to this store");
  }
  if (doc.itemType && doc.itemType !== item.itemType) {
    throw new Error("Item type mismatch");
  }

  const source =
    typeof doc.sourceId === "string"
      ? ((await ctx.db.get(doc.sourceId as any)) as unknown as ResolvableDoc | null)
      : doc;

  if (!source) {
    throw new Error("Item source not found");
  }
  if (source.businessUnitId !== businessUnitId) {
    throw new Error("Item does not belong to this store");
  }
  if (doc.status !== "active" || doc.deletedAt) {
    throw new Error(`"${doc.name ?? "Item"}" is no longer available`);
  }
  if (source.status !== "active" || source.deletedAt) {
    throw new Error(`"${source.name ?? "Item"}" is no longer available`);
  }

  let unitPrice: number;
  if (item.itemType === "product") {
    const variant = (source.variants ?? []).find(
      (v) => v.active && v.optionValue === item.variantName,
    );
    if (!variant) {
      throw new Error(`Variant "${item.variantName}" not found`);
    }
    unitPrice = variant.price;
  } else {
    unitPrice = source.price ?? 0;
  }

  const totalPrice = unitPrice * item.quantity;

  if (Math.abs(item.unitPrice - unitPrice) > PRICE_TOLERANCE) {
    throw new Error(
      `Price for "${source.name ?? item.itemType}" has changed. Please review your cart.`,
    );
  }
  if (Math.abs(item.totalPrice - totalPrice) > PRICE_TOLERANCE) {
    throw new Error(
      `Total for "${source.name ?? item.itemType}" is out of date. Please review your cart.`,
    );
  }

  return {
    catalogItemId: item.catalogItemId,
    itemType: item.itemType,
    name: source.name ?? item.itemType,
    variantName: item.variantName,
    quantity: item.quantity,
    unitPrice,
    totalPrice,
    image: item.image,
  };
}

type DeliveryZoneSettings = {
  deliveryFee?: number;
  freeDeliveryThreshold?: number;
};

/**
 * Recompute the delivery fee from current settings / zones. Pickup is free.
 * When a deliveryZoneId is provided it is validated and used; otherwise the
 * first active zone is assumed (matching the checkout default).
 */
async function computeDeliveryFee(
  ctx: MutationCtx,
  args: {
    businessUnitId: Id<"businessUnits">;
    orderType: "delivery" | "pickup";
    deliveryZoneId?: Id<"deliveryZones">;
    afterDiscount: number;
    settings?: DeliveryZoneSettings | null;
  },
): Promise<number> {
  if (args.orderType !== "delivery") return 0;

  const settings = args.settings;

  const feeForZone = (zone: {
    charge?: number;
    freeDeliveryThreshold?: number;
  }): number => {
    const threshold = zone.freeDeliveryThreshold ?? settings?.freeDeliveryThreshold;
    if (threshold && args.afterDiscount >= threshold) return 0;
    return zone.charge ?? settings?.deliveryFee ?? 0;
  };

  if (args.deliveryZoneId) {
    const zone = await ctx.db.get(args.deliveryZoneId);
    if (
      !zone ||
      zone.businessUnitId !== args.businessUnitId ||
      zone.status !== "active" ||
      zone.deletedAt
    ) {
      throw new Error("Delivery zone is not valid for this store");
    }
    // Operating rule: the zone's minimum order must be met on the discounted
    // subtotal (the amount the customer actually pays for goods). Enforced
    // server-side so a stale or tampered checkout can't bypass the rule.
    if (zone.minOrder && args.afterDiscount < zone.minOrder) {
      throw new Error(
        `Delivery to "${zone.name}" requires a minimum order of ₹${zone.minOrder}`,
      );
    }
    return feeForZone(zone);
  }

  const zones = await ctx.db
    .query("deliveryZones")
    .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "active"),
        q.eq(q.field("deletedAt"), undefined),
      )
    )
    .collect();

  if (zones.length > 0) {
    return feeForZone(zones[0]);
  }

  return settings?.deliveryFee ?? 0;
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
    deliveryZoneId: v.optional(v.id("deliveryZones")),
    deliveryNotes: v.optional(v.string()),
    offerId: v.optional(v.id("offers")),
    offerCode: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    // ----------------------------------------------------------------------
    // 0. Idempotency — reject duplicate submissions (network retry, browser
    //    refresh, double-click, repeated submit). If an order already exists
    //    for this request key, return it instead of creating a new order and
    //    re-running side effects (inventory / loyalty / notifications).
    // ----------------------------------------------------------------------
    if (args.idempotencyKey) {
      const existingOrder = await ctx.db
        .query("orders")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey),
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .first();

      if (existingOrder) {
        if (
          existingOrder.customerPhone !== args.customerPhone ||
          Math.abs(existingOrder.total - args.total) > PRICE_TOLERANCE
        ) {
          throw new Error("This request key has already been used for a different order");
        }
        return {
          orderId: existingOrder._id,
          orderNumber: existingOrder.orderNumber,
          existing: true,
        };
      }
    }

    // ----------------------------------------------------------------------
    // 1. Items — resolve each line against current catalog data and recompute
    //    the authoritative unit price / line total from the active variant.
    // ----------------------------------------------------------------------
    const items: OrderLine[] = [];
    let subtotal = 0;
    for (const item of args.items) {
      const line = await resolveOrderLine(ctx, item, args.businessUnitId);
      items.push(line);
      subtotal += line.totalPrice;
    }
    if (items.length === 0) {
      throw new Error("Order must contain at least one item");
    }
    if (Math.abs(args.subtotal - subtotal) > PRICE_TOLERANCE) {
      throw new Error("Cart subtotal is out of date. Please review your cart.");
    }

    // ----------------------------------------------------------------------
    // 2. Coupon discount — validated & recomputed server-side.
    // ----------------------------------------------------------------------
    let couponDiscount = 0;
    let offerId: Id<"offers"> | undefined;
    if (args.offerCode) {
      const coupon = await validateCouponInternal(ctx, {
        code: args.offerCode,
        businessUnitId: args.businessUnitId,
        subtotal,
      });
      if (!coupon.valid) {
        throw new Error(
          `Coupon is no longer valid: ${coupon.error ?? "please review your cart"}`,
        );
      }
      couponDiscount = coupon.discount ?? 0;
      offerId = coupon.offerId;
    }
    if (args.offerId && offerId && args.offerId !== offerId) {
      throw new Error("Coupon mismatch");
    }

    // ----------------------------------------------------------------------
    // 3. Discount — the portion beyond the coupon can only come from loyalty
    //    points, capped at the customer's maximum redeemable value.
    // ----------------------------------------------------------------------
    const customerId = await ensureCustomerByPhone(ctx, {
      name: args.customerName,
      phone: args.customerPhone,
      email: args.customerEmail,
    });

    const submittedLoyalty = args.discount - couponDiscount;
    if (submittedLoyalty < -PRICE_TOLERANCE) {
      throw new Error("Discount is out of date. Please review your cart.");
    }
    const redeemable = await getMaxRedeemableInternal(ctx, {
      customerId,
      orderTotal: subtotal,
    });
    if (submittedLoyalty > redeemable.maxValue + PRICE_TOLERANCE) {
      throw new Error("Loyalty discount exceeds your available points");
    }
    const discount =
      couponDiscount + Math.min(Math.max(submittedLoyalty, 0), redeemable.maxValue);
    if (Math.abs(args.discount - discount) > PRICE_TOLERANCE) {
      throw new Error("Discount is out of date. Please review your cart.");
    }

    // ----------------------------------------------------------------------
    // 4. Delivery fee, tax and grand total — recomputed server-side.
    // ----------------------------------------------------------------------
    const buSettings = await ctx.db
      .query("settings")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    // Operating rule: reject orders while the store is closed. Mirrors the
    // client-side gate so a stale checkout or a direct API call can't slip an
    // order through outside business hours.
    if (!isStoreCurrentlyOpen(buSettings)) {
      throw new Error(
        "The store is currently closed. Please try again during business hours.",
      );
    }

    // Delivery orders must always carry a destination address.
    if (args.orderType === "delivery" && !args.deliveryAddress?.trim()) {
      throw new Error("Delivery address is required");
    }

    const afterDiscount = Math.max(0, subtotal - discount);

    const deliveryFee = await computeDeliveryFee(ctx, {
      businessUnitId: args.businessUnitId,
      orderType: args.orderType,
      deliveryZoneId: args.deliveryZoneId,
      afterDiscount,
      settings: buSettings,
    });
    if (Math.abs(args.deliveryFee - deliveryFee) > PRICE_TOLERANCE) {
      throw new Error("Delivery fee is out of date. Please review your cart.");
    }

    const taxRate = buSettings?.taxRate ?? 0;
    const tax = Math.round(afterDiscount * taxRate * 100) / 100;
    if (Math.abs(args.tax - tax) > PRICE_TOLERANCE) {
      throw new Error("Tax is out of date. Please review your cart.");
    }

    const total = afterDiscount + deliveryFee + tax;
    if (Math.abs(args.total - total) > PRICE_TOLERANCE) {
      throw new Error("Order total is out of date. Please review your cart.");
    }

    // ----------------------------------------------------------------------
    // 5. Create the order with server-computed values.
    // ----------------------------------------------------------------------
    const prefix = "MB";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `${prefix}-${timestamp}-${random}`;
    const now = Date.now();

    const paymentStatus = args.paymentMethod === "upi_qr" ? "pending_verification" as const : "pending" as const;

    const orderId = await ctx.db.insert("orders", {
      businessUnitId: args.businessUnitId,
      orderNumber,
      customerId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      items,
      subtotal,
      discount,
      deliveryFee,
      tax,
      total,
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      deliveryZoneId: args.deliveryZoneId,
      deliveryNotes: args.deliveryNotes,
      status: "pending",
      paymentStatus,
      paymentMethod: args.paymentMethod,
      offerId,
      offerCode: args.offerCode,
      idempotencyKey: args.idempotencyKey,
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

    // Coupon usage — incremented exactly once per successfully created order.
    // `create` is idempotency-keyed (a retry returns the existing order above),
    // so a network retry or double submit can never double-count a redemption.
    // Failed/cancelled orders never reach this point and never consume usage.
    if (offerId) {
      await ctx.runMutation(internal.offers.incrementUsage, { id: offerId });
    }

    // Reserve stock for each item. Done inline in the create transaction so
    // the reservation and order insert are atomic — a failed reservation rolls
    // the whole order back instead of leaving an order with no stock held.
    for (const item of items) {
      const inventory = await findInventoryForOrderItem(
        ctx,
        item.catalogItemId,
        item.variantName,
      );

      if (!inventory) continue;

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(`Invalid quantity for "${inventory.variantName}"`);
      }

      const reserved = inventory.reservedStock ?? 0;
      const avail = inventory.stockQuantity - reserved;
      if (avail < item.quantity) {
        throw new Error(
          `Insufficient stock for "${inventory.variantName}". Available: ${avail}, requested: ${item.quantity}`,
        );
      }

      const newReserved = reserved + item.quantity;
      await ctx.db.patch(inventory._id, {
        reservedStock: newReserved,
        available: (inventory.stockQuantity - newReserved) > 0,
        updatedAt: now,
      });

      await logMovement(ctx, {
        inventoryId: inventory._id,
        businessUnitId: inventory.businessUnitId,
        type: "reservation",
        quantity: item.quantity,
        previousStock: inventory.stockQuantity,
        newStock: inventory.stockQuantity,
        orderId,
      });

      await logActivity(ctx, {
        orderId,
        businessUnitId: inventory.businessUnitId,
        action: "inventory_reserved",
        newValue: `${item.quantity} × ${inventory.variantName}`,
        actor: "system",
        visibleToCustomer: true,
      });
    }

    const businessUnit = await ctx.db.get(args.businessUnitId);
    await notify("NEW_ORDER", {
      orderId,
      orderNumber,
      businessUnitName: businessUnit?.name ?? "",
      orderType: args.orderType,
      total,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      customerName: args.customerName,
    });

    return { orderId, orderNumber, existing: false };
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

    // Reject invalid status transitions. Terminal states (cancelled/refunded)
    // have no outgoing transitions; skipping steps (e.g. pending -> delivered)
    // is also rejected.
    if (args.status !== previousStatus) {
      const allowed = getAllowedTransitions(previousStatus, order.orderType);
      if (!allowed.includes(args.status)) {
        throw new Error(
          `Order cannot move from ${previousStatus} to ${args.status}`,
        );
      }
    }

    // Payment status must be independent of order status. An order may only
    // become "paid" through an explicit, separate payment confirmation; it
    // must never flip to paid as a side effect of a status change.
    if (
      args.paymentStatus === "paid" &&
      args.paymentStatus !== previousPayment &&
      args.status !== previousStatus
    ) {
      throw new Error(
        "Payment must be confirmed explicitly and independently of order status",
      );
    }

    // Operating rule: preparation must never begin before payment verification.
    // The order can only move to "preparing" once it is actually paid. This
    // also blocks combined updates that would smuggle an unpaid order into
    // preparation, and never blocks already-paid orders already in progress.
    const resultingPayment = args.paymentStatus ?? order.paymentStatus;
    if (
      args.status === "preparing" &&
      args.status !== previousStatus &&
      resultingPayment !== "paid"
    ) {
      throw new Error("Payment must be verified before preparation can begin");
    }

    // On confirm: deduct reserved stock from actual stock
    if (args.status === "confirmed" && order.status !== "confirmed") {
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(internal.inventory.confirmReservation, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
          });
        }
      }
    }

    // On cancel/refund: release reserved stock. If the order had already been
    // confirmed, its stock was deducted from on-hand inventory and must be
    // added back; otherwise only the reservation needs to be released.
    if (
      (args.status === "cancelled" || args.status === "refunded") &&
      order.status !== "cancelled" &&
      order.status !== "refunded"
    ) {
      const deducted = order.status !== "pending";
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(internal.inventory.restoreStock, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
            deducted,
          });
        }
      }
    }

    // Auto-award loyalty points on delivery
    if (args.status === "delivered" && order.status !== "delivered" && order.customerId) {
      await ctx.runMutation(internal.loyalty.awardPoints, {
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

// ============================================================================
// Re-open payment verification
// ============================================================================

/**
 * Admin-only recovery for an order whose payment verification was rejected or
 * failed. Moves paymentStatus back to "pending_verification" so the customer
 * can retry payment and submit a fresh claim. This never touches order status,
 * inventory, or money — it only re-arms the verification window and records an
 * auditable activity.
 *
 * Idempotent: calling it on an order already awaiting verification is a no-op.
 */
export const reopenPaymentVerification = mutation({
  args: { sessionToken: v.string(), orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    const order = await ctx.db.get(args.orderId);
    if (!order || order.deletedAt) throw new Error("Order not found");

    // Terminal order states have no verification window to re-open.
    if (
      order.status === "cancelled" ||
      order.status === "refunded" ||
      order.status === "delivered"
    ) {
      throw new Error("This order can no longer be re-opened for verification");
    }

    // Money already collected — never un-verify a paid/refunded order.
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      throw new Error("Payment is already settled for this order");
    }

    // Already awaiting verification — idempotent no-op (double-click safe).
    if (order.paymentStatus === "pending_verification") {
      return { reopened: false };
    }

    // Only a failed or rejected verification can be re-opened.
    if (
      order.paymentStatus !== "failed" &&
      order.paymentStatus !== "rejected"
    ) {
      throw new Error("Payment is not in a failed or rejected state");
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      paymentStatus: "pending_verification",
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: order.businessUnitId,
      action: "payment_reopened",
      previousValue: order.paymentStatus,
      newValue: "pending_verification",
      actor: admin.username,
      actorId: admin._id,
      visibleToCustomer: true,
    });

    return { reopened: true };
  },
});

// ============================================================================
// Customer payment claim
// ============================================================================

/**
 * Records a customer's "I've Paid" claim so the kitchen/owner can see that the
 * customer says the transfer is done. This is deliberately a light operation:
 * it never creates an order, never touches inventory or loyalty, and never
 * changes payment/order status. Payment is only confirmed by an admin through
 * updateStatus (Mark Paid / Reject), which preserves the audit trail.
 *
 * The customer may optionally attach their UPI transaction reference (UTR);
 * it is stored once on the order for admin verification and never shown in
 * customer-facing views.
 */
export const claimPayment = mutation({
  args: {
    orderId: v.id("orders"),
    phone: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const order = await ctx.db.get(args.orderId);
    if (!order || order.deletedAt) throw new Error("Order not found");
    if (order.customerPhone !== args.phone) {
      throw new Error("Order not found for this phone number");
    }

    // Reservation already ended — there is nothing left to claim.
    if (order.status === "cancelled" || order.status === "refunded") {
      return { outcome: "expired" as const };
    }

    // Already verified — idempotent no-op.
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      return { outcome: "already_paid" as const };
    }

    // A claim may be submitted while payment is awaiting verification, or after
    // a failed/rejected verification when the customer has retried and wants a
    // re-check. Paid/refunded orders are handled above; "pending" (never
    // submitted for verification) stays un-claimable.
    if (
      order.paymentStatus !== "pending_verification" &&
      order.paymentStatus !== "failed" &&
      order.paymentStatus !== "rejected"
    ) {
      return { outcome: "not_pending" as const };
    }

    // Optionally record the customer's UPI transaction reference (UTR) so the
    // admin can match the transfer while verifying. The first reference wins
    // so a retry or later edit never overwrites what the customer submitted
    // closest to the actual payment.
    if (args.reference && args.reference.trim()) {
      const reference = args.reference.trim().slice(0, 100);
      if (!order.paymentReference) {
        await ctx.db.patch(order._id, {
          paymentReference: reference,
          updatedAt: Date.now(),
        });
      }
    }

    // Idempotent claim logging: skip when the most recent activity for this
    // order is already a recent customer claim, so double-taps and retries
    // never produce duplicate activities.
    const recent = await ctx.db
      .query("orderActivities")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .order("desc")
      .first();

    const claimActor = order.customerName || order.customerPhone;

    const alreadyClaimed =
      recent?.action === "payment_pending" &&
      recent.actor === claimActor &&
      Date.now() - recent.createdAt < CLAIM_COOLDOWN_MS;

    if (!alreadyClaimed) {
      await logActivity(ctx, {
        orderId: order._id,
        businessUnitId: order.businessUnitId,
        action: "payment_pending",
        newValue: order.paymentStatus,
        actor: claimActor,
        visibleToCustomer: true,
      });
    }

    return {
      outcome: alreadyClaimed ? ("already_claimed" as const) : ("claimed" as const),
    };
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("orders") },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    const order = await ctx.db.get(args.id);
    if (!order) throw new Error("Order not found");

    const now = Date.now();

    // Release reserved stock if order hasn't been confirmed yet; if it had
    // been confirmed, restore the deducted stock to on-hand inventory.
    if (order.status !== "cancelled" && order.status !== "refunded") {
      const deducted = order.status !== "pending";
      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (inventory) {
          await ctx.runMutation(internal.inventory.restoreStock, {
            inventoryId: inventory._id,
            quantity: item.quantity,
            orderId: args.id,
            deducted,
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
