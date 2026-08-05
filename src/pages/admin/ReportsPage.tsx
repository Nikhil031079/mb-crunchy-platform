import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import {
  BarChart3,
  IndianRupee,
  ShoppingCart,
  Receipt,
  Trophy,
  FolderTree,
  Building2,
  AlertTriangle,
  PackageX,
  Zap,
  Turtle,
  PackageCheck,
  Warehouse,
  XCircle,
  Store,
  ListChecks,
  Users,
  Download,
  Wallet,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatCurrency, downloadCSV } from "@/utils";

import type { OrderStatus } from "@/components/admin/orders/types";
import { STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/components/admin/orders/types";
import { STATUS_COLORS } from "@/constants";

import type {
  Order,
  OrderItem,
  InventoryItem,
  CatalogItem,
  Product,
  Category,
} from "@/types";

// ============================================================================
// Report Ranges & Buckets
// ============================================================================

type RangeKey = "today" | "week" | "month" | "custom";

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

interface ActiveRange {
  key: RangeKey;
  start: number;
  end: number;
  label: string;
}

function buildActiveRange(
  key: RangeKey,
  customFrom: string,
  customTo: string,
): ActiveRange {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  if (key === "today") {
    return { key, start: startOfToday, end: now.getTime(), label: "Today" };
  }

  if (key === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - diff,
    ).getTime();
    return { key, start: monday, end: now.getTime(), label: "This Week" };
  }

  if (key === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { key, start: monthStart, end: now.getTime(), label: "This Month" };
  }

  const from = customFrom
    ? new Date(`${customFrom}T00:00:00`).getTime()
    : startOfToday;
  const to = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : from;
  return {
    key,
    start: from,
    end: to > from ? to : from + DAY_MS,
    label: "Custom Range",
  };
}

