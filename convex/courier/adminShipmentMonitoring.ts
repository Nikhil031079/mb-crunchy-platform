// ============================================================================
// MB CRUNCHY - Admin Shipment Monitoring Query
//
// Provides admin-facing shipment monitoring data with role-based access.
// Uses existing admin authorization patterns.
//
// Called from: admin shipment monitoring page
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireAdminSession, requireAdminRole } from "../utils/adminAuth";
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

// ============================================================================
// Shipments By Order (15B order ↔ shipment cross-links)
// ----------------------------------------------------------------------------
// Session-gated lookup of all shipment records for one order, using the
// existing by_order index. Supports zero, one, or many rows (the UI lists
// them; no single-record assumption). Kitchen scoping matches
// getShipmentsForAdmin. Returns row data + server labels only — no tracking
// events, no provider raw payloads.
// ============================================================================

export const getShipmentsByOrder = query({
  args: {
    sessionToken: v.string(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);

    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();

    const scoped =
      admin.role === "superadmin" || admin.role === "admin"
        ? shipments
        : shipments.filter((s) =>
            (admin.businessUnitIds ?? []).includes(s.businessUnitId),
          );

    return scoped.map((shipment) => ({
      _id: shipment._id,
      orderId: shipment.orderId,
      businessUnitId: shipment.businessUnitId,
      provider: shipment.provider,
      providerShipmentId: shipment.providerShipmentId ?? null,
      shipmentStatus: shipment.shipmentStatus,
      shipmentStatusLabel: SHIPMENT_STATUS_LABELS[shipment.shipmentStatus],
      courierName: shipment.courierName ?? null,
      awbNumber: shipment.awbNumber ?? null,
      trackingUrl: shipment.trackingUrl ?? null,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    }));
  },
});

// ============================================================================
// Manual Shipment Attachment (11A admin console)
// ----------------------------------------------------------------------------
// Lets an authorized admin attach/update AWB, courier name, and tracking URL
// on the EXISTING shipments record for legitimate operational cases (e.g.
// courier booked outside the automated workflow).
//
// Safety rules:
// - superadmin/admin session required (same gate as offers/inventory writes;
//   kitchen staff get read-only monitoring, never writes).
// - Shipment must exist and its linked order must exist; the shipment is
//   resolved server-side from shipmentId — never from client-supplied
//   customer/order identifiers.
// - All inputs validated server-side (AWB charset/length, courier length,
//   http(s) tracking URL, at least one field present).
// - Record-only: never calls Shiprocket, never changes shipment/order
//   status, never touches payment, and never books anything. DRY_RUN is
//   irrelevant here because no provider call is made.
// ============================================================================

const AWB_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,30}[A-Z0-9]$/;
const MAX_COURIER_NAME_LENGTH = 64;
const MAX_TRACKING_URL_LENGTH = 2048;

export function validateAttachShipmentDetails(args: {
  awbNumber?: string;
  courierName?: string;
  trackingUrl?: string;
}): { awbNumber?: string; courierName?: string; trackingUrl?: string } {
  const cleaned: {
    awbNumber?: string;
    courierName?: string;
    trackingUrl?: string;
  } = {};

  if (args.awbNumber !== undefined) {
    const awb = args.awbNumber.trim().toUpperCase();
    if (!AWB_PATTERN.test(awb)) {
      throw new Error(
        "Invalid AWB number: use 4-32 characters of A-Z, 0-9, hyphen or underscore."
      );
    }
    cleaned.awbNumber = awb;
  }

  if (args.courierName !== undefined) {
    const courier = args.courierName.trim();
    if (courier.length < 2 || courier.length > MAX_COURIER_NAME_LENGTH) {
      throw new Error(
        `Invalid courier name: must be 2-${MAX_COURIER_NAME_LENGTH} characters.`
      );
    }
    cleaned.courierName = courier;
  }

  if (args.trackingUrl !== undefined) {
    const url = args.trackingUrl.trim();
    if (url.length === 0 || url.length > MAX_TRACKING_URL_LENGTH) {
      throw new Error("Invalid tracking URL: must be a non-empty http(s) URL.");
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid tracking URL: must be a non-empty http(s) URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid tracking URL: must be a non-empty http(s) URL.");
    }
    cleaned.trackingUrl = url;
  }

  if (
    cleaned.awbNumber === undefined &&
    cleaned.courierName === undefined &&
    cleaned.trackingUrl === undefined
  ) {
    throw new Error("Nothing to update: provide AWB, courier name, or tracking URL.");
  }

  return cleaned;
}

export const attachShipmentDetails = mutation({
  args: {
    sessionToken: v.string(),
    shipmentId: v.id("shipments"),
    awbNumber: v.optional(v.string()),
    courierName: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.deletedAt !== undefined) {
      throw new Error("Shipment not found");
    }

    // The shipment→order link is resolved server-side; a caller cannot
    // re-point this update at an unrelated shipment or order.
    const order = await ctx.db.get(shipment.orderId);
    if (!order || order.deletedAt !== undefined) {
      throw new Error("Linked order not found");
    }

    const cleaned = validateAttachShipmentDetails({
      awbNumber: args.awbNumber,
      courierName: args.courierName,
      trackingUrl: args.trackingUrl,
    });

    await ctx.db.patch(shipment._id, {
      ...cleaned,
      updatedAt: Date.now(),
    });

    return { shipmentId: shipment._id, updated: true as const };
  },
});
