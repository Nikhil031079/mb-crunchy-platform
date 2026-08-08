// ============================================================================
// MB CRUNCHY - Order Status Workflow (single source of truth)
// Shared by orders.updateStatus and orderBulk bulk operations so the backend
// keeps one authoritative definition of allowed transitions. Delivery orders
// follow Pending → Confirmed → Preparing → Ready → Out for Delivery →
// Delivered; pickup orders complete at the Ready node (Ready → Delivered)
// because there is no courier leg for collection.
// ============================================================================

import type { Doc } from "./_generated/dataModel";

export type OrderStatus = Doc<"orders">["status"];
export type OrderType = Doc<"orders">["orderType"];

export const ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  awaiting_payment: ["pending", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "awaiting_payment",
  "pending",
  "confirmed",
  "preparing",
  "ready",
];

// The only workflow branch is the order type: a pickup order must be able to
// move from ready straight to delivered without an out_for_delivery leg.
export function getAllowedTransitions(
  status: OrderStatus,
  orderType: OrderType,
): readonly OrderStatus[] {
  if (orderType === "pickup" && status === "ready") {
    return ["delivered", "cancelled"];
  }
  return ORDER_STATUS_TRANSITIONS[status];
}
