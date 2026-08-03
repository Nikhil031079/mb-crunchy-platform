import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
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
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatCurrency } from "@/utils";

import type {
  Order,
  OrderItem,
  BusinessUnit,
  InventoryItem,
  CatalogItem,
  Product,
  Category,
} from "@/types";

// ============================================================================
// Report Periods
// ============================================================================

type Period = "daily" | "weekly" | "monthly";

interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

function buildBuckets(period: Period): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];

  if (period === "daily") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        start: d.getTime(),
        end: d.getTime() + 86400000,
      });
    }
    return buckets;
  }

  if (period === "weekly") {
    for (let i = 7; i >= 0; i--) {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = monday.getDay();
      monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1) - i * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 7);
      buckets.push({
        key: `w-${monday.toISOString().slice(0, 10)}`,
        label: monday.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        start: monday.getTime(),
        end: sunday.getTime(),
      });
    }
    return buckets;
  }

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: d.getTime(),
      end: next.getTime(),
    });
  }
  return buckets;
}

// ============================================================================
// Aggregation helpers
// ============================================================================

const isNetOrder = (o: Order) => o.status !== "cancelled" && o.status !== "refunded";

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

  const [period, setPeriod] = useState<Period>("daily");

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

  // ---- Sales buckets --------------------------------------------------------
  const buckets = useMemo(() => buildBuckets(period), [period]);

  const bucketStats = useMemo(() => {
    if (!orders) return [];
    return buckets.map((bucket) => {
      let revenue = 0;
      let orderCount = 0;
      for (const o of orders) {
        if (o.createdAt < bucket.start || o.createdAt >= bucket.end) continue;
        orderCount += 1;
        if (isNetOrder(o)) revenue += o.total;
      }
      return { bucket, revenue, orderCount };
    });
  }, [orders, buckets]);

  const range = useMemo(() => {
    if (!orders) return null;
    let revenue = 0;
    let netCount = 0;
    let grossCount = 0;
    const revenueByBu = new Map<string, number>();
    for (const o of orders) {
      if (o.createdAt < buckets[0].start || o.createdAt >= buckets[buckets.length - 1].end) continue;
      grossCount += 1;
      if (!isNetOrder(o)) continue;
      netCount += 1;
      revenue += o.total;
      revenueByBu.set(o.businessUnitId, (revenueByBu.get(o.businessUnitId) ?? 0) + o.total);
    }
    const topBu = [...revenueByBu.entries()]
      .map(([id, value]) => ({ id, value }))
      .sort((a, b) => b.value - a.value)[0];
    return {
      revenue,
      netCount,
      grossCount,
      averageOrderValue: netCount > 0 ? revenue / netCount : 0,
      topBu: topBu ? { name: buNameById.get(topBu.id) ?? "Unknown", value: topBu.value } : null,
    };
  }, [orders, buckets, buNameById]);

  const bestSellers = useMemo(() => {
    if (!orders) return [];
    const counts = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      if (!isNetOrder(o)) continue;
      for (const item of o.items ?? []) {
        const entry = counts.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
        entry.qty += item.quantity;
        entry.revenue += item.unitPrice * item.quantity;
        counts.set(item.name, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [orders]);

  const topCategories = useMemo(() => {
    if (!orders) return [];
    const counts = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
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
  }, [orders, catalogById, productById, categoryById]);

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
    const now = Date.now();
    const windowStart = now - 90 * 86400000;
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
  }, [orders, inventory]);

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
    () => Math.max(...bucketStats.map((s) => s.revenue), 1),
    [bucketStats],
  );

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

  const periodLabels: Record<Period, string> = {
    daily: "Daily · Last 14 days",
    weekly: "Weekly · Last 8 weeks",
    monthly: "Monthly · Last 12 months",
  };

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
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    period === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{periodLabels[period]}</span>
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={IndianRupee}
              label="Revenue"
              value={formatCurrency(range?.revenue ?? 0)}
            />
            <SummaryCard
              icon={ShoppingCart}
              label="Orders"
              value={`${range?.netCount ?? 0}`}
              sub={`${range?.grossCount ?? 0} incl. cancelled`}
            />
            <SummaryCard
              icon={Receipt}
              label="Avg Order Value"
              value={formatCurrency(range?.averageOrderValue ?? 0)}
            />
            <SummaryCard
              icon={Building2}
              label="Top Business Unit"
              value={range?.topBu?.name ?? "—"}
              sub={range?.topBu ? formatCurrency(range.topBu.value) : undefined}
            />
          </div>

          {/* Revenue chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-muted-foreground" /> Revenue Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1.5 h-48">
                {bucketStats.map((s) => {
                  const heightPercent = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
                  return (
                    <div key={s.bucket.key} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {s.revenue > 0 ? formatCurrency(s.revenue).replace(/\.00$/, "") : ""}
                      </span>
                      <div
                        className={cn(
                          "w-full max-w-9 rounded-t-md transition-all",
                          s.revenue > 0 ? "bg-primary/70" : "bg-secondary",
                        )}
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                        title={`${s.bucket.label}: ${formatCurrency(s.revenue)} · ${s.orderCount} orders`}
                      />
                      <span className="text-[10px] text-muted-foreground">{s.bucket.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Best sellers + top categories */}
          <div className="grid gap-6 xl:grid-cols-2">
            <RankTable
              icon={Trophy}
              title="Best Sellers"
              subtitle="By units sold (excludes cancelled/refunded)"
              rows={bestSellers}
            />
            <RankTable
              icon={FolderTree}
              title="Top Categories"
              subtitle="By units sold across product items"
              rows={topCategories}
            />
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* INVENTORY TAB                                                      */}
        {/* ================================================================ */}
        <TabsContent value="inventory" className="space-y-6">
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
// Small presentational helpers
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
