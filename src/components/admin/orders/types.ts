import type { OrderItem, OrderStatus, PaymentStatus, OrderType } from "@/types";

export type { OrderStatus, PaymentStatus, OrderType };

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["pending", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

// Mirrors the server workflow (convex/orderWorkflow.ts): pickup orders complete
// at the Ready node (Ready → Delivered) because there is no delivery leg.
export function getAllowedTransitions(
  status: OrderStatus,
  orderType?: OrderType,
): OrderStatus[] {
  if (orderType === "pickup" && status === "ready") {
    return ["delivered", "cancelled"];
  }
  return STATUS_TRANSITIONS[status];
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting Payment",
  pending: "Pending",
  confirmed: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  pending_verification: "Pending Verification",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  rejected: "Rejected",
};

// ---------------------------------------------------------------------------
// Enriched order record for admin table
// ---------------------------------------------------------------------------

export interface OrderRecord {
  id: string;
  orderNumber: string;
  businessUnitId: string;
  businessUnitName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  orderType: OrderType;
  deliveryAddress?: string;
  deliveryNotes?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  paymentReference?: string;
  offerCode?: string;
  createdAt: number;
  updatedAt: number;
  elapsedMinutes: number;
}

// ---------------------------------------------------------------------------
// Filters & sorting
// ---------------------------------------------------------------------------

export type OrderSortKey =
  | "orderNumber"
  | "customerName"
  | "total"
  | "status"
  | "orderType"
  | "itemCount"
  | "createdAt";

export type SortDirection = "asc" | "desc";

export interface OrderFilters {
  query: string;
  status: OrderStatus | "all";
  paymentStatus: PaymentStatus | "all";
  businessUnitId: string | "all";
  orderType: OrderType | "all";
  dateRange: { from: string; to: string } | null;
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export interface OrderSummary {
  totalOrders: number;
  pendingCount: number;
  inProgressCount: number;
  outForDeliveryCount: number;
  deliveredCount: number;
  cancelledCount: number;
  todayRevenue: number;
  averageOrderValue: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getNextStatus(current: OrderStatus, orderType?: OrderType): OrderStatus | null {
  const transitions = getAllowedTransitions(current, orderType);
  // Filter out cancel - that's a separate action
  const forward = transitions.filter((s) => s !== "cancelled" && s !== "refunded");
  return forward[0] ?? null;
}

export function canCancel(order: OrderRecord): boolean {
  return getAllowedTransitions(order.status, order.orderType).includes("cancelled");
}

// A failed/rejected verification can be re-opened while the order is still
// alive (never after it is collected, cancelled, or refunded).
export function canReopenPaymentVerification(order: OrderRecord): boolean {
  return (
    (order.paymentStatus === "failed" || order.paymentStatus === "rejected") &&
    order.status !== "cancelled" &&
    order.status !== "refunded" &&
    order.status !== "delivered"
  );
}

export function canBulkRefund(order: OrderRecord): boolean {
  return order.status === "delivered" && order.paymentStatus === "paid";
}
