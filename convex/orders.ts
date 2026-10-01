// ============================================================================
// MB CRUNCHY - Orders Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdminSession, requireAdminRole } from "./utils/adminAuth";
import { canReadCustomerData, sanitizeOrderForCustomer } from "./utils/customerAccess";
import { logActivity } from "./orderActivities";
import type { ActivityAction } from "./orderActivities";
import { logMovement, resolveInventoryReservations } from "./inventory";
import { ensureCustomerByPhone } from "./customers";
import { validateCouponInternal, consumeCouponUsage } from "./offers";
import { getMaxRedeemableInternal, redeemLoyaltyInternal, authorizeLoyaltySpend } from "./loyalty";
import { notify } from "./notificationService";
import { getAllowedTransitions } from "./orderWorkflow";
import { isStoreCurrentlyOpen } from "./utils/storeHours";
import { normalizeIndianPhone, requireIndianPhone } from "./utils/phone";
import { generateSecureBase36String } from "./utils/crypto";
import { resolveMartShippingQuote } from "./shippingRates";
import { executeBookingWorkflow } from "./courier/bookingWorkflow";

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

        // Reserve stock (bundle lines expand to components; see inventory helper).
        // Strict at reserve time: a tracked item whose variantName matches no
        // inventory row must fail closed here, not resolve to "untracked".
        for (const item of order.items) {
          const expansions = await resolveInventoryReservations(ctx, item, {
            failOnVariantMismatch: true,
          });
          for (const expansion of expansions) {
            const inventory = expansion.inventory;
            const quantity = expansion.quantity;

            if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
              throw new Error(`Invalid quantity for "${inventory.variantName}"`);
            }

            const reserved = inventory.reservedStock ?? 0;
            const avail = inventory.stockQuantity - reserved;
            if (avail < quantity) {
              throw new Error(
                `Insufficient stock for "${inventory.variantName}". Available: ${avail}, requested: ${quantity}`,
              );
            }

            const newReserved = reserved + quantity;
            await ctx.db.patch(inventory._id, {
              reservedStock: newReserved,
              available: (inventory.stockQuantity - newReserved) > 0,
              updatedAt: now,
            });

            await logMovement(ctx, {
              inventoryId: inventory._id,
              businessUnitId: inventory.businessUnitId,
              type: "reservation",
              quantity,
              previousStock: inventory.stockQuantity,
              newStock: inventory.stockQuantity,
              orderId: order._id,
            });

            await logActivity(ctx, {
              orderId: order._id,
              businessUnitId: inventory.businessUnitId,
              action: "inventory_reserved",
              newValue: `${quantity} × ${inventory.variantName}`,
              actor: "system",
              visibleToCustomer: true,
            });
          }
        }

        // Coupon usage — authoritative atomic consume (10C): throws if the
        // limit was reached after order-time validation, rolling back the
        // whole finalization instead of silently overshooting the limit.
        if (order.offerId) {
          const consumption = await consumeCouponUsage(ctx, order.offerId);
          if (!consumption.consumed) {
            throw new Error("This coupon has reached its usage limit");
          }
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

    // --- Shiprocket booking trigger ---
    // Fire-and-forget: initiate courier booking for eligible Mart delivery
    // orders. The booking workflow is fully idempotent and handles its own
    // eligibility checks, so failures here must not block payment finalization.
    // Uses ctx.runMutation so the booking runs within the same Convex transaction
    // context as payment finalization (ensures DB visibility).
    try {
      await ctx.runMutation(internal.courier.bookingWorkflow.executeBookingWorkflowInternal, {
        orderId: args.orderId,
      });
    } catch (err) {
      // Booking failure must not fail payment finalization.
      // The booking can be retried later via admin or webhook.
      console.error(
        "[finalizePaidOrder] Shipment booking trigger failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
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
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    let q = ctx.db.query("orders").withIndex("by_business_unit", (q: any) => q.eq("businessUnitId", args.businessUnitId));

    if (admin.role === "kitchen") {
      const allowedBUs = admin.businessUnitIds ?? [];
      if (!allowedBUs.includes(args.businessUnitId)) {
        return [];
      }
    }

    return await q.filter((q: any) => q.eq(q.field("deletedAt"), undefined)).order("desc").collect();
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
    // P2 F-10: kitchen-role sessions receive the sanitized projection too —
    // full documents are reserved for superadmin/admin roles.
    if (args.sessionToken) {
      const { admin } = await requireAdminSession(ctx, args.sessionToken);
      if (admin.role === "superadmin" || admin.role === "admin") return docs;
    }
    return docs.map(sanitizeOrderForCustomer);
  },
});

