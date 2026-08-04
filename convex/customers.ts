// ============================================================================
// MB CRUNCHY - Customers Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Helpers (reusable across Convex mutations)
// ============================================================================

export async function ensureCustomerByPhone(
  ctx: MutationCtx,
  args: { name: string; phone: string; email?: string }
): Promise<Id<"customers">> {
  const now = Date.now();
  const phone = args.phone.trim();

  const existing = await ctx.db
    .query("customers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();

  if (existing) {
    const patch: Record<string, unknown> = {
      totalOrders: existing.totalOrders + 1,
      lastOrderAt: now,
      updatedAt: now,
    };
    if (!existing.name && args.name.trim()) {
      patch.name = args.name.trim();
    }
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("customers", {
    name: args.name.trim(),
    email: args.email?.trim() || undefined,
    phone,
    totalOrders: 0,
    totalSpent: 0,
    lastOrderAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

// ============================================================================
// Queries
// ============================================================================

export const getAll = query({
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();

    return docs.map((d) => ({
      _id: d._id,
      _creationTime: d._creationTime,
      name: d.name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      authUserId: d.authUserId ?? "",
      totalOrders: d.totalOrders ?? 0,
      totalSpent: d.totalSpent ?? 0,
      notes: d.notes ?? "",
      status: d.status ?? "active",
      createdAt: d.createdAt ?? 0,
      updatedAt: d.updatedAt ?? 0,
    }));
  },
});

export const getByAuthUserId = query({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

// ============================================================================
// Customer 360
// ============================================================================

const NET_ORDER_STATUSES = ["cancelled", "refunded"];

export const getCustomer360 = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const netOrders = orders.filter(
      (o) => !NET_ORDER_STATUSES.includes(o.status)
    );

    const lifetimeSpend = netOrders.reduce((sum, o) => sum + o.total, 0);
    const averageOrderValue = netOrders.length > 0 ? lifetimeSpend / netOrders.length : 0;

    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    const firstOrderAt = sorted.length > 0 ? sorted[sorted.length - 1].createdAt : undefined;
    const lastOrderAt = sorted.length > 0 ? sorted[0].createdAt : undefined;

    const deliveryCount = orders.filter((o) => o.orderType === "delivery").length;
    const takeawayCount = orders.filter((o) => o.orderType === "pickup").length;

    const businessUnitCounts = new Map<string, number>();
    for (const o of orders) {
      businessUnitCounts.set(o.businessUnitId, (businessUnitCounts.get(o.businessUnitId) ?? 0) + 1);
    }
    const preferredBusinessUnitId = [...businessUnitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const preferredBusinessUnit = preferredBusinessUnitId
      ? await ctx.db.get(preferredBusinessUnitId as Id<"businessUnits">)
      : null;

    const latestOrders = sorted.slice(0, 10).map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      orderType: o.orderType,
      total: o.total,
      itemCount: o.items.length,
      createdAt: o.createdAt,
    }));

    return {
      customer: {
        _id: customer._id,
        name: customer.name ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        authUserId: customer.authUserId ?? "",
        notes: customer.notes ?? "",
        status: customer.status ?? "active",
        createdAt: customer.createdAt ?? 0,
        updatedAt: customer.updatedAt ?? 0,
      },
      totalOrders: orders.length,
      lifetimeSpend,
      averageOrderValue,
      firstOrderAt,
      lastOrderAt,
      deliveryCount,
      takeawayCount,
      preferredBusinessUnitId,
      preferredBusinessUnitName: preferredBusinessUnit?.name ?? null,
      latestOrders,
    };
  },
});

export const getCustomerSummary = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const netOrders = orders.filter(
      (o) => !NET_ORDER_STATUSES.includes(o.status)
    );

    const lifetimeSpend = netOrders.reduce((sum, o) => sum + o.total, 0);
    const lastOrderAt =
      orders.length > 0
        ? orders.reduce((max, o) => Math.max(max, o.createdAt), 0)
        : undefined;

    return {
      _id: customer._id,
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      totalOrders: orders.length,
      lifetimeSpend,
      lastOrderAt,
    };
  },
});

// ============================================================================
// Customer Timeline
// ============================================================================

