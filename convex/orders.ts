// ============================================================================
// MB CRUNCHY - Orders Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
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
import { getMaxRedeemableInternal, redeemLoyaltyInternal } from "./loyalty";
import { notify } from "./notificationService";
import { getAllowedTransitions } from "./orderWorkflow";
import { isStoreCurrentlyOpen } from "./utils/storeHours";
import { normalizeIndianPhone, requireIndianPhone } from "./utils/phone";

// ============================================================================
// Constants
// ============================================================================

// Client-submitted money values are display-only; the server recomputes every
// value from current catalog data. These tolerances allow harmless float
// rounding while rejecting any real mismatch (stale cart / tampered prices).
// Increased from 0.01 to 0.02 to handle JavaScript floating point precision
// in tax, delivery fee, and total calculations.
const PRICE_TOLERANCE = 0.02;

// ============================================================================
// Internal Queries & Mutations (for Razorpay integration)
// ============================================================================

/** Internal: fetch order by ID (used by Razorpay actions). */
export const getByIdInternal = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

// ============================================================================
// finalizePaidOrder — Idempotent order finalization after Razorpay payment
//
// Called by BOTH:
//   1. verifyPayment (browser path)
//   2. Razorpay payment.captured webhook (server path)
//
// Safe to call multiple times — idempotency guards prevent duplicate:
//   - inventory reservation
//   - coupon usage
//   - loyalty redemption
//   - NEW_ORDER notification
// ============================================================================

export const finalizePaidOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;

    // Idempotent: already paid or refunded — do nothing.
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      return;
    }

    const now = Date.now();
    const patchFields: Record<string, unknown> = {
      paymentStatus: "paid",
      razorpayPaymentId: args.razorpayPaymentId,
      updatedAt: now,
    };

    if (args.razorpaySignature) {
      patchFields.razorpaySignature = args.razorpaySignature;
    }

    // Transition order from awaiting_payment to pending when payment is
    // confirmed.
    if (order.status === "awaiting_payment") {
      patchFields.status = "pending";
    }

    // Race-condition recovery: the cron may have cancelled this order before
    // the payment arrived. If the cancellation was system-initiated (cron),
    // restore to "pending" since the Razorpay payment is authoritative.
    // If cancelled by admin, keep "cancelled" but still record the payment.
    if (order.status === "cancelled") {
      const lastActivity = await ctx.db
        .query("orderActivities")
        .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
        .order("desc")
        .first();

      const wasSystemCancelled =
        lastActivity &&
        lastActivity.action === "cancelled" &&
        lastActivity.actor === "system";

      if (wasSystemCancelled) {
        patchFields.status = "pending";
      }
    }

    await ctx.db.patch(args.orderId, patchFields);

    // --- Outside-area order finalization ---
    // For outside-area orders with accepted quote, inventory reservation,
    // notification, coupon and loyalty redemption are deferred from creation
    // to payment finalization. Local orders already handled these at create.
    if (
      order.deliveryQuoteRequired &&
      order.deliveryQuoteStatus === "accepted"
    ) {
      // Idempotency guard: check if inventory was already reserved.
      const alreadyReserved = await ctx.db
        .query("orderActivities")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .filter((q) => q.eq(q.field("action"), "inventory_reserved"))
        .first();

      if (!alreadyReserved) {
        // NEW_ORDER notification
        const businessUnit = await ctx.db.get(order.businessUnitId);
        await notify("NEW_ORDER", {
          orderId: order._id,
          orderNumber: order.orderNumber,
          businessUnitName: businessUnit?.name ?? "",
          orderType: order.orderType,
          total: order.total,
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          customerName: order.customerName,
        });

        // Reserve stock
        for (const item of order.items) {
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
            orderId: order._id,
          });

          await logActivity(ctx, {
            orderId: order._id,
            businessUnitId: inventory.businessUnitId,
            action: "inventory_reserved",
            newValue: `${item.quantity} × ${inventory.variantName}`,
            actor: "system",
            visibleToCustomer: true,
          });
        }

        // Coupon usage
        if (order.offerId) {
          await ctx.runMutation(internal.offers.incrementUsage, { id: order.offerId });
        }

        // Loyalty redemption — idempotent via existing transaction check
        const loyaltyPoints = order.loyaltyPointsToRedeem ?? 0;
        if (loyaltyPoints > 0 && order.customerId) {
          const alreadyRedeemed = await ctx.db
            .query("loyaltyTransactions")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .filter((q) => q.eq(q.field("type"), "redeemed"))
            .first();

          if (!alreadyRedeemed) {
            await redeemLoyaltyInternal(ctx, {
              customerId: order.customerId,
              orderId: order._id,
              orderNumber: order.orderNumber,
              points: loyaltyPoints,
              orderTotal: order.subtotal,
            });
          }
        }
      }
    }

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: order.businessUnitId,
      action: "payment_verified",
      previousValue: order.paymentStatus,
      newValue: "paid",
      actor: "system",
      visibleToCustomer: true,
    });
  },
});