export const getByPhone = query({
  args: { sessionToken: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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

// NOTE: per-line inventory lookup now goes through
// resolveInventoryReservations in ./inventory (bundle-aware expansion).
// The local findInventoryForOrderItem copy was removed with it.

// ============================================================================
// Order numbers (10K entropy + collision hardening)
// ----------------------------------------------------------------------------
// Format: MB-{4 base36 timestamp chars}{8 crypto-secure base36 chars}
// (e.g. MB-XXXXABCDEFGH). Historical MB-XXXXYY numbers are untouched and
// keep working — lookups are exact-match only; nothing parses the format.
//
// The random suffix comes from WebCrypto (generateSecureBase36String,
// rejection-sampled, no modulo bias) — never Math.random(), never client
// input. The timestamp component is a display/cycle aid, not entropy.
//
// Collision check: candidates are probed against the non-unique
// by_order_number index with a bounded retry. This eliminates ordinary
// collisions but is NOT a database-level uniqueness guarantee — two truly
// concurrent mutations could still race between check and insert. The
// 36^8 (~2.8 trillion) suffix space is the primary protection.
// ============================================================================

export const ORDER_NUMBER_PREFIX = "MB";
export const ORDER_NUMBER_RANDOM_LENGTH = 8;
export const ORDER_NUMBER_GENERATION_ATTEMPTS = 5;

/**
 * Build one order-number candidate. The randomSuffix override exists only
 * as a deterministic seam for collision-retry tests; production callers
 * omit it and always receive a crypto-secure suffix.
 */
export function buildOrderNumberCandidate(randomSuffix?: string): string {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random =
    randomSuffix ?? generateSecureBase36String(ORDER_NUMBER_RANDOM_LENGTH);
  return `${ORDER_NUMBER_PREFIX}-${timestamp}${random}`;
}

/**
 * Generate an order number with no live collision. Retries with a fresh
 * crypto suffix on collision; throws safely (no insert) when the bounded
 * attempts are exhausted. Must run inside the caller's mutation so the
 * probe sees current committed state.
 */
export async function generateUniqueOrderNumber(ctx: {
  db: MutationCtx["db"];
}): Promise<string> {
  for (
    let attempt = 0;
    attempt < ORDER_NUMBER_GENERATION_ATTEMPTS;
    attempt++
  ) {
    const candidate = buildOrderNumberCandidate();
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error(
    "Could not generate a unique order number. Please try again."
  );
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
  _id?: string;
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
  /** Server-resolved businessUnitId from the catalogItems record — authoritative. */
  catalogBusinessUnitId: string;
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

  // Validate item type matches catalog (businessUnitId is validated by the
  // caller via the catalogBusinessUnitId return value).
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
    const activeVariants = (source.variants ?? []).filter((v) => v.active);
    const variant = activeVariants.find(
      (v) => v.optionValue === item.variantName,
    );
    if (variant) {
      unitPrice = variant.price;
    } else if (activeVariants.length > 0) {
      // Fail closed (Phase 21D-B): the product HAS active variants but this
      // cart line references one that is not among them (stale or invalid
      // identity). Never price it as a non-variant product — the customer
      // must review the cart instead.
      throw new Error(
        `The selected variant for "${source.name ?? item.itemType}" is no longer available. Please review your cart.`,
      );
    } else {
      // Zero ACTIVE variants: legitimate non-variant product (or every variant
      // is inactive) — use the catalog item's base price.
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
    catalogBusinessUnitId: doc.businessUnitId ?? "",
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
 *
 * Exported for focused unit tests (14D); production callers go through
 * orders.create only.
 */
export async function computeDeliveryFee(
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
    // 14D: server-authoritative minimum order. The client gate is display
    // only; a tampered or stale client must still be rejected here, mirroring
    // the legacy deliveryZones branch below.
    if (policy.minimumOrder && args.afterDiscount < policy.minimumOrder) {
      const remaining =
        Math.round((policy.minimumOrder - args.afterDiscount) * 100) / 100;
      throw new Error(
        `Minimum order for local delivery is ₹${policy.minimumOrder}. Add ₹${remaining} more to your cart.`
      );
    }
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
    destinationPincode: v.optional(v.string()),
    destinationCity: v.optional(v.string()),
    destinationState: v.optional(v.string()),
    offerId: v.optional(v.id("offers")),
    offerCode: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    loyaltyPointsToRedeem: v.optional(v.number()),
    mealDealIds: v.optional(v.array(v.string())),
    mealDealDiscount: v.optional(v.number()),
    customerLatitude: v.optional(v.number()),
    customerLongitude: v.optional(v.number()),
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
    // 0b. Rate limiting — prevent spam order creation per phone number.
    // A guest or authenticated customer may create at most 3 orders
    // per phone within a 10-minute window.
    // ----------------------------------------------------------------------
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentOrdersForPhone = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q: any) => q.eq("customerPhone", customerPhone))
      .filter((q: any) => q.gte(q.field("createdAt"), tenMinutesAgo))
      .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    if (recentOrdersForPhone.length >= 3) {
      throw new Error("Too many orders created recently. Please wait before placing more orders.");
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
    // 1b. Business Unit boundary — reject mixed-BU orders.
    //     Derive the authoritative BU set from the catalogItems database
    //     records (NOT from the client-provided businessUnitId).
    // ----------------------------------------------------------------------
    const resolvedBusinessUnitIds = new Set(
      items.map((item) => item.catalogBusinessUnitId).filter((id) => id.length > 0),
    );

    if (resolvedBusinessUnitIds.size > 1) {
      throw new Error(
        "MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED: This cart contains items from multiple business units. Please checkout each business unit separately.",
      );
    }

    // Validate client-provided businessUnitId matches the resolved catalog BU.
    // The client BU is treated as a consistency hint; the server-derived BU
    // from catalogItems is authoritative.
    let effectiveBusinessUnitId: Id<"businessUnits"> = args.businessUnitId;
    const resolvedBU = items[0]?.catalogBusinessUnitId;
    if (resolvedBU && resolvedBU !== args.businessUnitId) {
      // Client BU doesn't match catalog — use the server-resolved BU.
      // This prevents BU spoofing via reordered cart items.
      effectiveBusinessUnitId = resolvedBU as Id<"businessUnits">;
    }

    // ----------------------------------------------------------------------
    // 2. Coupon discount — validated & recomputed server-side.
    // ----------------------------------------------------------------------
    let couponDiscount = 0;
    let offerId: Id<"offers"> | undefined;
    if (args.offerCode) {
      const coupon = await validateCouponInternal(ctx, {
        code: args.offerCode,
        businessUnitId: effectiveBusinessUnitId,
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

        // The deal must belong to the order's resolved business unit.
        // The client BU is untrusted; effectiveBusinessUnitId is derived
        // server-side from the catalog items above.
        if (dealDoc.businessUnitId !== effectiveBusinessUnitId) {
          throw new Error("Meal deal is not valid for this store");
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
      authUserId: identity?.subject,
    });

    // 10B — LOYALTY AUTHORIZATION BOUNDARY. The phone-resolved customerId
    // above is association only and NEVER authorizes point redemption.
    // Only a pre-existing customer record already linked to the caller's
    // authenticated identity may redeem. Resolved BEFORE ensureCustomerByPhone
    // could attach the caller to a phone-matched record, so a just-attached
    // match can never qualify. Guests (no identity) always resolve null.
    let loyaltyOwnerId: Id<"customers"> | null = null;
    if (identity?.subject) {
      const ownedCustomer = await ctx.db
        .query("customers")
        .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .first();
      if (ownedCustomer) {
        loyaltyOwnerId = ownedCustomer._id;
      }
    }

    const submittedNonCouponDiscount = args.discount - couponDiscount;
    if (submittedNonCouponDiscount < -PRICE_TOLERANCE) {
      throw new Error("Discount is out of date. Please review your cart.");
    }
    const redeemable = loyaltyOwnerId
      ? await getMaxRedeemableInternal(ctx, {
          customerId: loyaltyOwnerId,
          orderTotal: subtotal,
        })
      : { maxPoints: 0, maxValue: 0, reason: "Sign in to redeem loyalty points" };
    const submittedLoyalty = submittedNonCouponDiscount - mealDealDiscount;
    const loyaltyAuth = authorizeLoyaltySpend({
      loyaltyOwnerId,
      submittedLoyaltyValue: submittedLoyalty,
      ownerMaxValue: redeemable.maxValue,
      tolerance: PRICE_TOLERANCE,
    });
    if (loyaltyAuth.error) {
      throw new Error(loyaltyAuth.error);
    }
    // Normalize the stored request so the deferred outside-area finalization
    // (which runs without user identity) can never redeem what was not
    // authorized here. Owners keep their submitted value; others store 0.
    const storedLoyaltyPoints = loyaltyOwnerId ? (args.loyaltyPointsToRedeem ?? 0) : 0;
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
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", effectiveBusinessUnitId))
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

    // Validate destination pincode if provided (6-digit Indian pincode)
    if (args.destinationPincode) {
      const pincode = args.destinationPincode.trim();
      if (!/^\d{6}$/.test(pincode)) {
        throw new Error("Destination pincode must be a valid 6-digit number");
      }
    }

    // Store shipping snapshot for Mart pincode-region orders (set in pincode_region branch)
    let shippingSnapshot: {
      shippingZoneId: Id<"shippingZones">;
      shippingZoneName: string;
      shippingActualWeightGrams: number;
      shippingRateId: Id<"shippingRates">;
      shippingRateName: string;
      shippingCharge: number;
    } | null = null;

    // ----------------------------------------------------------------------
    // 4a. Delivery serviceability — mode-aware dispatch.
    //     coordinate_radius (or undefined/legacy) → Kitchen Haversine check
    //     pincode_region → Mart pincode serviceability check
    //     manual → no server-side serviceability check
    //     Fail closed: if enableDelivery is true but configuration is
    //     incomplete, delivery is NOT accepted.
    // ----------------------------------------------------------------------
    if (args.orderType === "delivery") {
      const bu = await ctx.db.get(effectiveBusinessUnitId);
      if (bu && bu.enableDelivery) {
        // Legacy compatibility: undefined serviceabilityMode defaults to coordinate_radius
        const mode = bu.serviceabilityMode ?? "coordinate_radius";

        if (mode === "coordinate_radius") {
          // Kitchen coordinate-radius delivery check (existing logic)
          const hasOrigin =
            bu.originLatitude !== undefined &&
            bu.originLongitude !== undefined &&
            typeof bu.originLatitude === "number" && Number.isFinite(bu.originLatitude) &&
            typeof bu.originLongitude === "number" && Number.isFinite(bu.originLongitude) &&
            bu.originLatitude >= -90 && bu.originLatitude <= 90 &&
            bu.originLongitude >= -180 && bu.originLongitude <= 180;
          const hasRadius = bu.deliveryRadiusKm !== undefined && typeof bu.deliveryRadiusKm === "number" && bu.deliveryRadiusKm > 0;

          if (!hasOrigin || !hasRadius) {
            throw new Error(`${bu.name} delivery is currently unavailable. Admin has not configured delivery origin or radius.`);
          }

          const originLat = bu.originLatitude as number;
          const originLng = bu.originLongitude as number;
          const radiusKm = bu.deliveryRadiusKm as number;

          const customerLat = args.customerLatitude;
          const customerLng = args.customerLongitude;

          if (customerLat === undefined || customerLng === undefined) {
            throw new Error(`Please provide a delivery location with coordinates for ${bu.name} delivery.`);
          }

          if (typeof customerLat !== "number" || !Number.isFinite(customerLat) || customerLat < -90 || customerLat > 90) {
            throw new Error("Invalid delivery location coordinates.");
          }
          if (typeof customerLng !== "number" || !Number.isFinite(customerLng) || customerLng < -180 || customerLng > 180) {
            throw new Error("Invalid delivery location coordinates.");
          }

          const toRad = (deg: number) => (deg * Math.PI) / 180;
          const EARTH_RADIUS_KM = 6371;
          const dLat = toRad(customerLat - originLat);
          const dLon = toRad(customerLng - originLng);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(originLat)) * Math.cos(toRad(customerLat)) * Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distanceKm = Math.round(EARTH_RADIUS_KM * c * 100) / 100;

          if (distanceKm > radiusKm) {
            throw new Error(`${bu.name} does not deliver to this location (approx. ${distanceKm} km away, delivery radius is ${radiusKm} km).`);
          }
        } else if (mode === "pincode_region") {
          // Mart pincode-based delivery — use canonical shipping calculation
          const pincode = args.destinationPincode?.trim();
          if (!pincode || !/^\d{6}$/.test(pincode)) {
            throw new Error(`A valid 6-digit destination pincode is required for ${bu.name} delivery.`);
          }

          const quote = await resolveMartShippingQuote(ctx, {
            businessUnitId: effectiveBusinessUnitId,
            items: args.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              variantName: item.variantName,
              quantity: item.quantity,
            })),
            destinationPincode: pincode,
          });

          if (!quote.serviceable) {
            throw new Error(quote.error ?? "Delivery is not available for this pincode.");
          }

          // Store shipping data for snapshot (used below in deliveryFee computation)
          shippingSnapshot = {
            shippingZoneId: quote.shippingZoneId!,
            shippingZoneName: quote.shippingZoneName!,
            shippingActualWeightGrams: quote.actualWeightGrams!,
            shippingRateId: quote.shippingRateId!,
            shippingRateName: quote.shippingRateName!,
            shippingCharge: quote.shippingCharge!,
          };
        }
        // mode === "manual" → no server-side serviceability check
      }
    }

    const afterDiscount = Math.max(0, subtotal - discount);

    const deliveryType = args.deliveryType ?? "local";
    const deliveryQuoteRequired = deliveryType === "outside_area";

    // Outside-area orders: delivery fee is 0 until admin quotes.
    // Local/pickup: use existing server-computed fee.
    // Mart pincode-region: use server-computed shipping charge.
    let deliveryFee: number;

    if (shippingSnapshot && args.orderType === "delivery") {
      // Mart pincode-region order: server is the sole authority on shipping charge.
      // Client cannot compute weight/zone/rate, so no equality check is performed.
      deliveryFee = shippingSnapshot.shippingCharge;
    } else if (deliveryQuoteRequired) {
      deliveryFee = 0;
      // Validate client also sent 0
      if (Math.abs(args.deliveryFee) > PRICE_TOLERANCE) {
        throw new Error("Delivery fee must be 0 for outside-area orders before quote");
      }
    } else {
      deliveryFee = await computeDeliveryFee(ctx, {
        businessUnitId: effectiveBusinessUnitId,
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
    const orderNumber = await generateUniqueOrderNumber(ctx);
    const now = Date.now();

    const paymentStatus = "pending" as const;

    // Outside-area orders: no payment yet, quote pending. No NEW_ORDER notification
    // or inventory reservation until customer accepts quote and claims payment.
    const isOutsideArea = deliveryQuoteRequired;
    const orderPaymentStatus = isOutsideArea ? "pending" as const : paymentStatus;
    const deliveryQuoteStatus = isOutsideArea ? "pending" as const : undefined;

    // Outside-area orders defer the REAL inventory reservation to
    // finalizePaidOrder (after payment capture + accepted quote), so validate
    // the inventory configuration here — READ-ONLY — before the order insert
    // and therefore before any Razorpay order/payment boundary exists. A
    // tracked item whose variantName matches no inventory row would otherwise
    // only throw at finalize, i.e. after capture. resolveInventoryReservations
    // performs no writes (queries + optional throw only), so this dry-run can
    // never reserve, mutate, or double-reserve stock; the authoritative
    // reservation stays at finalization. Genuinely untracked items (zero
    // inventory rows) still resolve to [] and are NOT rejected.
    if (isOutsideArea) {
      for (const item of items) {
        await resolveInventoryReservations(ctx, item, {
          failOnVariantMismatch: true,
        });
      }
    }

    const orderId = await ctx.db.insert("orders", {
      businessUnitId: effectiveBusinessUnitId,
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
      destinationPincode: args.destinationPincode?.trim(),
      destinationCity: args.destinationCity?.trim(),
      destinationState: args.destinationState?.trim(),
      deliveryQuoteRequired,
      deliveryQuoteStatus,
      status: "awaiting_payment",
      paymentStatus: orderPaymentStatus,
      paymentMethod: args.paymentMethod,
      offerId,
      offerCode: args.offerCode,
      loyaltyPointsToRedeem: storedLoyaltyPoints,
      idempotencyKey: args.idempotencyKey,
      shippingZoneId: shippingSnapshot?.shippingZoneId,
      shippingZoneName: shippingSnapshot?.shippingZoneName,
      shippingActualWeightGrams: shippingSnapshot?.shippingActualWeightGrams,
      shippingRateId: shippingSnapshot?.shippingRateId,
      shippingRateName: shippingSnapshot?.shippingRateName,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId,
      businessUnitId: effectiveBusinessUnitId,
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

      // Coupon usage — consumed atomically in THIS transaction (10C P2 race
      // fix): limit check and increment share one OCC transaction, so a
      // concurrent order retries against fresh state instead of overshooting.
      // `create` is idempotency-keyed (a retry returns the existing order
      // above), so a retry can never double-count. Failed/cancelled orders
      // never reach this point. If the coupon exhausted between validation
      // and now, creation rolls back — no discounted order proceeds without
      // a real usage slot.
      if (offerId) {
        const consumption = await consumeCouponUsage(ctx, offerId);
        if (!consumption.consumed) {
          throw new Error("This coupon has reached its usage limit");
        }
      }

      // Reserve stock for each item. Done inline in the create transaction so
      // the reservation and order insert are atomic — a failed reservation rolls
      // the whole order back instead of leaving an order with no stock held.
      // Combo/Party Pack lines expand to their components through the same
      // mechanism (bundle row wins when present; see inventory helper).
      // Strict at reserve time: a tracked item whose variantName matches no
      // inventory row must fail closed here, not resolve to "untracked".
      for (const item of items) {
        const expansions = await resolveInventoryReservations(ctx, item, {
          failOnVariantMismatch: true,
        });
        for (const expansion of expansions) {
          const inventory = expansion.inventory;
          const quantity = expansion.quantity;

          if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new Error(`Invalid quantity for "${inventory.variantName}"`);
          }

          const reserved = inventory.reservedStock ?? 0;
          const avail = inventory.stockQuantity - reserved;
          if (avail < quantity) {
            throw new Error(
              `Insufficient stock for "${inventory.variantName}". Available: ${avail}, requested: ${quantity}`,
            );
          }

          const newReserved = reserved + quantity;
          await ctx.db.patch(inventory._id, {
            reservedStock: newReserved,
            available: (inventory.stockQuantity - newReserved) > 0,
            updatedAt: now,
          });

          await logMovement(ctx, {
            inventoryId: inventory._id,
            businessUnitId: inventory.businessUnitId,
            type: "reservation",
            quantity,
            previousStock: inventory.stockQuantity,
            newStock: inventory.stockQuantity,
            orderId,
          });

          await logActivity(ctx, {
            orderId,
            businessUnitId: inventory.businessUnitId,
            action: "inventory_reserved",
            newValue: `${quantity} × ${inventory.variantName}`,
            actor: "system",
            visibleToCustomer: true,
          });
        }
      }

      const businessUnit = await ctx.db.get(effectiveBusinessUnitId);
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
      // 10B: debited from the AUTHORIZED owner only; guests resolve null and
      // can never reach redeemLoyaltyInternal with a positive amount.
      const loyaltyPoints = storedLoyaltyPoints;
      if (loyaltyPoints > 0 && loyaltyOwnerId) {
        await redeemLoyaltyInternal(ctx, {
          customerId: loyaltyOwnerId,
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
        businessUnitId: effectiveBusinessUnitId,
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

    // P2 F-10: kitchen role may only transition orders that belong to its
    // assigned business units. Full admins keep unrestricted access.
    if (admin.role !== "superadmin" && admin.role !== "admin") {
      const allowedBUs = admin.businessUnitIds ?? [];
      if (!allowedBUs.includes(order.businessUnitId)) {
        throw new Error("Insufficient permissions");
      }
    }

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
        const expansions = await resolveInventoryReservations(ctx, item);
        for (const expansion of expansions) {
          await ctx.runMutation(internal.inventory.confirmReservation, {
            inventoryId: expansion.inventory._id,
            quantity: expansion.quantity,
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
        const expansions = await resolveInventoryReservations(ctx, item);
        for (const expansion of expansions) {
          await ctx.runMutation(internal.inventory.restoreStock, {
            inventoryId: expansion.inventory._id,
            quantity: expansion.quantity,
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
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

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
    const { admin } = await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const order = await ctx.db.get(args.id);
    if (!order) throw new Error("Order not found");

    const now = Date.now();

    // Release reserved stock if order hasn't been confirmed yet; if it had
    // been confirmed, restore the deducted stock to on-hand inventory.
    // awaiting_payment orders have reserved stock but NOT deducted on-hand.
    if (order.status !== "cancelled" && order.status !== "refunded") {
      const deducted = order.status === "confirmed";
      for (const item of order.items) {
        const expansions = await resolveInventoryReservations(ctx, item);
        for (const expansion of expansions) {
          await ctx.runMutation(internal.inventory.restoreStock, {
            inventoryId: expansion.inventory._id,
            quantity: expansion.quantity,
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
