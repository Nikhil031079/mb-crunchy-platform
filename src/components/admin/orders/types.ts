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
  deliveryType?: "local" | "outside_area";
  deliveryAddress?: string;
  deliveryNotes?: string;
  deliveryQuoteRequired?: boolean;
  deliveryQuoteStatus?: "pending" | "quoted" | "accepted" | "rejected";
  deliveryQuoteAmount?: number;
  deliveryQuoteNotes?: string;
  deliveryQuoteUpdatedAt?: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  paymentReference?: string;
  offerCode?: string;
  createdAt: number;
  updatedAt: number;
  terminalAt?: number;
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

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "delivered",
  "cancelled",
  "refunded",
]);

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

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

// ---------------------------------------------------------------------------
// Delivery type helpers
// ---------------------------------------------------------------------------

export type DeliveryQuoteStatus = "pending" | "quoted" | "accepted" | "rejected";

export const DELIVERY_TYPE_LABELS: Record<string, string> = {
  local: "Local Delivery",
  outside_area: "Outside Area",
};

export const DELIVERY_QUOTE_STATUS_LABELS: Record<DeliveryQuoteStatus, string> = {
  pending: "Quote Required",
  quoted: "Quote Sent",
  accepted: "Quote Accepted",
  rejected: "Quote Declined",
};

export const DELIVERY_QUOTE_STATUS_COLORS: Record<DeliveryQuoteStatus, string> = {
  pending: "border-amber-200 bg-amber-500/10 text-amber-700",
  quoted: "border-blue-200 bg-blue-500/10 text-blue-700",
  accepted: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
  rejected: "border-red-200 bg-red-500/10 text-red-700",
};