/** Internal: store Razorpay Order ID on the MB Crunchy order. */
export const updateRazorpayOrderId = internalMutation({
  args: {
    orderId: v.id("orders"),
    razorpayOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      razorpayOrderId: args.razorpayOrderId,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: store Razorpay payment details after signature verification. */
/**
 * Internal: mark payment failed from webhook (payment.failed).
 * Sets paymentStatus to "failed". Idempotent.
 */
export const failPaymentFromWebhook = internalMutation({
  args: {
    orderId: v.id("orders"),
    razorpayPaymentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;

    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      paymentStatus: "failed",
      ...(args.razorpayPaymentId ? { razorpayPaymentId: args.razorpayPaymentId } : {}),
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: order.businessUnitId,
      action: "payment_failed",
      previousValue: order.paymentStatus,
      newValue: "failed",
      actor: "system",
      visibleToCustomer: true,
    });
  },
});

/** Internal: find orders by Razorpay order ID (for webhook lookup). */
export const getByRazorpayOrderIdInternal = internalQuery({
  args: { razorpayOrderId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", args.razorpayOrderId))
      .collect();
  },
});

/** Internal: find orders by Razorpay payment ID (for webhook lookup). */
export const getByRazorpayPaymentIdInternal = internalQuery({
  args: { razorpayPaymentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_razorpayPaymentId", (q) => q.eq("razorpayPaymentId", args.razorpayPaymentId))
      .collect();
  },
});

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
    const phone = normalizeIndianPhone(args.phone); // returns null on invalid → graceful empty result
    return await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("customerPhone", phone ?? ""))
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
    const phone = normalizeIndianPhone(args.phone); // returns null on invalid
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

  // Allow items from different business units in the same order
  // The order is created under the primary business unit, but can contain items from other BUs
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
    if (variant) {
      unitPrice = variant.price;
    } else {
      // Fallback: product has no matching variant (e.g., no variants defined, or "Default" sent for product without variants).
      // Use the catalog item's base price (stored in the catalog item's price field).
      unitPrice = doc.price ?? 0;
    }
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
 * Recompute the delivery fee from current settings / zones / global policy.
 * Pickup is free. Outside-area delivery has fee=0 (quote required).
 * When a deliveryZoneId is provided it is validated and used; otherwise the
 * global delivery policy is used for local delivery.
 */
