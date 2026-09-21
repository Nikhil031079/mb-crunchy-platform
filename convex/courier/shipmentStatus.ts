// ============================================================================
// MB CRUNCHY - Shipment Status Model (Normalized)
//
// Defines the internal MB Crunchy shipment status vocabulary and the
// mapping layer from provider-specific status strings (e.g. Shiprocket)
// to normalized internal statuses.
//
// Provider-specific strings must never leak outside this module.
// ============================================================================

// ============================================================================
// Internal Shipment Status (canonical)
// ============================================================================

export const SHIPMENT_STATUSES = [
  "pending",
  "processing",
  "booked",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "failed",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  booked: "Booked",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return status === "delivered" || status === "cancelled" || status === "failed";
}

// ============================================================================
// Allowed status transitions
// ============================================================================

export const SHIPMENT_STATUS_TRANSITIONS: Record<
  ShipmentStatus,
  readonly ShipmentStatus[]
> = {
  pending: ["processing", "cancelled", "failed"],
  processing: ["booked", "cancelled", "failed"],
  booked: ["shipped", "cancelled", "failed"],
  shipped: ["in_transit", "cancelled"],
  in_transit: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  failed: [],
};

export function isValidShipmentTransition(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return SHIPMENT_STATUS_TRANSITIONS[from].includes(to);
}
