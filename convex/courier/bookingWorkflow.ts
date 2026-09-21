// ============================================================================
// MB CRUNCHY - Shipment Booking Workflow
//
// Handles the server-side workflow for booking a Mart delivery order
// with Shiprocket. Designed for strong idempotency and failure safety.
//
// Workflow:
//   1. Check eligibility (Mart delivery, paid, has shipping data)
//   2. Idempotency check (existing shipment for this order?)
//   3. Create local shipment record (status: pending)
//   4. Create Shiprocket order (status: processing)
//   5. Assign AWB (status: booked)
//
// Called from: finalizePaidOrder (orders.ts)
// ============================================================================

import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  loadShiprocketConfig,
  authenticate,
  createShiprocketOrder,
  assignAwb,
  type ShiprocketConfig,
  type ShiprocketOrderRequest,
} from "./shiprocketAdapter";

// ============================================================================
// Eligibility Check
// ============================================================================

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Determine whether an order is eligible for Shiprocket booking.
 * Only Mart delivery orders with confirmed payment and complete
 * shipping data are eligible.
 *
 * Uses server-authoritative business unit configuration — never
 * trusts browser-submitted flags.
 */
export async function checkEligibility(
  ctx: MutationCtx,
  order: Doc<"orders">,
): Promise<EligibilityResult> {
  if (order.orderType !== "delivery") {
    return { eligible: false, reason: "not_delivery_order" };
  }
  if (order.paymentStatus !== "paid") {
    return { eligible: false, reason: "not_paid" };
  }
  if (order.status === "cancelled" || order.status === "refunded") {
    return { eligible: false, reason: "order_cancelled_or_refunded" };
  }
  if (!order.destinationPincode?.trim()) {
    return { eligible: false, reason: "missing_pincode" };
  }
  if (!order.deliveryAddress?.trim()) {
    return { eligible: false, reason: "missing_address" };
  }

  const bu = await ctx.db.get(order.businessUnitId);
  if (!bu) {
    return { eligible: false, reason: "business_unit_not_found" };
  }
  const mode = bu.serviceabilityMode ?? "coordinate_radius";
  if (mode !== "pincode_region") {
    return { eligible: false, reason: "not_courier_delivery" };
  }

  return { eligible: true };
}

// ============================================================================
// Build Shiprocket Order Request
// ============================================================================

function buildShiprocketOrderRequest(
  order: Doc<"orders">,
  pickupLocation: string,
): ShiprocketOrderRequest {
  const orderDate = new Date(order.createdAt);
  const dateStr = orderDate.toISOString().split("T")[0] ?? orderDate.toISOString();

  return {
    order_id: order.orderNumber,
    order_date: dateStr,
    pickup_location: pickupLocation,
    billing_customer_name: order.customerName,
    billing_address: order.deliveryAddress ?? "",
    billing_city: order.destinationCity ?? "",
    billing_pincode: order.destinationPincode ?? "",
    billing_state: order.destinationState ?? "",
    billing_country: "India",
    billing_phone: order.customerPhone,
    shipping_customer_name: order.customerName,
    shipping_address: order.deliveryAddress ?? "",
    shipping_city: order.destinationCity ?? "",
    shipping_pincode: order.destinationPincode ?? "",
    shipping_state: order.destinationState ?? "",
    shipping_country: "India",
    shipping_phone: order.customerPhone,
    order_items: order.items.map((item) => ({
      name: item.name,
      sku: item.variantName,
      units: item.quantity,
      selling_price: item.unitPrice,
    })),
    payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    sub_total: order.subtotal,
    weight: order.shippingActualWeightGrams
      ? order.shippingActualWeightGrams / 1000
      : undefined,
  };
}

// ============================================================================
// Create Local Shipment Record
// ============================================================================

/**
 * Create or find the local shipment record for an order.
 * Idempotent: returns existing shipment if one already exists.
 */
export async function findOrCreateShipment(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  businessUnitId: Id<"businessUnits">,
  order: Doc<"orders">,
): Promise<Doc<"shipments">> {
  const existing = await ctx.db
    .query("shipments")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .first();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const shipmentId = await ctx.db.insert("shipments", {
    orderId,
    businessUnitId,
    provider: "shiprocket",
    shipmentStatus: "pending",
    shippingAddress: order.deliveryAddress,
    destinationPincode: order.destinationPincode,
    destinationCity: order.destinationCity,
    destinationState: order.destinationState,
    createdAt: now,
    updatedAt: now,
  });

  return (await ctx.db.get(shipmentId))!;
}

// ============================================================================
// Two-Step Shiprocket Booking
// ============================================================================

