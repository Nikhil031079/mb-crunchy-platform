// ============================================================================
// MB CRUNCHY - Shiprocket Webhook Handler
//
// Endpoint: POST /shiprocket/webhook
//
// Shiprocket sends shipment status updates to this URL. We verify the
// webhook signature, normalize the status, and persist tracking events.
//
// Supported events:
//   - Shipment status updates (any status)
//
// Idempotency:
//   - Uses providerShipmentId + status + eventTimestamp for deduplication
//   - Duplicate webhooks return 200 OK without creating duplicate events
//
// Security:
//   - Webhook secret verified BEFORE processing any data
//   - No credentials logged
//   - No raw provider payloads exposed to customers
// ============================================================================

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  loadShiprocketConfig,
  verifyWebhookSignature,
  parseWebhookEvent,
} from "./shiprocketAdapter";
import type { ShipmentStatus } from "./shipmentStatus";
import { isValidShipmentTransition } from "./shipmentStatus";

// ============================================================================
// Webhook Handler
// ============================================================================

export const shiprocketWebhook = httpAction(async (ctx, request) => {
  // --- Step 1: Verify webhook signature BEFORE processing any data ---
  let config;
  try {
    config = loadShiprocketConfig();
  } catch (err) {
    console.error("[shiprocket-webhook] Configuration error:", err instanceof Error ? err.message : String(err));
    return new Response("Webhook configuration error", { status: 500 });
  }

  if (!config.webhookSecret) {
    console.error("[shiprocket-webhook] COURIER_SHIPROCKET_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Shiprocket sends x-api-key; also accept x-shiprocket-signature and
  // authorization for backwards compatibility with other providers.
  const signatureHeader = request.headers.get("x-api-key")
    ?? request.headers.get("x-shiprocket-signature")
    ?? request.headers.get("authorization");
  
  const body = await request.text();
  
  if (!verifyWebhookSignature(config, body, signatureHeader)) {
    console.error("[shiprocket-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // --- Step 2: Parse and validate payload ---
  const parseResult = parseWebhookEvent(body);
  
  if (!parseResult.ok) {
    console.error("[shiprocket-webhook] Payload validation failed:", parseResult.error);
    return new Response("Invalid payload", { status: 400 });
  }

  const { shipmentId: providerShipmentId, status, statusDescription } = parseResult.data;

  // --- Step 3: Identify local shipment using providerShipmentId ---
  if (!providerShipmentId) {
    console.error("[shiprocket-webhook] Missing shipment_id in webhook");
    return new Response("Missing shipment_id", { status: 400 });
  }

  const shipment = await ctx.runQuery(
    internal.courier.shiprocketWebhook.getShipmentByProviderId,
    { providerShipmentId: String(providerShipmentId) }
  );

  if (!shipment) {
    console.error("[shiprocket-webhook] Shipment not found for providerShipmentId:", providerShipmentId);
    return new Response("Shipment not found", { status: 404 });
  }

  // --- Step 4: Check idempotency ---
  // Build a deterministic event ID using providerShipmentId + status + eventTimestamp
  // This prevents duplicate events from concurrent webhook delivery
  const eventTimestamp = Date.now();
  const providerEventId = buildProviderEventId(providerShipmentId, status, eventTimestamp);
  
  const existingEvent = await ctx.runQuery(
    internal.courier.shiprocketWebhook.getTrackingEventByProviderId,
    { providerEventId }
  );

  if (existingEvent) {
    console.log("[shiprocket-webhook] Duplicate webhook ignored for shipment:", shipment._id);
    return new Response("OK", { status: 200 });
  }

  // --- Step 5: Validate status transition ---
  const currentStatus = shipment.shipmentStatus as ShipmentStatus;
  const newStatus = status as ShipmentStatus;

  if (!isValidShipmentTransition(currentStatus, newStatus)) {
    console.error("[shiprocket-webhook] Invalid transition:", currentStatus, "->", newStatus);
    // Return 200 to prevent retries for invalid transitions
    return new Response("OK", { status: 200 });
  }

  // --- Step 6: Persist tracking event and update shipment ---
  await ctx.runMutation(
    internal.courier.shiprocketWebhook.persistTrackingEvent,
    {
      shipmentId: shipment._id,
      orderId: shipment.orderId,
      providerEventId,
      status: newStatus,
      providerStatus: statusDescription,
      eventTimestamp,
      awbNumber: parseResult.data.awb,
      courierName: statusDescription,
    }
  );

  console.log("[shiprocket-webhook] Status updated for shipment:", shipment._id, "->", newStatus);
  return new Response("OK", { status: 200 });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a deterministic provider event ID for idempotency.
 * Uses providerShipmentId + status + timestamp.
 */
function buildProviderEventId(
  providerShipmentId: number,
  status: ShipmentStatus,
  eventTimestamp: number,
): string {
  return `sr-${providerShipmentId}-${status}-${eventTimestamp}`;
}

// ============================================================================
// Internal Queries (for webhook handler)
// ============================================================================

import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Find shipment by provider shipment ID.
 */
export const getShipmentByProviderId = internalQuery({
  args: { providerShipmentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shipments")
      .filter((q) => q.eq(q.field("providerShipmentId"), args.providerShipmentId))
      .first();
  },
});

/**
 * Find tracking event by provider event ID (for idempotency check).
 */
export const getTrackingEventByProviderId = internalQuery({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trackingEvents")
      .withIndex("by_provider_event_id", (q) => q.eq("providerEventId", args.providerEventId))
      .first();
  },
});

/**
 * Persist tracking event and update shipment status.
 */
export const persistTrackingEvent = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    orderId: v.id("orders"),
    providerEventId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("booked"),
      v.literal("shipped"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    providerStatus: v.optional(v.string()),
    eventTimestamp: v.number(),
    awbNumber: v.optional(v.string()),
    courierName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Create tracking event
    await ctx.db.insert("trackingEvents", {
      shipmentId: args.shipmentId,
      orderId: args.orderId,
      providerEventId: args.providerEventId,
      status: args.status,
      providerStatus: args.providerStatus,
      eventTimestamp: args.eventTimestamp,
      createdAt: Date.now(),
    });

    // Update shipment status
    const updateFields: Record<string, unknown> = {
      shipmentStatus: args.status,
      updatedAt: Date.now(),
    };

    // Update AWB if provided and authoritative
    if (args.awbNumber) {
      updateFields.awbNumber = args.awbNumber;
    }

    // Update courier name if provided
    if (args.courierName) {
      updateFields.courierName = args.courierName;
    }

    await ctx.db.patch(args.shipmentId, updateFields);
  },
});