async function computeDeliveryFee(
  ctx: MutationCtx,
  args: {
    businessUnitId: Id<"businessUnits">;
    orderType: "delivery" | "pickup";
    deliveryType?: "local" | "outside_area";
    deliveryZoneId?: Id<"deliveryZones">;
    afterDiscount: number;
    settings?: DeliveryZoneSettings | null;
  },
): Promise<number> {
  if (args.orderType !== "pickup" && args.deliveryType === "outside_area") {
    // Outside-area delivery: fee is determined later by admin. Charge 0 now.
    return 0;
  }

  if (args.orderType !== "delivery") return 0;

  // Local delivery: use the global delivery policy
  const policy = await ctx.db
    .query("deliveryPolicies")
    .filter((q) =>
      q.and(
        q.eq(q.field("serviceType"), "local"),
        q.eq(q.field("status"), "active"),
        q.eq(q.field("deletedAt"), undefined)
      )
    )
    .first();

  if (policy && policy.feeType === "fixed" && policy.fixedFee !== undefined) {
    // Check free delivery threshold
    if (policy.freeDeliveryThreshold && args.afterDiscount >= policy.freeDeliveryThreshold) {
      return 0;
    }
    return policy.fixedFee;
  }

  // Legacy fallback: if no global policy, try deliveryZones
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
      (zone.businessUnitId !== args.businessUnitId && !zone.isDefault) ||
      zone.status !== "active" ||
      zone.deletedAt
    ) {
      throw new Error("Delivery zone is not valid for this store");
    }
    if (zone.minOrder && args.afterDiscount < zone.minOrder) {
      throw new Error(
        `Delivery to "${zone.name}" requires a minimum order of ₹${zone.minOrder}`,
      );
    }
    return feeForZone(zone);
  }

  // No delivery zone found — do not silently apply a fee.
  return 0;
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
    deliveryType: v.optional(v.union(v.literal("local"), v.literal("outside_area"))),
    deliveryAddress: v.optional(v.string()),
    deliveryZoneId: v.optional(v.id("deliveryZones")),
    deliveryNotes: v.optional(v.string()),
    offerId: v.optional(v.id("offers")),
    offerCode: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    loyaltyPointsToRedeem: v.optional(v.number()),
    mealDealIds: v.optional(v.array(v.string())),
    mealDealDiscount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // Allow guest checkout - authentication is optional for order creation
    // Customer is identified by phone/email via ensureCustomerByPhone

    // Normalize phone to canonical +91XXXXXXXXXX format — reject invalid
    const customerPhone = requireIndianPhone(args.customerPhone);

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
          existingOrder.customerPhone !== customerPhone ||
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
    // 2b. Meal deal discount — validated server-side from active deals.
    // ----------------------------------------------------------------------
    let mealDealDiscount = 0;
    if (args.mealDealIds && args.mealDealIds.length > 0) {
      for (const mealDealId of args.mealDealIds) {
        const dealDoc = await ctx.db.get(mealDealId as Id<"mealDeals">);
        if (!dealDoc || dealDoc.status !== "active" || dealDoc.deletedAt) {
          throw new Error("One or more meal deals are no longer active");
        }

        // Verify qualifying items exist in the order with sufficient quantities.
        // Allow primary catalogItemId OR any alternative.
        for (const qi of dealDoc.qualifyingItems) {
          const allowedIds = [qi.catalogItemId, ...((qi as any).alternatives ?? [])];
          const matchingItem = items.find(
            (item) => allowedIds.includes(item.catalogItemId)
          );
          if (!matchingItem || matchingItem.quantity < qi.quantity) {
            throw new Error(
              `Insufficient quantity for meal deal qualifying item "${matchingItem?.name ?? qi.catalogItemId}"`
            );
          }
        }

        // Calculate server-side discount using the ACTUAL catalog prices
        // from the order items (which may include alternative products).
        // Apply surcharge: difference between alternative price and base qualifying price.
        let serverIndividualTotal = 0;
        let serverTotalSurcharge = 0;
        for (const qi of dealDoc.qualifyingItems) {
          const allowedIds = [qi.catalogItemId, ...((qi as any).alternatives ?? [])];
          const matchingItem = items.find(
            (item) => allowedIds.includes(item.catalogItemId)
          );

          // Fetch base qualifying item price for surcharge calculation.
          const baseCatalogItem = await ctx.db.get(qi.catalogItemId);
          if (!baseCatalogItem) {
            throw new Error(`Meal deal base qualifying item ${qi.catalogItemId} not found`);
          }
          const basePrice = baseCatalogItem.price;

          if (matchingItem) {
            serverIndividualTotal += matchingItem.unitPrice * qi.quantity;
            // Surcharge: selected price minus base qualifying price.
            serverTotalSurcharge += Math.max(0, matchingItem.unitPrice - basePrice) * qi.quantity;
          } else {
            serverIndividualTotal += basePrice * qi.quantity;
          }
        }

        const effectiveDealPrice = dealDoc.dealPrice + serverTotalSurcharge;
        const dealDiscount = serverIndividualTotal - effectiveDealPrice;
        if (dealDiscount > 0) {
          mealDealDiscount += dealDiscount;
        }
      }

      // Validate client-submitted meal deal discount
      if (Math.abs((args.mealDealDiscount ?? 0) - mealDealDiscount) > PRICE_TOLERANCE) {
        throw new Error("Meal deal discount is out of date. Please review your cart.");
      }
    }

    // ----------------------------------------------------------------------
    // 3. Discount — the portion beyond the coupon and meal deal can only
    //    come from loyalty points, capped at the customer's max redeemable.
    // ----------------------------------------------------------------------
    const customerId = await ensureCustomerByPhone(ctx, {
      name: args.customerName,
      phone: customerPhone,
      email: args.customerEmail,
    });

    const submittedNonCouponDiscount = args.discount - couponDiscount;
    if (submittedNonCouponDiscount < -PRICE_TOLERANCE) {
      throw new Error("Discount is out of date. Please review your cart.");
    }
    const redeemable = await getMaxRedeemableInternal(ctx, {
      customerId,
      orderTotal: subtotal,
    });
    const submittedLoyalty = submittedNonCouponDiscount - mealDealDiscount;
    if (submittedLoyalty > redeemable.maxValue + PRICE_TOLERANCE) {
      throw new Error("Loyalty discount exceeds your available points");
    }
    const loyaltyDiscount = Math.min(Math.max(submittedLoyalty, 0), redeemable.maxValue);
    const discount = couponDiscount + mealDealDiscount + loyaltyDiscount;
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

    const deliveryType = args.deliveryType ?? "local";
    const deliveryQuoteRequired = deliveryType === "outside_area";

    // Outside-area orders: delivery fee is 0 until admin quotes.
    // Local/pickup: use existing server-computed fee.
    let deliveryFee: number;
    if (deliveryQuoteRequired) {
      deliveryFee = 0;
      // Validate client also sent 0
      if (Math.abs(args.deliveryFee) > PRICE_TOLERANCE) {
        throw new Error("Delivery fee must be 0 for outside-area orders before quote");
      }
    } else {
      deliveryFee = await computeDeliveryFee(ctx, {
        businessUnitId: args.businessUnitId,
        orderType: args.orderType,
        deliveryType,
        deliveryZoneId: args.deliveryZoneId,
        afterDiscount,
        settings: buSettings,
      });
      if (Math.abs(args.deliveryFee - deliveryFee) > PRICE_TOLERANCE) {
        throw new Error("Delivery fee is out of date. Please review your cart.");
      }
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
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    const orderNumber = `${prefix}-${timestamp}${random}`;
    const now = Date.now();

    const paymentStatus = "pending" as const;

    // Outside-area orders: no payment yet, quote pending. No NEW_ORDER notification
    // or inventory reservation until customer accepts quote and claims payment.
    const isOutsideArea = deliveryQuoteRequired;
    const orderPaymentStatus = isOutsideArea ? "pending" as const : paymentStatus;
    const deliveryQuoteStatus = isOutsideArea ? "pending" as const : undefined;

    const orderId = await ctx.db.insert("orders", {
      businessUnitId: args.businessUnitId,
      orderNumber,
      customerId,
      customerName: args.customerName,
      customerPhone: customerPhone,
      customerEmail: args.customerEmail,
      items,
      subtotal,
      discount,
      deliveryFee,
      tax,
      total,
      orderType: args.orderType,
      deliveryType,
      deliveryAddress: args.deliveryAddress,
      deliveryZoneId: args.deliveryZoneId,
      deliveryNotes: args.deliveryNotes,
      deliveryQuoteRequired,
      deliveryQuoteStatus,
      status: "awaiting_payment",
      paymentStatus: orderPaymentStatus,
      paymentMethod: args.paymentMethod,
      offerId,
      offerCode: args.offerCode,
      loyaltyPointsToRedeem: args.loyaltyPointsToRedeem,
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

    // Outside-area orders: no notification or inventory reservation yet.
    // These happen when customer accepts quote and claims payment.
    if (!isOutsideArea) {
      // Don't send NEW_ORDER notification or reserve inventory for awaiting_payment orders
      // These happen when payment is verified (finalizePaidOrder)

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

      // Atomic loyalty redemption — server-authoritative. Deducted within the
      // same transaction as order creation so a failure rolls back the order.
      const loyaltyPoints = args.loyaltyPointsToRedeem ?? 0;
      if (loyaltyPoints > 0 && customerId) {
        await redeemLoyaltyInternal(ctx, {
          customerId,
          orderId,
          orderNumber,
          points: loyaltyPoints,
          orderTotal: subtotal,
        });
      }
    } else {
      // Outside-area: log that quote is pending, skip coupon/inventory for now.
      await logActivity(ctx, {
        orderId,
        businessUnitId: args.businessUnitId,
        action: "payment_pending",
        newValue: "delivery_quote_pending",
        actor: "system",
        visibleToCustomer: true,
      });
    }

    return { orderId, orderNumber, existing: false };
  },
});