async function step1CreateOrder(
  ctx: MutationCtx,
  shipment: Doc<"shipments">,
  order: Doc<"orders">,
  config: ShiprocketConfig,
  token: string,
  pickupLocation: string,
): Promise<{ ok: true; providerShipmentId: number } | { ok: false; error: string }> {
  const orderRequest = buildShiprocketOrderRequest(order, pickupLocation);
  const result = await createShiprocketOrder(config, token, orderRequest);

  if (!result.ok) {
    await ctx.db.patch(shipment._id, {
      shipmentStatus: "failed",
      providerMetadata: {
        ...shipment.providerMetadata,
        lastError: result.error,
        lastStep: "create_order",
        failedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    return { ok: false, error: result.error };
  }

  await ctx.db.patch(shipment._id, {
    providerShipmentId: String(result.data.order_id),
    shipmentStatus: "processing",
    providerMetadata: {
      ...shipment.providerMetadata,
      shiprocketOrderId: result.data.order_id,
      shiprocketShipmentId: result.data.shipment_id,
      createdAt: Date.now(),
    },
    updatedAt: Date.now(),
  });

  return { ok: true, providerShipmentId: result.data.shipment_id };
}

async function step2AssignAwb(
  ctx: MutationCtx,
  shipment: Doc<"shipments">,
  config: ShiprocketConfig,
  token: string,
  providerShipmentId: number,
): Promise<{ ok: true; awb: string; courierName: string } | { ok: false; error: string }> {
  const awbResult = await assignAwb(config, token, {
    shipment_id: [providerShipmentId],
    courier_id: 0,
  });

  if (!awbResult.ok) {
    await ctx.db.patch(shipment._id, {
      providerMetadata: {
        ...shipment.providerMetadata,
        lastError: awbResult.error,
        lastStep: "assign_awb",
        awbFailedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    return { ok: false, error: awbResult.error };
  }

  const awbData = awbResult.data.response[0];
  if (!awbData) {
    await ctx.db.patch(shipment._id, {
      shipmentStatus: "failed",
      providerMetadata: {
        ...shipment.providerMetadata,
        lastError: "AWB response empty",
        lastStep: "assign_awb",
        awbFailedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    return { ok: false, error: "AWB response empty" };
  }

  await ctx.db.patch(shipment._id, {
    awbNumber: awbData.awb_code,
    courierName: awbData.courier_name,
    shipmentStatus: "booked",
    providerMetadata: {
      ...shipment.providerMetadata,
      awbCode: awbData.awb_code,
      courierName: awbData.courier_name,
      courierCompanyId: awbData.courier_company_id,
      awbAssignedAt: Date.now(),
    },
    updatedAt: Date.now(),
  });

  return { ok: true, awb: awbData.awb_code, courierName: awbData.courier_name };
}

// ============================================================================
// Main Booking Workflow
// ============================================================================

export interface BookingResult {
  success: boolean;
  shipmentId?: Id<"shipments">;
  awbNumber?: string;
  courierName?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Execute the full shipment booking workflow for a paid Mart order.
 *
 * Idempotency rules:
 * - "booked" → returns immediately (already done)
 * - "processing" → retries Step 2 only (does NOT create new Shiprocket order)
 * - "pending" or "failed" → restarts from Step 1
 * - "delivered"/"cancelled" → terminal, cannot retry
 */
export async function executeBookingWorkflow(
  ctx: MutationCtx,
  orderId: Id<"orders">,
): Promise<BookingResult> {
  const order = await ctx.db.get(orderId);
  if (!order) {
    return { success: false, error: "order_not_found" };
  }

  const eligibility = await checkEligibility(ctx, order);
  if (!eligibility.eligible) {
    return { success: false, skipped: true, skipReason: eligibility.reason };
  }

  let config: ShiprocketConfig;
  try {
    config = loadShiprocketConfig();
  } catch (err) {
    return {
      success: false,
      error: `configuration_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let token: string;
  try {
    const auth = await authenticate(config);
    token = auth.token;
  } catch (err) {
    return {
      success: false,
      error: `authentication_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const shipment = await findOrCreateShipment(ctx, orderId, order.businessUnitId, order);
  const status = shipment.shipmentStatus;

  if (status === "booked") {
    return {
      success: true,
      shipmentId: shipment._id,
      awbNumber: shipment.awbNumber ?? undefined,
      courierName: shipment.courierName ?? undefined,
    };
  }

  if (status === "delivered" || status === "cancelled") {
    return { success: false, error: `shipment_in_terminal_state: ${status}` };
  }

  const pickupLocation = config.dryRun ? "dry-run-primary" : "Primary";

  // Step 1 + Step 2: from pending or failed
  if (status === "pending" || status === "failed") {
    const step1 = await step1CreateOrder(ctx, shipment, order, config, token, pickupLocation);
    if (!step1.ok) {
      return { success: false, error: step1.error };
    }

    const step2 = await step2AssignAwb(ctx, shipment, config, token, step1.providerShipmentId);
    if (!step2.ok) {
      return { success: false, shipmentId: shipment._id, error: step2.error };
    }

    return {
      success: true,
      shipmentId: shipment._id,
      awbNumber: step2.awb,
      courierName: step2.courierName,
    };
  }

  // Step 2 only: processing state (Shiprocket order exists, AWB pending)
  if (status === "processing") {
    const providerShipmentId = shipment.providerMetadata?.shiprocketShipmentId as number | undefined;
    if (!providerShipmentId) {
      return { success: false, error: "missing_provider_shipment_id" };
    }

    const step2 = await step2AssignAwb(ctx, shipment, config, token, providerShipmentId);
    if (!step2.ok) {
      return { success: false, shipmentId: shipment._id, error: step2.error };
    }

    return {
      success: true,
      shipmentId: shipment._id,
      awbNumber: step2.awb,
      courierName: step2.courierName,
    };
  }

  // Any other status — skip
  return { success: false, skipped: true, skipReason: `unexpected_status: ${status}` };
}

// ============================================================================
// Internal Mutation (called from orders.ts via ctx.runMutation)
// ============================================================================

/**
 * Internal mutation wrapper for executeBookingWorkflow.
 * Called from finalizePaidOrder after payment confirmation.
 */
export const executeBookingWorkflowInternal = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await executeBookingWorkflow(ctx, args.orderId);
  },
});
