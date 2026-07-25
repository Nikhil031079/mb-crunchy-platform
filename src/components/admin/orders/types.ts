import type { Order, OrderItem, OrderStatus, PaymentStatus, OrderType } from "@/types";

export type { OrderStatus, PaymentStatus, OrderType };

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
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
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
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
  businessUnitId: string | "all";
  orderType: OrderType | "all";
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

export function getNextStatus(current: OrderStatus): OrderStatus | null {
  const transitions = STATUS_TRANSITIONS[current];
  // Filter out cancel - that's a separate action
  const forward = transitions.filter((s) => s !== "cancelled" && s !== "refunded");
  return forward[0] ?? null;
}

export function canCancel(order: OrderRecord): boolean {
  return STATUS_TRANSITIONS[order.status].includes("cancelled");
}
