import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, ShoppingCart } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { OrderDetailDialog } from "@/components/admin/orders/OrderDetailDialog";
import { OrderTable } from "@/components/admin/orders/OrderTable";
import { OrderToolbar } from "@/components/admin/orders/OrderToolbar";
import { StatusUpdateDialog } from "@/components/admin/orders/StatusUpdateDialog";
import type { OrderFilters, OrderRecord, OrderSortKey, OrderStatus, SortDirection } from "@/components/admin/orders/types";
import { getNextStatus } from "@/components/admin/orders/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES, STATUS_COLORS } from "@/constants";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

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
// Page
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const allOrders = useQuery(api.orders.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const updateStatus = useMutation(api.orders.updateStatus);

  const isLoading = allOrders === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OrderFilters>({ query: "", status: "all", businessUnitId: "all", orderType: "all" });
  const [sortKey, setSortKey] = useState<OrderSortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const [detailTarget, setDetailTarget] = useState<OrderRecord | null>(null);
  const [statusTarget, setStatusTarget] = useState<OrderRecord | null>(null);
  const [statusGoal, setStatusGoal] = useState<OrderStatus | null>(null);

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
    const now = Date.now();
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
    let totalRevenue = 0;
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
      totalRevenue += r.total;
      if (r.createdAt >= todayMs) todayRevenue += r.total;
    }

    const averageOrderValue = deliveredCount > 0 ? deliveredTotal / deliveredCount : 0;

    return { totalOrders, pendingCount, inProgressCount, outForDeliveryCount, deliveredCount, cancelledCount, todayRevenue, averageOrderValue };
  }, [records]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return records.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.businessUnitId !== "all" && r.businessUnitId !== filters.businessUnitId) return false;
      if (filters.orderType !== "all" && r.orderType !== filters.orderType) return false;
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

  // --- Handlers ---
  const resetPageAndSetFilters = (f: OrderFilters) => { setFilters(f); setPage(1); };
  const handleSort = (key: OrderSortKey) => {
    if (key === sortKey) setSortDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  };

  const handleQuickStatus = (order: OrderRecord) => {
    const next = getNextStatus(order.status);
    if (!next) return;
    setStatusTarget(order);
    setStatusGoal(next);
  };

  const handleCancel = (order: OrderRecord) => {
    setStatusTarget(order);
    setStatusGoal("cancelled");
  };

  const confirmStatusUpdate = async () => {
    if (!statusTarget || !statusGoal) return;
    try {
      await updateStatus({
        id: statusTarget.id as any,
        status: statusGoal,
        paymentStatus: statusGoal === "confirmed" ? "paid" : undefined,
      });
      setStatusTarget(null);
      setStatusGoal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order status");
      setStatusTarget(null);
      setStatusGoal(null);
    }
  };

  return (
    <div>
      <PageHeader title="Orders" description="Manage customer orders and fulfillment.">
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-1.5 size-4" />Refresh
        </Button>
      </PageHeader>

      {/* Dashboard Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <SummaryCard title="Total Orders" value={summary.totalOrders} icon={ShoppingCart} />
        <SummaryCard title="Pending" value={summary.pendingCount} icon={ShoppingCart} className="text-blue-600" />
        <SummaryCard title="In Progress" value={summary.inProgressCount} icon={ShoppingCart} className="text-amber-600" />
        <SummaryCard title="Out for Delivery" value={summary.outForDeliveryCount} icon={ShoppingCart} className="text-purple-600" />
        <SummaryCard title="Delivered" value={summary.deliveredCount} icon={ShoppingCart} className="text-emerald-600" />
        <SummaryCard title="Cancelled" value={summary.cancelledCount} icon={ShoppingCart} className="text-red-600" />
        <SummaryCard title="Today's Revenue" value={`₹${summary.todayRevenue.toLocaleString()}`} icon={ShoppingCart} className="text-emerald-600" />
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
            onClear={() => resetPageAndSetFilters({ query: "", status: "all", businessUnitId: "all", orderType: "all" })}
          />
          {isLoading ? (
            <OrderTable orders={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onViewDetail={() => undefined} onQuickStatus={() => undefined} onCancel={() => undefined} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No orders found"
              description={filtered.length === 0 && records.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.ORDERS}
            />
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
    </div>
  );
}