export const updateStatus = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("orders"),
    status: v.union(
      v.literal("awaiting_payment"),
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
        v.literal("paid"),
        v.literal("failed"),
        v.literal("refunded"),
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

    // Operating rule: an order can only be accepted (moved to confirmed)
    // after payment has been verified. This prevents Kitchen from receiving
    // unpaid orders and ensures Admin cannot bypass payment verification.
    if (
      args.status === "confirmed" &&
      args.status !== previousStatus &&
      (args.paymentStatus ?? order.paymentStatus) !== "paid"
    ) {
      throw new Error("Payment must be verified before accepting this order");
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
    // awaiting_payment orders have reserved stock but NOT deducted on-hand.
    if (
      (args.status === "cancelled" || args.status === "refunded") &&
      order.status !== "cancelled" &&
      order.status !== "refunded"
    ) {
      const deducted = order.status === "confirmed";
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

      // Reverse coupon usage if the order had a consumed coupon.
      // The coupon is consumed exactly when inventory is reserved (logged as
      // an "inventory_reserved" activity). For local orders this happens at
      // orders.create; for outside-area orders at finalizePaidOrder. Checking for
      // this activity is the authoritative signal that usage was incremented.
      if (order.offerId) {
        const reservedActivity = await ctx.db
          .query("orderActivities")
          .withIndex("by_order", (q) => q.eq("orderId", args.id))
          .filter((q) => q.eq(q.field("action"), "inventory_reserved"))
          .first();

        if (reservedActivity) {
          await ctx.runMutation(internal.offers.decrementUsage, { id: order.offerId });
        }
      }

      // Reverse loyalty points if they were redeemed during order creation.
      if (order.customerId) {
        const loyaltyTxn = await ctx.db
          .query("loyaltyTransactions")
          .withIndex("by_order", (q) => q.eq("orderId", args.id))
          .filter((q) => q.eq(q.field("type"), "redeemed"))
          .first();

        if (loyaltyTxn) {
          const account = await ctx.db
            .query("loyaltyAccounts")
            .withIndex("by_customer", (q) => q.eq("customerId", order.customerId!))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .first();

          if (account) {
            const pointsToRestore = Math.abs(loyaltyTxn.points);
            const settings = await ctx.db.query("loyaltySettings").first();

            await ctx.db.patch(account._id, {
              pointsBalance: account.pointsBalance + pointsToRestore,
              totalRedeemed: Math.max(0, account.totalRedeemed - pointsToRestore),
              updatedAt: now,
            });

            await ctx.db.insert("loyaltyTransactions", {
              customerId: order.customerId,
              orderId: args.id,
              type: "adjusted",
              points: pointsToRestore,
              description: `Restored from cancelled order #${order.orderNumber}`,
              balanceAfter: account.pointsBalance + pointsToRestore,
              createdAt: now,
            });
          }
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

    await ctx.db.patch(args.id, {
      ...patchArgs,
      updatedAt: now,
      ...(args.status !== previousStatus &&
        (args.status === "delivered" || args.status === "cancelled" || args.status === "refunded")
        ? { terminalAt: now }
        : {}),
    });

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
        pending: "payment_pending",
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
// Delivery Quote Mutations (Outside Local Area)
// ============================================================================

export const updateDeliveryQuote = mutation({
  args: {
    sessionToken: v.string(),
    orderId: v.id("orders"),
    deliveryQuoteAmount: v.number(),
    deliveryQuoteNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.deletedAt) throw new Error("Order not found");
    if (!order.deliveryQuoteRequired) {
      throw new Error("This order does not require a delivery quote");
    }
    if (order.deliveryQuoteStatus !== "pending" && order.deliveryQuoteStatus !== "quoted") {
      throw new Error("Delivery quote has already been accepted or rejected");
    }
    if (args.deliveryQuoteAmount <= 0) {
      throw new Error("Delivery quote amount must be greater than 0");
    }

    const now = Date.now();
    const previousQuoteAmount = order.deliveryQuoteAmount ?? 0;

    // Recalculate total: subtotal - discount + new delivery fee + tax
    const afterDiscount = Math.max(0, order.subtotal - order.discount);
    const newTotal = afterDiscount + args.deliveryQuoteAmount + order.tax;

    await ctx.db.patch(order._id, {
      deliveryQuoteStatus: "quoted",
      deliveryQuoteAmount: args.deliveryQuoteAmount,
      deliveryQuoteNotes: args.deliveryQuoteNotes,
      deliveryQuoteUpdatedAt: now,
      deliveryFee: args.deliveryQuoteAmount,
      total: newTotal,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: order._id,
      businessUnitId: order.businessUnitId,
      action: "payment_pending",
      previousValue: previousQuoteAmount > 0 ? `₹${previousQuoteAmount}` : "not_quoted",
      newValue: `₹${args.deliveryQuoteAmount}`,
      actor: "admin",
      visibleToCustomer: true,
    });

    return { success: true, newTotal };
  },
});

export const acceptDeliveryQuote = mutation({
  args: {
    orderId: v.id("orders"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = requireIndianPhone(args.phone);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.deletedAt) throw new Error("Order not found");
    if (order.customerPhone !== phone) {
      throw new Error("Order not found for this phone number");
    }
    if (!order.deliveryQuoteRequired) {
      throw new Error("This order does not have a delivery quote");
    }
    if (order.deliveryQuoteStatus !== "quoted") {
      throw new Error("No delivery quote to accept");
    }

    const now = Date.now();

    // Accept quote. The order stays in "awaiting_payment" with
    // paymentStatus "pending" until the customer actually pays via Razorpay.
    // finalizePaidOrder handles inventory, notification, coupon and loyalty
    // when payment arrives.
    await ctx.db.patch(order._id, {
      deliveryQuoteStatus: "accepted",
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: order._id,
      businessUnitId: order.businessUnitId,
      action: "order_accepted",
      newValue: "delivery_quote_accepted",
      actor: order.customerName || order.customerPhone,
      visibleToCustomer: true,
    });

    return { success: true };
  },
});

export const rejectDeliveryQuote = mutation({
  args: {
    orderId: v.id("orders"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = requireIndianPhone(args.phone);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.deletedAt) throw new Error("Order not found");
    if (order.customerPhone !== phone) {
      throw new Error("Order not found for this phone number");
    }
    if (!order.deliveryQuoteRequired) {
      throw new Error("This order does not have a delivery quote");
    }
    if (order.deliveryQuoteStatus !== "quoted") {
      throw new Error("No delivery quote to reject");
    }

    const now = Date.now();

    await ctx.db.patch(order._id, {
      deliveryQuoteStatus: "rejected",
      status: "cancelled",
      terminalAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: order._id,
      businessUnitId: order.businessUnitId,
      action: "cancelled",
      newValue: "delivery_quote_rejected",
      actor: order.customerName || order.customerPhone,
      visibleToCustomer: true,
    });

    return { success: true };
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
    // awaiting_payment orders have reserved stock but NOT deducted on-hand.
    if (order.status !== "cancelled" && order.status !== "refunded") {
      const deducted = order.status === "confirmed";
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

      // Reverse coupon usage if the order had a consumed coupon.
      // The coupon is consumed exactly when inventory is reserved (logged as
      // an "inventory_reserved" activity). For local orders this happens at
      // orders.create; for outside-area orders at finalizePaidOrder. Checking for
      // this activity is the authoritative signal that usage was incremented.
      if (order.offerId) {
        const reservedActivity = await ctx.db
          .query("orderActivities")
          .withIndex("by_order", (q) => q.eq("orderId", args.id))
          .filter((q) => q.eq(q.field("action"), "inventory_reserved"))
          .first();

        if (reservedActivity) {
          await ctx.runMutation(internal.offers.decrementUsage, { id: order.offerId });
        }
      }

      // Reverse loyalty points if they were redeemed during order creation.
      if (order.customerId) {
        const loyaltyTxn = await ctx.db
          .query("loyaltyTransactions")
          .withIndex("by_order", (q) => q.eq("orderId", args.id))
          .filter((q) => q.eq(q.field("type"), "redeemed"))
          .first();

        if (loyaltyTxn) {
          const account = await ctx.db
            .query("loyaltyAccounts")
            .withIndex("by_customer", (q) => q.eq("customerId", order.customerId!))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .first();

          if (account) {
            const pointsToRestore = Math.abs(loyaltyTxn.points);

            await ctx.db.patch(account._id, {
              pointsBalance: account.pointsBalance + pointsToRestore,
              totalRedeemed: Math.max(0, account.totalRedeemed - pointsToRestore),
              updatedAt: now,
            });

            await ctx.db.insert("loyaltyTransactions", {
              customerId: order.customerId,
              orderId: args.id,
              type: "adjusted",
              points: pointsToRestore,
              description: `Restored from cancelled order #${order.orderNumber}`,
              balanceAfter: account.pointsBalance + pointsToRestore,
              createdAt: now,
            });
          }
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
