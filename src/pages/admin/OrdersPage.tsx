import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, RefreshCw, ShoppingCart, LayoutGrid, Table2, Clock } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";

import { OrderDetailDialog } from "@/components/admin/orders/OrderDetailDialog";
import { OrderTable } from "@/components/admin/orders/OrderTable";
import { OrderToolbar } from "@/components/admin/orders/OrderToolbar";
import { StatusUpdateDialog } from "@/components/admin/orders/StatusUpdateDialog";
import { BulkOperationsBar } from "@/components/admin/orders/BulkOperationsBar";
import { BulkStatusUpdateDialog } from "@/components/admin/orders/BulkStatusUpdateDialog";
import { BulkCancelDialog } from "@/components/admin/orders/BulkCancelDialog";
import { BulkRefundDialog } from "@/components/admin/orders/BulkRefundDialog";
import type { OrderFilters, OrderRecord, OrderSortKey, OrderStatus, PaymentStatus, SortDirection } from "@/components/admin/orders/types";
import { getNextStatus, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/components/admin/orders/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES, STATUS_COLORS } from "@/constants";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/utils";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: OrderFilters = {
  query: "",
  status: "all",
  paymentStatus: "all",
  businessUnitId: "all",
  orderType: "all",
  dateRange: null,
};

const toOrderId = (id: string) => id as unknown as Id<"orders">;

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function enrichOrder(doc: any, buMap: Map<string, string>): OrderRecord {
  const itemCount = doc.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) ?? 0;
  return {
    id: doc._id,
    orderNumber: doc.orderNumber,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    customerEmail: doc.customerEmail,
    items: doc.items ?? [],
    itemCount,
    subtotal: doc.subtotal,
    discount: doc.discount,
    deliveryFee: doc.deliveryFee,
    tax: doc.tax,
    total: doc.total,
    orderType: doc.orderType,
    deliveryAddress: doc.deliveryAddress,
    deliveryNotes: doc.deliveryNotes,
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    paymentMethod: doc.paymentMethod,
    paymentReference: doc.paymentReference,
    offerCode: doc.offerCode,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    elapsedMinutes: Math.floor((Date.now() - doc.createdAt) / 60_000),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Dashboard summary card
// ---------------------------------------------------------------------------

function SummaryCard({ title, value, icon: Icon, className }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("size-4 text-muted-foreground", className)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared live clock (single interval for the whole kitchen view)
// ---------------------------------------------------------------------------

function useLiveClock(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

function formatElapsed(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

// ---------------------------------------------------------------------------
// Kitchen view
// ---------------------------------------------------------------------------

const KITCHEN_GROUPS: { key: "pending" | "preparing" | "ready"; label: string; borderColor: string; statuses: OrderStatus[] }[] = [
  { key: "pending", label: "New Orders", borderColor: "border-l-blue-500", statuses: ["pending", "confirmed"] },
  { key: "preparing", label: "Preparing", borderColor: "border-l-amber-500", statuses: ["preparing"] },
  { key: "ready", label: "Ready", borderColor: "border-l-emerald-500", statuses: ["ready"] },
];

// Priority weights (minutes-equivalent). Tune here to adjust the queue.
const KITCHEN_PRIORITY = {
  deliveryBonus: 3, // delivery orders edge ahead of takeaway at similar wait times
  confirmedBoost: 1, // confirmed slightly ahead of pending within New Orders
  preparingBoost: 2, // preparing orders stay ahead once work has started
};

function kitchenPriorityScore(order: OrderRecord, now: number): number {
  const elapsed = Math.max(0, Math.floor((now - order.createdAt) / 60_000));
  let score = elapsed;
  if (order.orderType === "delivery") score += KITCHEN_PRIORITY.deliveryBonus;
  if (order.status === "confirmed") score += KITCHEN_PRIORITY.confirmedBoost;
  if (order.status === "preparing") score += KITCHEN_PRIORITY.preparingBoost;
  return score;
}

// Primary action for each kitchen status. All targets reuse existing statuses.
const KITCHEN_ACTIONS: Partial<Record<OrderStatus, { label: string; target: OrderStatus; className: string }>> = {
  pending: { label: "Accept Order", target: "confirmed", className: "bg-blue-600 text-white hover:bg-blue-700" },
  confirmed: { label: "Start Preparing", target: "preparing", className: "bg-primary text-primary-foreground hover:bg-primary/90" },
  preparing: { label: "Mark Ready", target: "ready", className: "bg-emerald-600 text-white hover:bg-emerald-700" },
  ready: { label: "Dispatch", target: "out_for_delivery", className: "bg-emerald-700 text-white hover:bg-emerald-800" },
};

// Pickup orders complete at the Ready node (Ready → Delivered) because there is
// no delivery leg; only the action/label branch on order type.
function kitchenActionFor(order: OrderRecord): { label: string; target: OrderStatus; className: string } | null {
  const base = KITCHEN_ACTIONS[order.status];
  if (!base) return null;
  if (order.status === "ready" && order.orderType === "pickup") {
    return { label: "Mark Collected", target: "delivered", className: base.className };
  }
  return base;
}

function kitchenStatusLabel(order: OrderRecord): string {
  if (order.status === "ready") {
    return order.orderType === "pickup" ? "Ready for Pickup" : "Ready for Delivery";
  }
  return STATUS_LABELS[order.status];
}

function KitchenView({ orders, onOpenOrder, onAdvanceStatus, pendingOrderId }: { orders: OrderRecord[]; onOpenOrder: (order: OrderRecord) => void; onAdvanceStatus: (order: OrderRecord, target: OrderStatus) => void; pendingOrderId: string | null }) {
  const now = useLiveClock();
  const hasActive = orders.some((r) => ["pending", "confirmed", "preparing", "ready"].includes(r.status));

  const groupedOrders = useMemo(() => {
    const scored = orders
      .map((order) => ({ order, score: kitchenPriorityScore(order, now) }))
      .sort((a, b) => b.score - a.score);
    return KITCHEN_GROUPS.map((group) => ({
      ...group,
      orders: scored.filter((s) => group.statuses.includes(s.order.status)).map((s) => s.order),
    }));
  }, [orders, now]);

  return (
    <section className="space-y-6" aria-label="Kitchen view">
      {groupedOrders.map((group) => {
        const groupOrders = group.orders;
        if (groupOrders.length === 0) return null;
        return (
          <div key={group.key}>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{group.label} ({groupOrders.length})</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {groupOrders.map((order) => {
                const elapsedMinutes = Math.max(0, Math.floor((now - order.createdAt) / 60_000));
                const priority = elapsedMinutes >= 21 ? "critical" : elapsedMinutes >= 11 ? "warning" : "normal";
                const ring = priority === "critical"
                  ? "ring-2 ring-red-200 dark:ring-red-800"
                  : priority === "warning"
                    ? "ring-2 ring-amber-200 dark:ring-amber-800"
                    : "";
                const elapsedColor = priority === "critical" ? "text-red-600" : priority === "warning" ? "text-amber-600" : "text-muted-foreground";
                const awaitingPayment = order.status === "confirmed" && order.paymentStatus !== "paid";
                const action = awaitingPayment ? null : kitchenActionFor(order);
                return (
                  <div
                    key={order.id}
                    className={`rounded-xl border-l-4 bg-card p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${group.borderColor} ${ring}`}
                    onClick={() => onOpenOrder(order)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-semibold">{order.orderNumber}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${elapsedColor}`}>
                        <Clock className="size-3" />
                        {formatElapsed(elapsedMinutes)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[order.status])}>
                        {kitchenStatusLabel(order)}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", order.orderType === "delivery" ? "border-purple-200 bg-purple-500/10 text-purple-700" : "border-sky-200 bg-sky-500/10 text-sky-700")}>
                        {order.orderType === "delivery" ? "Delivery" : "Takeaway"}
                      </Badge>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{order.businessUnitName}</span>
                      <span className="text-muted-foreground">{order.itemCount} item{order.itemCount === 1 ? "" : "s"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{order.customerName}</p>
                    <div className="space-y-1">
                      {order.items.slice(0, 3).map((item, i) => (
                        <p key={i} className="text-xs">
                          <span className="font-medium">{item.quantity}×</span> {item.name}
                        </p>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} more</p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">₹{order.total.toLocaleString()}</span>
                      {awaitingPayment ? (
                        <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          <Clock className="size-3" />
                          Awaiting payment
                        </span>
                      ) : action ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onAdvanceStatus(order, action.target); }}
                          disabled={pendingOrderId === order.id}
                          className={cn("rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60", action.className)}
                        >
                          {pendingOrderId === order.id ? "Updating…" : action.label}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!hasActive && (
        <EmptyState icon={ShoppingCart} title="No active orders" description="All caught up! New orders will appear here." />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const navigate = useNavigate();
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const allOrders = useQuery(api.orders.getAll, token ? { sessionToken: token } : "skip");
  const allBUs = useQuery(api.businessUnits.getAll);
  const updateStatus = useMutation(api.orders.updateStatus);
  const reopenPaymentVerification = useMutation(api.orders.reopenPaymentVerification);
  const bulkUpdateStatus = useMutation(api.orderBulk.bulkUpdateStatus);
  const bulkCancel = useMutation(api.orderBulk.bulkCancel);
  const bulkRefund = useMutation(api.orderBulk.bulkRefund);

  const isLoading = allOrders === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<OrderSortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const [detailTarget, setDetailTarget] = useState<OrderRecord | null>(null);
  const [statusTarget, setStatusTarget] = useState<OrderRecord | null>(null);
  const [statusGoal, setStatusGoal] = useState<OrderStatus | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "kitchen">("table");
  const [kitchenPendingId, setKitchenPendingId] = useState<string | null>(null);

  // --- Bulk selection ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<"status" | "cancel" | "refund" | null>(null);
  const [isBulkPending, setIsBulkPending] = useState(false);

  // --- Maps ---
  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const buOptions = useMemo(() => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })), [allBUs]);

  // --- Enriched records ---
  const records = useMemo(
    () => (allOrders ?? []).map((doc) => enrichOrder(doc, buMap)),
    [allOrders, buMap],
  );

  // --- Summary ---
  const summary = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let totalOrders = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let outForDeliveryCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let todayRevenue = 0;
    let todayPendingRevenue = 0;
    let deliveredTotal = 0;

    for (const r of records) {
      totalOrders++;
      if (r.status === "pending") pendingCount++;
      if (["confirmed", "preparing", "ready"].includes(r.status)) inProgressCount++;
      if (r.status === "out_for_delivery") outForDeliveryCount++;
      if (r.status === "delivered") {
        deliveredCount++;
        deliveredTotal += r.total;
      }
      if (r.status === "cancelled" || r.status === "refunded") cancelledCount++;
      if (r.createdAt >= todayMs) {
        if (r.paymentStatus === "paid") todayRevenue += r.total;
        else if (r.paymentStatus === "pending_verification" && r.status !== "cancelled" && r.status !== "refunded") todayPendingRevenue += r.total;
      }
    }

    const averageOrderValue = deliveredCount > 0 ? deliveredTotal / deliveredCount : 0;

    return { totalOrders, pendingCount, inProgressCount, outForDeliveryCount, deliveredCount, cancelledCount, todayRevenue, todayPendingRevenue, averageOrderValue };
  }, [records]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const fromMs = filters.dateRange?.from ? new Date(`${filters.dateRange.from}T00:00:00`).getTime() : null;
    const toMs = filters.dateRange?.to ? new Date(`${filters.dateRange.to}T23:59:59.999`).getTime() : null;
    return records.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.paymentStatus !== "all" && r.paymentStatus !== filters.paymentStatus) return false;
      if (filters.businessUnitId !== "all" && r.businessUnitId !== filters.businessUnitId) return false;
      if (filters.orderType !== "all" && r.orderType !== filters.orderType) return false;
      if (fromMs !== null && r.createdAt < fromMs) return false;
      if (toMs !== null && r.createdAt > toMs) return false;
      if (q) {
        const matchesOrder = r.orderNumber.toLowerCase().includes(q);
        const matchesName = r.customerName.toLowerCase().includes(q);
        const matchesPhone = r.customerPhone.toLowerCase().includes(q);
        if (!matchesOrder && !matchesName && !matchesPhone) return false;
      }
      return true;
    });
  }, [records, filters]);

  // --- Sorting ---
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortKey) {
        case "orderNumber": aVal = a.orderNumber; bVal = b.orderNumber; break;
        case "customerName": aVal = a.customerName; bVal = b.customerName; break;
        case "total": aVal = a.total; bVal = b.total; break;
        case "status": aVal = a.status; bVal = b.status; break;
        case "orderType": aVal = a.orderType; bVal = b.orderType; break;
        case "itemCount": aVal = a.itemCount; bVal = b.itemCount; break;
        case "createdAt": aVal = a.createdAt; bVal = b.createdAt; break;
        default: aVal = a.createdAt; bVal = b.createdAt;
      }
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // --- Bulk selection derived state ---
  const selectedOrders = useMemo(() => records.filter((r) => selectedIds.has(r.id)), [records, selectedIds]);
  const allMatchingSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));

  // --- Handlers ---
  const resetPageAndSetFilters = (f: OrderFilters) => { setFilters(f); setPage(1); };
  const handleSort = (key: OrderSortKey) => {
    if (key === sortKey) setSortDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  };

  const toggleSelect = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visible.length > 0 && visible.every((o) => next.has(o.id));
      for (const o of visible) {
        if (allSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  };

  const selectAllMatching = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const o of filtered) next.add(o.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exportOrdersCSV = () => {
    const rows = sorted.map((o) => ({
      "Order #": o.orderNumber,
      "Date": new Date(o.createdAt).toLocaleString(),
      "Business Unit": o.businessUnitName,
      "Customer": o.customerName,
      "Phone": o.customerPhone,
      "Email": o.customerEmail ?? "",
      "Type": o.orderType,
      "Status": STATUS_LABELS[o.status],
      "Payment": PAYMENT_STATUS_LABELS[o.paymentStatus],
      "Items": o.itemCount,
      "Subtotal": o.subtotal,
      "Discount": o.discount,
      "Delivery Fee": o.deliveryFee,
      "Tax": o.tax,
      "Total": o.total,
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCSV(`orders-${stamp}.csv`, rows);
    toast.success(`Exported ${rows.length} order${rows.length === 1 ? "" : "s"}`);
  };

  const reportBulkResult = (action: string, res: { total: number; results: { success: boolean; skipped?: boolean }[] }) => {
    const done = res.results.filter((r) => r.success && !r.skipped).length;
    const skipped = res.results.filter((r) => r.skipped).length;
    const failed = res.results.filter((r) => !r.success).length;
    const summary = `${done} of ${res.total} orders ${action}`;
    if (failed === 0) toast.success(skipped > 0 ? `${summary}, ${skipped} skipped` : summary);
    else toast.error(`${summary}${skipped > 0 ? `, ${skipped} skipped` : ""}, ${failed} failed`);
  };

  const handleBulkStatus = async (status: OrderStatus) => {
    const ids = selectedOrders.map((o) => toOrderId(o.id));
    if (ids.length === 0) return;
    setBulkDialog(null);
    setIsBulkPending(true);
    try {
      const res = await bulkUpdateStatus({ sessionToken: getSessionToken()!, orderIds: ids, status });
      reportBulkResult("updated", res);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order statuses");
    } finally {
      setIsBulkPending(false);
    }
  };

  const handleBulkCancel = async () => {
    const ids = selectedOrders.map((o) => toOrderId(o.id));
    if (ids.length === 0) return;
    setBulkDialog(null);
    setIsBulkPending(true);
    try {
      const res = await bulkCancel({ sessionToken: getSessionToken()!, orderIds: ids });
      reportBulkResult("cancelled", res);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel orders");
    } finally {
      setIsBulkPending(false);
    }
  };

  const handleBulkRefund = async () => {
    const ids = selectedOrders.map((o) => toOrderId(o.id));
    if (ids.length === 0) return;
    setBulkDialog(null);
    setIsBulkPending(true);
    try {
      const res = await bulkRefund({ sessionToken: getSessionToken()!, orderIds: ids });
      reportBulkResult("refunded", res);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refund orders");
    } finally {
      setIsBulkPending(false);
    }
  };

  const handleQuickStatus = (order: OrderRecord) => {
    const next = getNextStatus(order.status, order.orderType);
    if (!next) return;
    setStatusTarget(order);
    setStatusGoal(next);
  };

  const handleKitchenAdvance = async (order: OrderRecord, target: OrderStatus) => {
    if (target === "preparing" && order.paymentStatus !== "paid") {
      setError(`${order.orderNumber} — payment must be verified before preparation can begin`);
      return;
    }
    setKitchenPendingId(order.id);
    try {
      await updateStatus({
        id: toOrderId(order.id),
        status: target,
        sessionToken: getSessionToken()!,
      });
      toast.success(`${order.orderNumber} → ${STATUS_LABELS[target]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setKitchenPendingId(null);
    }
  };

  const handleCancel = (order: OrderRecord) => {
    setStatusTarget(order);
    setStatusGoal("cancelled");
  };

  const confirmStatusUpdate = async () => {
    if (!statusTarget || !statusGoal) return;
    if (statusGoal === "preparing" && statusTarget.paymentStatus !== "paid") {
      setError("Payment must be verified before preparation can begin");
      setStatusTarget(null);
      setStatusGoal(null);
      return;
    }
    try {
      await updateStatus({
        id: toOrderId(statusTarget.id),
        status: statusGoal,
        sessionToken: getSessionToken()!,
      });
      setStatusTarget(null);
      setStatusGoal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order status");
      setStatusTarget(null);
      setStatusGoal(null);
    }
  };

  const handlePaymentStatusUpdate = async (order: OrderRecord, paymentStatus: PaymentStatus) => {
    try {
      await updateStatus({
        id: toOrderId(order.id),
        status: order.status,
        paymentStatus,
        sessionToken: getSessionToken()!,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment status");
    }
  };

  const handleReopenPaymentVerification = async (order: OrderRecord) => {
    try {
      const res = await reopenPaymentVerification({
        sessionToken: getSessionToken()!,
        orderId: toOrderId(order.id),
      });
      if (res.reopened) {
        toast.success(`${order.orderNumber} — verification re-opened`, {
          description: "The customer can now retry payment and submit a new claim.",
        });
      } else {
        toast.info(`${order.orderNumber} is already awaiting verification`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-open payment verification");
    }
  };

  return (
    <div>
      <PageHeader title="Orders" description="Manage customer orders and fulfillment.">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === "kitchen" ? "default" : "outline"}
            onClick={() => setViewMode(viewMode === "kitchen" ? "table" : "kitchen")}
            className="gap-1.5"
          >
            {viewMode === "kitchen" ? <Table2 className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
            {viewMode === "kitchen" ? "Table View" : "Kitchen View"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(0)}>
            <RefreshCw className="mr-1.5 size-4" />Refresh
          </Button>
        </div>
      </PageHeader>

      {/* Dashboard Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <SummaryCard title="Total Orders" value={summary.totalOrders} icon={ShoppingCart} />
        <SummaryCard title="Pending" value={summary.pendingCount} icon={ShoppingCart} className="text-blue-600" />
        <SummaryCard title="In Progress" value={summary.inProgressCount} icon={ShoppingCart} className="text-amber-600" />
        <SummaryCard title="Out for Delivery" value={summary.outForDeliveryCount} icon={ShoppingCart} className="text-purple-600" />
        <SummaryCard title="Delivered" value={summary.deliveredCount} icon={ShoppingCart} className="text-emerald-600" />
        <SummaryCard title="Cancelled" value={summary.cancelledCount} icon={ShoppingCart} className="text-red-600" />
        <SummaryCard title="Today's Paid Revenue" value={`₹${summary.todayRevenue.toLocaleString()}`} icon={ShoppingCart} className="text-emerald-600" />
        <SummaryCard title="Pending Collection Today" value={`₹${summary.todayPendingRevenue.toLocaleString()}`} icon={ShoppingCart} className="text-amber-600" />
        <SummaryCard title="Avg Order Value" value={`₹${Math.round(summary.averageOrderValue).toLocaleString()}`} icon={ShoppingCart} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load orders</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-4" />Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Order management">
          <OrderToolbar
            filters={filters}
            businessUnits={buOptions}
            onFiltersChange={resetPageAndSetFilters}
            onClear={() => resetPageAndSetFilters({ ...DEFAULT_FILTERS })}
          />
          <BulkOperationsBar
            selectedOrders={selectedOrders}
            matchingCount={filtered.length}
            allMatchingSelected={allMatchingSelected}
            onSelectAllMatching={selectAllMatching}
            onClearSelection={clearSelection}
            onExportCSV={exportOrdersCSV}
            onUpdateStatus={() => setBulkDialog("status")}
            onCancel={() => setBulkDialog("cancel")}
            onRefund={() => setBulkDialog("refund")}
            isBusy={isBulkPending}
          />
          {isLoading ? (
            <OrderTable orders={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onViewDetail={() => undefined} onQuickStatus={() => undefined} onCancel={() => undefined} onUpdatePaymentStatus={() => undefined} onReopenPaymentVerification={() => undefined} selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAllVisible} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No orders found"
              description={filtered.length === 0 && records.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.ORDERS}
            />
      ) : viewMode === "kitchen" ? (
        <KitchenView orders={filtered} onOpenOrder={setDetailTarget} onAdvanceStatus={handleKitchenAdvance} pendingOrderId={kitchenPendingId} />
      ) : (
            <>
              <OrderTable
                orders={visible}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onViewDetail={setDetailTarget}
                onQuickStatus={handleQuickStatus}
                onCancel={handleCancel}
                onUpdatePaymentStatus={handlePaymentStatusUpdate}
                onReopenPaymentVerification={handleReopenPaymentVerification}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAllVisible}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}</p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button></PaginationItem>
                    <PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button></PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </section>
      )}

      {/* Dialogs */}
      <OrderDetailDialog
        open={Boolean(detailTarget)}
        order={detailTarget}
        onOpenChange={(o) => { if (!o) setDetailTarget(null); }}
      />
      <StatusUpdateDialog
        open={Boolean(statusTarget && statusGoal)}
        order={statusTarget}
        targetStatus={statusGoal}
        onOpenChange={(o) => { if (!o) { setStatusTarget(null); setStatusGoal(null); } }}
        onConfirm={confirmStatusUpdate}
      />
      <BulkStatusUpdateDialog
        open={bulkDialog === "status"}
        orderCount={selectedOrders.length}
        onOpenChange={(o) => { if (!o) setBulkDialog(null); }}
        onConfirm={handleBulkStatus}
      />
      <BulkCancelDialog
        open={bulkDialog === "cancel"}
        orderCount={selectedOrders.length}
        onOpenChange={(o) => { if (!o) setBulkDialog(null); }}
        onConfirm={handleBulkCancel}
      />
      <BulkRefundDialog
        open={bulkDialog === "refund"}
        orderCount={selectedOrders.length}
        onOpenChange={(o) => { if (!o) setBulkDialog(null); }}
        onConfirm={handleBulkRefund}
      />
    </div>
  );
}