export const TIMELINE_EVENT_TYPES = [
  "customer_created",
  "order_created",
  "order_completed",
  "order_cancelled",
  "refund",
  "loyalty",
  "referral",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export interface CustomerTimelineEvent {
  type: TimelineEventType;
  timestamp: number;
  title: string;
  description?: string;
  orderId?: Id<"orders">;
  orderNumber?: string;
  businessUnitId?: Id<"businessUnits">;
  amount?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export const getCustomerTimeline = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const events: CustomerTimelineEvent[] = [];

    events.push({
      type: "customer_created",
      timestamp: customer.createdAt ?? customer._creationTime,
      title: "Customer created",
    });

    for (const order of orders) {
      const activities = await ctx.db
        .query("orderActivities")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const orderCreated = activities.find((a) => a.action === "order_created");
      events.push({
        type: "order_created",
        timestamp: orderCreated?.createdAt ?? order.createdAt,
        title: "Order created",
        orderId: order._id,
        orderNumber: order.orderNumber,
        businessUnitId: order.businessUnitId,
        amount: order.total,
      });

      const delivered = activities.find((a) => a.action === "delivered");
      if (delivered) {
        events.push({
          type: "order_completed",
          timestamp: delivered.createdAt,
          title: "Order delivered",
          orderId: order._id,
          orderNumber: order.orderNumber,
          businessUnitId: order.businessUnitId,
        });
      }

      const cancelled = activities.find((a) => a.action === "cancelled");
      if (cancelled) {
        events.push({
          type: "order_cancelled",
          timestamp: cancelled.createdAt,
          title: "Order cancelled",
          orderId: order._id,
          orderNumber: order.orderNumber,
          businessUnitId: order.businessUnitId,
        });
      }

      for (const activity of activities) {
        if (
          activity.action !== "refund_initiated" &&
          activity.action !== "refund_completed"
        ) {
          continue;
        }
        const amount = Number(activity.newValue);
        events.push({
          type: "refund",
          timestamp: activity.createdAt,
          title:
            activity.action === "refund_initiated"
              ? "Refund initiated"
              : "Refund completed",
          orderId: order._id,
          orderNumber: order.orderNumber,
          businessUnitId: order.businessUnitId,
          amount: Number.isFinite(amount) ? amount : undefined,
          metadata: { action: activity.action },
        });
      }
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  },
});

