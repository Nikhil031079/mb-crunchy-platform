import type { Order } from "@/types";

// ============================================================================
// Financial definitions — single source of truth for revenue math.
//
//   Orders            = every order in the window
//   Paid Revenue      = paymentStatus === "paid" only
//   Pending Revenue   = paymentStatus === "pending_verification"
//                       (never cancelled/refunded orders)
//   Cancelled         = cancelled orders
//   Refunded          = refunded orders
//   Net Revenue       = Paid Revenue − Refunded amount
//
// Revenue NEVER includes unpaid money. Cancelled and refunded orders are
// reported in their own buckets and never added to paid or pending revenue.
// ============================================================================

export type RevenueOrder = Pick<Order, "total" | "status" | "paymentStatus">;

export function isPaid(o: RevenueOrder): boolean {
  return o.paymentStatus === "paid";
}

export function isPendingRevenue(o: RevenueOrder): boolean {
  return (
    o.paymentStatus === "pending_verification" &&
    o.status !== "cancelled" &&
    o.status !== "refunded"
  );
}

export interface RevenueMetrics {
  totalOrders: number;
  paidRevenue: number;
  paidOrderCount: number;
  pendingRevenue: number;
  pendingOrderCount: number;
  cancelledOrders: number;
  cancelledAmount: number;
  refundedOrders: number;
  refundedAmount: number;
  netRevenue: number;
}

export function computeRevenueMetrics(orders: RevenueOrder[]): RevenueMetrics {
  let totalOrders = 0;
  let paidRevenue = 0;
  let paidOrderCount = 0;
  let pendingRevenue = 0;
  let pendingOrderCount = 0;
  let cancelledOrders = 0;
  let cancelledAmount = 0;
  let refundedOrders = 0;
  let refundedAmount = 0;

  for (const o of orders) {
    totalOrders += 1;

    if (o.status === "cancelled") {
      cancelledOrders += 1;
      cancelledAmount += o.total;
      continue;
    }

    if (o.status === "refunded") {
      refundedOrders += 1;
      refundedAmount += o.total;
      continue;
    }

    if (isPaid(o)) {
      paidRevenue += o.total;
      paidOrderCount += 1;
    } else if (isPendingRevenue(o)) {
      pendingRevenue += o.total;
      pendingOrderCount += 1;
    }
  }

  return {
    totalOrders,
    paidRevenue,
    paidOrderCount,
    pendingRevenue,
    pendingOrderCount,
    cancelledOrders,
    cancelledAmount,
    refundedOrders,
    refundedAmount,
    netRevenue: paidRevenue - refundedAmount,
  };
}
