// ============================================================================
// MB CRUNCHY - Admin Shipment Monitoring Query
//
// Provides admin-facing shipment monitoring data with role-based access.
// Uses existing admin authorization patterns.
//
// Called from: admin shipment monitoring page
// ============================================================================

import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdminSession } from "../utils/adminAuth";
import { SHIPMENT_STATUS_LABELS } from "./shipmentStatus";

// ============================================================================
// Admin Shipment Monitoring Query
// ============================================================================

/**
 * Get all shipments for admin monitoring.
 *
 * Authorization: Admin session required.
 * - superadmin/admin: can see all shipments
 * - kitchen: can only see shipments for their business units
 *
 * Returns shipment data with order and tracking event details.
 */
export const getShipmentsForAdmin = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    // Build query — use filter() for all conditions since QueryInitializer
    // and Query are incompatible types in Convex's type system.
    const shipments = await ctx.db
      .query("shipments")
      .filter((q) => {
        if (args.businessUnitId) {
          return q.eq(q.field("businessUnitId"), args.businessUnitId as any);
        }
        return true;
      })
      .filter((q) => {
        if (args.status) {
          return q.eq(q.field("shipmentStatus"), args.status as any);
        }
        return true;
      })
      .collect();

    // Filter by business unit for kitchen staff
    let filteredShipments = shipments;
    if (admin.role !== "superadmin" && admin.role !== "admin" && !args.businessUnitId) {
      const allowedBUs = admin.businessUnitIds ?? [];
      filteredShipments = shipments.filter((s) =>
        allowedBUs.includes(s.businessUnitId),
      );
    }

    // Limit results
    const limitedShipments = filteredShipments.slice(0, args.limit ?? 50);

    // Enrich with order and tracking data
    const enrichedShipments = await Promise.all(
      limitedShipments.map(async (shipment) => {
        const order = await ctx.db.get(shipment.orderId);
        const bu = await ctx.db.get(shipment.businessUnitId);

        // Get latest tracking event
        const latestEvent = await ctx.db
          .query("trackingEvents")
          .withIndex("by_shipment", (q) =>
            q.eq("shipmentId", shipment._id),
          )
          .order("desc")
          .first();

        // Get all tracking events for this shipment
        const trackingEvents = await ctx.db
          .query("trackingEvents")
          .withIndex("by_shipment", (q) =>
            q.eq("shipmentId", shipment._id),
          )
          .order("asc")
          .collect();

        return {
          _id: shipment._id,
          orderId: shipment.orderId,
          orderNumber: order?.orderNumber ?? "Unknown",
          businessUnitId: shipment.businessUnitId,
          businessUnitName: bu?.name ?? "Unknown",
          provider: shipment.provider,
          providerShipmentId: shipment.providerShipmentId ?? null,
          shipmentStatus: shipment.shipmentStatus,
          shipmentStatusLabel: SHIPMENT_STATUS_LABELS[shipment.shipmentStatus],
          courierName: shipment.courierName ?? null,
          awbNumber: shipment.awbNumber ?? null,
          trackingUrl: shipment.trackingUrl ?? null,
          destinationPincode: shipment.destinationPincode ?? null,
          destinationCity: shipment.destinationCity ?? null,
          createdAt: shipment.createdAt,
          updatedAt: shipment.updatedAt,
          latestEvent: latestEvent
            ? {
                status: latestEvent.status,
                statusLabel: SHIPMENT_STATUS_LABELS[latestEvent.status],
                description: latestEvent.description ?? null,
                eventTimestamp: latestEvent.eventTimestamp,
              }
            : null,
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
      }),
    );

    return enrichedShipments;
  },
});