function buildBuckets(start: number, end: number): Bucket[] {
  const buckets: Bucket[] = [];
  const span = end - start;

  if (span <= 2 * DAY_MS) {
    const startHour = Math.floor(start / HOUR_MS);
    const endHour = Math.ceil(end / HOUR_MS);
    for (let i = startHour; i < endHour; i++) {
      const bStart = i * HOUR_MS;
      buckets.push({
        key: `h-${i}`,
        label: new Date(bStart).toLocaleTimeString("en-US", { hour: "numeric" }),
        start: Math.max(bStart, start),
        end: Math.min(bStart + HOUR_MS, end),
      });
    }
    return buckets;
  }

  if (span <= 60 * DAY_MS) {
    for (let i = 0; i < 60; i++) {
      const bStart = start + i * DAY_MS;
      if (bStart >= end) break;
      const d = new Date(bStart);
      buckets.push({
        key: `d-${d.toISOString().slice(0, 10)}`,
        label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        start: Math.max(bStart, start),
        end: Math.min(bStart + DAY_MS, end),
      });
    }
    return buckets;
  }

  if (span <= 400 * DAY_MS) {
    const mondayOf = (ts: number) => {
      const d = new Date(ts);
      const day = d.getDay();
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      return d;
    };
    let cursor = mondayOf(start).getTime();
    while (cursor < end) {
      const d = new Date(cursor);
      buckets.push({
        key: `w-${d.toISOString().slice(0, 10)}`,
        label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        start: Math.max(cursor, start),
        end: Math.min(cursor + 7 * DAY_MS, end),
      });
      cursor += 7 * DAY_MS;
    }
    return buckets;
  }

  for (let i = 0; i < 24; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    if (d.getTime() >= end) break;
    const next = new Date(d);
    next.setMonth(d.getMonth() + 1);
    buckets.push({
      key: `m-${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: Math.max(d.getTime(), start),
      end: Math.min(next.getTime(), end),
    });
  }
  return buckets;
}

// ============================================================================
// Aggregation helpers
// ============================================================================

// "Net" = money actually collected. Unpaid and terminal orders are never
// counted as revenue — cancelled/refunded orders live in their own buckets.
const isNetOrder = (o: Order) =>
  o.status !== "cancelled" && o.status !== "refunded" && o.paymentStatus === "paid";

const isPendingCollection = (o: Order) =>
  o.status !== "cancelled" && o.status !== "refunded" && o.paymentStatus === "pending_verification";

interface Movement {
  item: InventoryItem;
  soldQty: number;
}

export default function ReportsPage() {
  const orders = useQuery(api.orders.getAll);
  const businessUnits = useQuery(api.businessUnits.getAll);
  const inventory = useQuery(api.inventory.getAll);
  const catalogItems = useQuery(api.catalogItems.getAll);
  const products = useQuery(api.products.getAll);
  const categories = useQuery(api.categories.getAll);

  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [nowTimestamp] = useState(() => Date.now());

  const isLoading =
    orders === undefined ||
    businessUnits === undefined ||
    inventory === undefined ||
    catalogItems === undefined ||
    products === undefined ||
    categories === undefined;

  // ---- Lookup maps ---------------------------------------------------------
  const buNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of businessUnits ?? []) map.set(bu._id, bu.name);
    return map;
  }, [businessUnits]);

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of catalogItems ?? []) map.set(item._id, item);
    return map;
  }, [catalogItems]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products ?? []) map.set(product._id, product);
    return map;
  }, [products]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of categories ?? []) map.set(category._id, category);
    return map;
  }, [categories]);

  // ---- Active range & buckets ----------------------------------------------
  const activeRange = useMemo(
    () => buildActiveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  const buckets = useMemo(
    () => buildBuckets(activeRange.start, activeRange.end),
    [activeRange],
  );

  const windowOrders = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => o.createdAt >= activeRange.start && o.createdAt < activeRange.end,
      ),
    [orders, activeRange],
  );

  // ---- Sales aggregates for the active range --------------------------------
  const sales = useMemo(() => {
    let revenue = 0;
    let netCount = 0;
    let grossCount = 0;
    let pendingRevenue = 0;
    let pendingCount = 0;
    const revenueByBu = new Map<string, number>();
    const orderCountByBu = new Map<string, number>();
    for (const o of windowOrders) {
      grossCount += 1;
      if (isPendingCollection(o)) {
        pendingRevenue += o.total;
        pendingCount += 1;
      }
      if (!isNetOrder(o)) continue;
      netCount += 1;
      revenue += o.total;
      revenueByBu.set(o.businessUnitId, (revenueByBu.get(o.businessUnitId) ?? 0) + o.total);
      orderCountByBu.set(o.businessUnitId, (orderCountByBu.get(o.businessUnitId) ?? 0) + 1);
    }
    const buRows = [...revenueByBu.entries()]
      .map(([id, value]) => ({
        id,
        name: buNameById.get(id) ?? "Unknown",
        revenue: value,
        orders: orderCountByBu.get(id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const topBu = buRows[0] ?? null;
    return {
      revenue,
      netCount,
      grossCount,
      pendingRevenue,
      pendingCount,
      averageOrderValue: netCount > 0 ? revenue / netCount : 0,
      topBu,
      buRows,
    };
  }, [windowOrders, buNameById]);

  const statusSummary = useMemo(() => {
    const counts = new Map<OrderStatus, { count: number; revenue: number }>();
    for (const o of windowOrders) {
      const entry = counts.get(o.status) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      if (isNetOrder(o)) entry.revenue += o.total;
      counts.set(o.status, entry);
    }
    return (Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => ({
      status,
      count: counts.get(status)?.count ?? 0,
      revenue: counts.get(status)?.revenue ?? 0,
    }));
  }, [windowOrders]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; orders: number; total: number }>();
    for (const o of windowOrders) {
      if (!isNetOrder(o)) continue;
      const key = o.customerPhone || o.customerName;
      const entry = map.get(key) ?? {
        name: o.customerName,
        phone: o.customerPhone,
        orders: 0,
        total: 0,
      };
      entry.orders += 1;
      entry.total += o.total;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [windowOrders]);

  const bestSellers = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of windowOrders) {
      if (!isNetOrder(o)) continue;
      for (const item of o.items ?? []) {
        const entry = counts.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
        entry.qty += item.quantity;
        entry.revenue += item.unitPrice * item.quantity;
        counts.set(item.name, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [windowOrders]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of windowOrders) {
      if (!isNetOrder(o)) continue;
      for (const item of o.items ?? []) {
        const category = resolveCategory(item, catalogById, productById, categoryById);
        const entry = counts.get(category) ?? { name: category, qty: 0, revenue: 0 };
        entry.qty += item.quantity;
        entry.revenue += item.unitPrice * item.quantity;
        counts.set(category, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [windowOrders, catalogById, productById, categoryById]);

  // ---- Bucket chart data -----------------------------------------------------
  const bucketStats = useMemo(() => {
    if (!orders) return [];
    return buckets.map((bucket) => {
      let revenue = 0;
      let pendingRevenue = 0;
      let orderCount = 0;
      for (const o of orders) {
        if (o.createdAt < bucket.start || o.createdAt >= bucket.end) continue;
        orderCount += 1;
        if (isNetOrder(o)) revenue += o.total;
        else if (isPendingCollection(o)) pendingRevenue += o.total;
      }
      return { bucket, revenue, pendingRevenue, orderCount };
    });
  }, [orders, buckets]);

  // ---- Inventory analysis ---------------------------------------------------
  const inventoryValue = useMemo(() => {
    if (!inventory) return 0;
    return inventory.reduce(
      (sum, item) => sum + item.stockQuantity * (item.costPrice ?? 0),
      0,
    );
  }, [inventory]);

  const lowStockItems = useMemo(
    () =>
      (inventory ?? []).filter(
        (item) => item.lowStockAlert !== undefined && item.stockQuantity <= item.lowStockAlert,
      ),
    [inventory],
  );

  const outOfStockItems = useMemo(
    () =>
      (inventory ?? []).filter(
        (item) => !item.available || item.stockQuantity - item.reservedStock <= 0,
      ),
    [inventory],
  );

  const movement = useMemo<Movement[]>(() => {
    if (!orders || !inventory) return [];
    const windowStart = nowTimestamp - 90 * DAY_MS;
    const sold = new Map<string, number>();
    for (const o of orders) {
      if (o.createdAt < windowStart || !isNetOrder(o)) continue;
      for (const item of o.items ?? []) {
        const key = `${item.catalogItemId}::${item.variantName}`;
        sold.set(key, (sold.get(key) ?? 0) + item.quantity);
      }
    }
    return inventory.map((item) => ({
      item,
      soldQty: sold.get(`${item.catalogItemId}::${item.variantName}`) ?? 0,
    }));
  }, [orders, inventory, nowTimestamp]);

  const fastMoving = useMemo(
    () =>
      movement
        .filter((m) => m.soldQty > 0)
        .sort((a, b) => b.soldQty - a.soldQty)
        .slice(0, 10),
    [movement],
  );

  const slowMoving = useMemo(
    () =>
      movement
        .filter((m) => m.soldQty > 0 && m.soldQty <= 5 && m.item.stockQuantity > 0)
        .sort((a, b) => a.soldQty - b.soldQty)
        .slice(0, 10),
    [movement],
  );

  const deadStock = useMemo(
    () =>
      movement
        .filter((m) => m.soldQty === 0 && m.item.stockQuantity > 0)
        .sort((a, b) => b.item.stockQuantity - a.item.stockQuantity)
        .slice(0, 10),
    [movement],
  );

  const valuationByBu = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of inventory ?? []) {
      map.set(
        item.businessUnitId,
        (map.get(item.businessUnitId) ?? 0) + item.stockQuantity * (item.costPrice ?? 0),
      );
    }
    return [...map.entries()]
      .map(([id, value]) => ({ id, name: buNameById.get(id) ?? "Unknown", value }))
      .sort((a, b) => b.value - a.value);
  }, [inventory, buNameById]);

  const maxRevenue = useMemo(
    () => Math.max(...bucketStats.map((s) => s.revenue + s.pendingRevenue), 1),
    [bucketStats],
  );

  // ---- CSV exports ----------------------------------------------------------
  const exportSalesCSV = () => {
    const rows = windowOrders.map((o) => ({
      "Order #": o.orderNumber,
      "Date": new Date(o.createdAt).toLocaleString(),
      "Business Unit": buNameById.get(o.businessUnitId) ?? "Unknown",
      "Customer": o.customerName,
      "Phone": o.customerPhone,
      "Email": o.customerEmail ?? "",
      "Type": o.orderType,
      "Status": STATUS_LABELS[o.status],
      "Payment Status": PAYMENT_STATUS_LABELS[o.paymentStatus ?? "pending"],
      "Payment Method": o.paymentMethod ?? "",
      "Items": (o.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
      "Subtotal": o.subtotal,
      "Discount": o.discount,
      "Delivery Fee": o.deliveryFee,
      "Tax": o.tax,
      "Total": o.total,
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCSV(`sales-report-${stamp}.csv`, rows);
    toast.success(`Exported ${rows.length} order${rows.length === 1 ? "" : "s"}`);
  };

  const exportInventoryCSV = () => {
    const rows = (inventory ?? []).map((item) => ({
      "Variant": item.variantName,
      "SKU": item.sku ?? "",
      "Business Unit": buNameById.get(item.businessUnitId) ?? "Unknown",
      "Stock": item.stockQuantity,
      "Reserved": item.reservedStock ?? 0,
      "Available": item.available ? "Yes" : "No",
      "Low Stock Alert": item.lowStockAlert ?? "",
      "Cost Price": item.costPrice ?? 0,
      "Inventory Value": (item.stockQuantity * (item.costPrice ?? 0)).toFixed(2),
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCSV(`inventory-report-${stamp}.csv`, rows);
    toast.success(`Exported ${rows.length} inventory item${rows.length === 1 ? "" : "s"}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Business performance, sales trends, and inventory analytics."
      />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" className="gap-1.5">
            <BarChart3 className="size-4" /> Sales
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5">
            <Warehouse className="size-4" /> Inventory
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* SALES TAB                                                         */}
        {/* ================================================================ */}
        <TabsContent value="sales" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-1">
              {rangeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRangeKey(option.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    rangeKey === option.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={exportSalesCSV} className="gap-1.5">
              <Download className="size-3.5" /> Export CSV
            </Button>
          </div>

          {rangeKey === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="From date"
                className="w-auto"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="To date"
                className="w-auto"
              />
              <span className="text-sm text-muted-foreground">{activeRange.label}</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryCard
              icon={IndianRupee}
              label={`Paid Revenue · ${activeRange.label}`}
              value={formatCurrency(sales.revenue)}
              sub="collected only"
            />
            <SummaryCard
              icon={Wallet}
              label={`Pending Collection · ${activeRange.label}`}
              value={formatCurrency(sales.pendingRevenue)}
              sub={`${sales.pendingCount} orders awaiting verification`}
            />
            <SummaryCard
              icon={ShoppingCart}
              label="Paid Orders"
              value={`${sales.netCount}`}
              sub={`${sales.grossCount} total incl. cancelled/refunded`}
            />
            <SummaryCard
              icon={Receipt}
              label="Avg Order Value"
              value={formatCurrency(sales.averageOrderValue)}
              sub="paid orders only"
            />
            <SummaryCard
              icon={Building2}
              label="Top Business Unit"
              value={sales.topBu?.name ?? "—"}
              sub={sales.topBu ? formatCurrency(sales.topBu.revenue) : undefined}
            />
          </div>

          {/* Revenue chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-muted-foreground" /> Paid Revenue Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary/70" /> Paid
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-amber-400/80" /> Pending collection
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-48">
                {bucketStats.map((s) => {
                  const heightPercent = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
                  const pendingPercent = maxRevenue > 0 ? (s.pendingRevenue / maxRevenue) * 100 : 0;
                  return (
                    <div key={s.bucket.key} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {s.revenue > 0 ? formatCurrency(s.revenue).replace(/\.00$/, "") : ""}
                      </span>
                      <div className="flex w-full max-w-9 flex-col items-stretch justify-end">
                        {pendingPercent > 0 && (
                          <div
                            className="w-full rounded-t-none bg-amber-400/80"
                            style={{ height: `${Math.max(pendingPercent, 1)}%` }}
                            title={`${s.bucket.label}: ${formatCurrency(s.pendingRevenue)} pending collection`}
                          />
                        )}
                        <div
                          className={cn(
                            "w-full rounded-t-md transition-all",
                            s.revenue > 0 ? "bg-primary/70" : "bg-secondary",
                          )}
                          style={{ height: `${Math.max(heightPercent, 2)}%` }}
                          title={`${s.bucket.label}: ${formatCurrency(s.revenue)} paid · ${s.orderCount} orders`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{s.bucket.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Kitchen vs Mart + status summary */}
          <div className="grid gap-6 xl:grid-cols-2">
            <BusinessUnitSplit rows={sales.buRows} total={sales.revenue} />
            <StatusSummary rows={statusSummary} />
          </div>

          {/* Best sellers + top categories */}
          <div className="grid gap-6 xl:grid-cols-2">
            <RankTable
              icon={Trophy}
              title="Best Sellers"
              subtitle="By units sold (paid orders only)"
              rows={bestSellers}
            />
            <RankTable
              icon={FolderTree}
              title="Top Categories"
              subtitle="By units sold across product items (paid orders only)"
              rows={topCategories}
            />
          </div>

          {/* Top customers */}
          <TopCustomers rows={topCustomers} />
        </TabsContent>

        {/* ================================================================ */}
        {/* INVENTORY TAB                                                      */}
        {/* ================================================================ */}
        <TabsContent value="inventory" className="space-y-6">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportInventoryCSV} className="gap-1.5">
              <Download className="size-3.5" /> Export CSV
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Warehouse} label="Inventory Value (at cost)" value={formatCurrency(inventoryValue)} />
            <SummaryCard icon={PackageCheck} label="Total Variants" value={(inventory ?? []).length} />
            <SummaryCard icon={AlertTriangle} label="Low Stock" value={lowStockItems.length} />
            <SummaryCard icon={PackageX} label="Out of Stock" value={outOfStockItems.length} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <InventoryList
              icon={AlertTriangle}
              title="Low Stock Alerts"
              items={lowStockItems}
              tone="amber"
              empty="No items below their low-stock threshold."
            />
            <InventoryList
              icon={PackageX}
              title="Out of Stock"
              items={outOfStockItems}
              tone="red"
              empty="Nothing is out of stock."
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <MovementTable icon={Zap} title="Fast Moving" subtitle="Top sellers, last 90 days" rows={fastMoving} />
            <MovementTable icon={Turtle} title="Slow Moving" subtitle="Sold ≤ 5 units in 90 days" rows={slowMoving} />
            <MovementTable icon={XCircle} title="Dead Stock" subtitle="In stock, zero sales in 90 days" rows={deadStock} />
          </div>

          {/* Valuation by BU */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" /> Inventory Valuation by Business Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {valuationByBu.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No inventory valuation available — set cost prices on inventory items.
                </p>
              ) : (
                <div className="space-y-3">
                  {valuationByBu.map((row) => {
                    const pct = inventoryValue > 0 ? (row.value / inventoryValue) * 100 : 0;
                    return (
                      <div key={row.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{row.name}</span>
                          <span className="text-muted-foreground">{formatCurrency(row.value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Presentational helpers
// ============================================================================

interface SummaryCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
}

function SummaryCard({ icon: Icon, label, value, sub }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        <Icon className="size-5 shrink-0 text-muted-foreground/60" />
      </CardContent>
    </Card>
  );
}

function BusinessUnitSplit({
  rows,
  total,
}: {
  rows: { id: string; name: string; revenue: number; orders: number }[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="size-4 text-muted-foreground" /> Kitchen vs Mart Sales
        </CardTitle>
        <p className="text-xs text-muted-foreground">Net revenue split across business units</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          rows.map((row) => {
            const pct = total > 0 ? (row.revenue / total) * 100 : 0;
            return (
              <div key={row.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(row.revenue)} · {row.orders} order{row.orders === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function StatusSummary({
  rows,
}: {
  rows: { status: OrderStatus; count: number; revenue: number }[];
}) {
  const hasData = rows.some((r) => r.count > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" /> Order Status Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">Orders and paid revenue by current status</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasData ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No orders in this period.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.status}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2"
            >
              <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[row.status])}>
                {STATUS_LABELS[row.status]}
              </Badge>
              <div className="flex items-center gap-3 text-sm">
                <span className="tabular-nums">{row.count} order{row.count === 1 ? "" : "s"}</span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(row.revenue)}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TopCustomers({
  rows,
}: {
  rows: { name: string; phone: string; orders: number; total: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" /> Top Customers
        </CardTitle>
        <p className="text-xs text-muted-foreground">By total spend in the selected period</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No customers in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={`${row.phone}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-[260px]">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.phone || "No phone"}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RankTable({
  icon: Icon,
  title,
  subtitle,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rows: { name: string; qty: number; revenue: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales data yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.name}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-medium">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryList({
  icon: Icon,
  title,
  items,
  tone,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: InventoryItem[];
  tone: "amber" | "red";
  empty: string;
}) {
  const toneClass = tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2 text-base", toneClass)}>
          <Icon className="size-4" /> {title}
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-72 space-y-2 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.slice(0, 15).map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.variantName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.sku ?? "No SKU"} · Available {Math.max(0, item.stockQuantity - (item.reservedStock ?? 0))}
                </p>
              </div>
              <Badge variant={tone === "red" ? "destructive" : "outline"} className="shrink-0">
                {item.stockQuantity} left
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MovementTable({
  icon: Icon,
  title,
  subtitle,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rows: Movement[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">None.</p>
        ) : (
          rows.map((row) => (
            <div key={row.item._id} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.item.variantName}</p>
                <p className="text-xs text-muted-foreground">{row.item.sku ?? "No SKU"}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {row.soldQty} sold
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function resolveCategory(
  item: OrderItem,
  catalogById: Map<string, CatalogItem>,
  productById: Map<string, Product>,
  categoryById: Map<string, Category>,
): string {
  const catalogItem = catalogById.get(item.catalogItemId);
  if (!catalogItem || catalogItem.itemType !== "product") return "Combos & Packs";
  const product = productById.get(catalogItem.sourceId);
  if (!product) return "Uncategorized";
  const category = categoryById.get(product.categoryId);
  return category?.name ?? "Uncategorized";
}
