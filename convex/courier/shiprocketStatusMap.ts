// ============================================================================
// MB CRUNCHY - Shiprocket Status Mapping
//
// Maps raw Shiprocket status strings/codes to normalized MB Crunchy
// shipment statuses. Provider-specific strings must never leak beyond
// this module.
//
// IMPORTANT: Exact Shiprocket status codes must be confirmed against
// their API documentation during Phase 34B/34C integration testing.
// The values below are based on publicly documented Shiprocket statuses.
// ============================================================================

import type { ShipmentStatus } from "./shipmentStatus";

/**
 * Known Shiprocket status codes and their normalized equivalents.
 *
 * Shiprocket numeric status codes (from public documentation):
 *   6   = Pending
 *   18  = Shipped
 *   38  = In Transit
 *   39  = Out for Delivery
 *   7   = Delivered
 *   29  = Cancelled
 *   100 = RTO Initiated
 *   114 = RTO Delivered
 *   70  = Failed Attempt
 *
 * Phase 34B/34C must verify these codes against the actual Shiprocket
 * API response during integration testing with a test shipment.
 */
export const SHIPROCKET_STATUS_MAP: Record<string, ShipmentStatus> = {
  // Numeric status codes from Shiprocket API
  "6": "pending",
  "18": "shipped",
  "38": "in_transit",
  "39": "out_for_delivery",
  "7": "delivered",
  "29": "cancelled",
  "100": "failed",
  "114": "failed",
  "70": "failed",

  // String status names (fallback / alternative format)
  pending: "pending",
  processing: "processing",
  booked: "booked",
  shipped: "shipped",
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
  failed: "failed",
};

/**
 * Normalize a raw Shiprocket status string/number to an internal MB Crunchy
 * shipment status. Returns undefined for unknown statuses so the caller
 * can decide whether to ignore or log the event.
 */
export function normalizeShiprocketStatus(
  rawStatus: string | number,
): ShipmentStatus | undefined {
  const key = String(rawStatus).trim();
  return SHIPROCKET_STATUS_MAP[key];
}