// ============================================================================
// Customer Insights
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function topCountKey<T>(counts: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export function computeCustomerLifecycle(
  orderCount: number,
  lastOrderAt: number | undefined,
  now: number
): "Lead" | "New" | "Active" | "Loyal" | "VIP" | "Dormant" | "Lost" {
  if (orderCount === 0) return "Lead";
  const daysSinceLast = (now - (lastOrderAt ?? 0)) / DAY_MS;
  if (daysSinceLast > 120) return "Lost";
  if (daysSinceLast > 60) return "Dormant";
  if (orderCount >= 15) return "VIP";
  if (orderCount >= 5) return "Loyal";
  if (orderCount >= 2) return "Active";
  return "New";
}

export function computeCustomerHealth(
  orders: Doc<"orders">[],
  now: number
): "Excellent" | "Healthy" | "Needs Attention" | "Dormant" | "Lost" {
  if (orders.length === 0) return "Dormant";
  const lastOrderAt = Math.max(...orders.map((o) => o.createdAt));
  const daysSinceLast = (now - lastOrderAt) / DAY_MS;
  if (daysSinceLast > 120) return "Lost";
  if (daysSinceLast > 60) return "Dormant";

  const cancelledCount = orders.filter((o) => o.status === "cancelled").length;
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const cancellationRate = cancelledCount / orders.length;

  if (cancellationRate >= 0.5) return "Needs Attention";
  if (deliveredCount >= 5 && daysSinceLast <= 30) return "Excellent";
  if (deliveredCount >= 2) return "Healthy";
  return "Needs Attention";
}

function computePurchaseMetrics(netOrders: Doc<"orders">[]) {
  const values = netOrders.map((o) => o.total);
  const count = values.length;
  const lifetimeSpend = values.reduce((sum, value) => sum + value, 0);
  return {
    highestOrderValue: count > 0 ? Math.max(...values) : 0,
    lowestOrderValue: count > 0 ? Math.min(...values) : 0,
    averageOrderValue: count > 0 ? lifetimeSpend / count : 0,
    lifetimeSpend,
  };
}

function computeOrderingActivity(orders: Doc<"orders">[]) {
  if (orders.length === 0) {
    return {
      averageDaysBetweenOrders: null,
      favouriteOrderingHour: null,
      favouriteOrderingDay: null,
    };
  }

  const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
  let gapSum = 0;
  for (let i = 1; i < sorted.length; i++) {
    gapSum += sorted[i].createdAt - sorted[i - 1].createdAt;
  }
  const averageDays =
    sorted.length > 1 ? gapSum / (sorted.length - 1) / DAY_MS : null;

  const hourCounts = new Map<number, number>();
  const dayCounts = new Map<number, number>();
  for (const order of sorted) {
    const date = new Date(order.createdAt);
    const hour = date.getHours();
    const weekday = date.getDay();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    dayCounts.set(weekday, (dayCounts.get(weekday) ?? 0) + 1);
  }

  const favouriteHour = topCountKey(hourCounts);
  const favouriteDay = topCountKey(dayCounts);

  return {
    averageDaysBetweenOrders:
      averageDays === null ? null : Number(averageDays.toFixed(1)),
    favouriteOrderingHour:
      favouriteHour === undefined
        ? null
        : { hour: favouriteHour, count: hourCounts.get(favouriteHour) ?? 0 },
    favouriteOrderingDay:
      favouriteDay === undefined
        ? null
        : {
            weekday: favouriteDay,
            name: WEEKDAYS[favouriteDay],
            count: dayCounts.get(favouriteDay) ?? 0,
          },
  };
}

export const getCustomerInsights = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const now = Date.now();
    const netOrders = orders.filter(
      (o) => !NET_ORDER_STATUSES.includes(o.status)
    );

    const productCounts = new Map<string, { name: string; count: number }>();
    const categoryCounts = new Map<string, { name: string; count: number }>();
    const businessUnitCounts = new Map<string, number>();

    for (const order of netOrders) {
      businessUnitCounts.set(
        order.businessUnitId,
        (businessUnitCounts.get(order.businessUnitId) ?? 0) + 1
      );

      for (const item of order.items) {
        const productKey = item.catalogItemId;
        const productCurrent = productCounts.get(productKey) ?? {
          name: item.name,
          count: 0,
        };
        productCurrent.name = item.name;
        productCurrent.count += item.quantity;
        productCounts.set(productKey, productCurrent);

        const catalogItem = await ctx.db.get(item.catalogItemId);
        if (catalogItem?.itemType === "product") {
          const product = await ctx.db.get(catalogItem.sourceId as Id<"products">);
          if (product?.categoryId) {
            const category = await ctx.db.get(product.categoryId);
            const categoryCurrent = categoryCounts.get(product.categoryId) ?? {
              name: category?.name ?? "Unknown",
              count: 0,
            };
            categoryCurrent.name = category?.name ?? categoryCurrent.name;
            categoryCurrent.count += item.quantity;
            categoryCounts.set(product.categoryId, categoryCurrent);
          }
        }
      }
    }

    const favouriteProductEntry = [...productCounts.entries()].sort(
      (a, b) => b[1].count - a[1].count
    )[0];
    const favouriteCategoryEntry = [...categoryCounts.entries()].sort(
      (a, b) => b[1].count - a[1].count
    )[0];
    const favouriteUnitEntry = [...businessUnitCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];

    const favouriteBusinessUnit = favouriteUnitEntry
      ? await ctx.db.get(favouriteUnitEntry[0] as Id<"businessUnits">)
      : null;

    const deliveryCount = netOrders.filter(
      (o) => o.orderType === "delivery"
    ).length;
    const takeawayCount = netOrders.filter(
      (o) => o.orderType === "pickup"
    ).length;
    const preferredOrderType =
      deliveryCount === takeawayCount
        ? null
        : deliveryCount > takeawayCount
          ? "delivery"
          : "pickup";

    const lastOrderAt =
      orders.length > 0
        ? Math.max(...orders.map((o) => o.createdAt))
        : undefined;

    return {
      ordering: {
        favouriteProduct: favouriteProductEntry
          ? {
              catalogItemId: favouriteProductEntry[0],
              name: favouriteProductEntry[1].name,
              count: favouriteProductEntry[1].count,
            }
          : null,
        favouriteCategory: favouriteCategoryEntry
          ? {
              categoryId: favouriteCategoryEntry[0],
              name: favouriteCategoryEntry[1].name,
              count: favouriteCategoryEntry[1].count,
            }
          : null,
        favouriteBusinessUnit: favouriteUnitEntry
          ? {
              businessUnitId: favouriteUnitEntry[0],
              name: favouriteBusinessUnit?.name ?? null,
              count: favouriteUnitEntry[1],
            }
          : null,
        preferredOrderType,
        deliveryCount,
        takeawayCount,
      },
      purchase: computePurchaseMetrics(netOrders),
      activity: computeOrderingActivity(orders),
      lifecycle: computeCustomerLifecycle(orders.length, lastOrderAt, now),
      health: computeCustomerHealth(orders, now),
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    authUserId: v.optional(v.string()),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("customers", {
      ...args,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    id: v.id("customers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
  },
  handler: async (ctx, args) => {
    const { sessionToken: _, id, ...fields } = args;

    if (args.sessionToken) {
      await requireAdminSession(ctx, args.sessionToken);
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Authentication required");

      const customer = await ctx.db.get(id);
      if (!customer) throw new Error("Customer not found");
      if (customer.authUserId !== identity.subject) throw new Error("Unauthorized");
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const getByAuthUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!customer) throw new Error("Customer not found");

    const { name, email, phone } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email;
    if (phone !== undefined) patch.phone = phone;

    await ctx.db.patch(customer._id, patch);
    return customer._id;
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});
