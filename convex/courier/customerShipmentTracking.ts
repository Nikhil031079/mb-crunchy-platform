// ============================================================================
// MB CRUNCHY - Customer Shipment Tracking Query
//
// Provides customer-facing shipment tracking information for a given order.
// Uses the existing guest tracking pattern (phone + order number) for
// authorization. Does not expose internal provider details.
//
// Called from: OrderTrackingPage.tsx
// ============================================================================

import { v } from "convex/values";
import { query } from "../_generated/server";
import { normalizeIndianPhone } from "../utils/phone";
import { SHIPMENT_STATUS_LABELS } from "./shipmentStatus";

// ============================================================================
// Customer Shipment Tracking Query
// ============================================================================

/**
 * Get shipment tracking information for a customer's order.
 *
 * Authorization: Guest tracking via phone + order number.
 * The phone number must match the order's customerPhone.
 *
 * Returns shipment data only for Mart delivery orders with shipments.
 * Kitchen/pickup orders return null for shipment (use existing tracking).
 */
export const getShipmentByPhoneAndOrderNumber = query({
  args: {
    phone: v.string(),
    orderNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizeIndianPhone(args.phone);
    const orderNumber = args.orderNumber.trim().toUpperCase();
    if (!phone || !orderNumber) return null;

    // Find the order (same pattern as orders.getByPhoneAndOrderNumber)
    const order = await ctx.db
      .query("orders")
      .withIndex("by_phone", (q) => q.eq("customerPhone", phone))
      .filter((q) =>
        q.and(
          q.eq(q.field("orderNumber"), orderNumber),
          q.eq(q.field("deletedAt"), undefined),
        ),
      )
      .first();

    if (!order) return null;

    // Only return shipment data for delivery orders
    if (order.orderType !== "delivery") {
      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        status: order.status,
        shipment: null,
      };
    }

    // Find shipment for this order
    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();

    if (!shipment) {
      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        status: order.status,
        shipment: null,
      };
    }

    // Get tracking events chronologically
    const trackingEvents = await ctx.db
      .query("trackingEvents")
      .withIndex("by_shipment", (q) =>
        q.eq("shipmentId", shipment._id).gte("eventTimestamp", 0),
      )
      .order("asc")
      .collect();

    // Get business unit name for display
    const bu = await ctx.db.get(order.businessUnitId);

    // Return customer-safe shipment data
    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      shipment: {
        _id: shipment._id,
        status: shipment.shipmentStatus,
        statusLabel: SHIPMENT_STATUS_LABELS[shipment.shipmentStatus],
        courierName: shipment.courierName ?? null,
        awbNumber: shipment.awbNumber ?? null,
        trackingUrl: shipment.trackingUrl ?? null,
        destinationPincode: shipment.destinationPincode ?? null,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        businessUnitName: bu?.name ?? "MB Mart",
      },
      trackingEvents: trackingEvents.map((event) => ({
        _id: event._id,
        status: event.status,
        statusLabel: SHIPMENT_STATUS_LABELS[event.status],
        description: event.description ?? null,
        location: event.location ?? null,
        eventTimestamp: event.eventTimestamp,
        createdAt: event.createdAt,
      })),
    };
  },
});
