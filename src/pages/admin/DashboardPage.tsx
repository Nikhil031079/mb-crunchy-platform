import { useMemo } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/admin/design-system/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils";
import { computeRevenueMetrics, isPaid as isPaidRevenueOrder } from "@/lib/finance";
import type { Order, InventoryItem, Customer } from "@/types";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingCart,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Trophy,
  ChefHat,
} from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "Pending", color: "bg-yellow-500", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-500", icon: CheckCircle },
  preparing: { label: "Preparing", color: "bg-orange-500", icon: ChefHat },
  ready: { label: "Ready", color: "bg-indigo-500", icon: CheckCircle },
  out_for_delivery: { label: "Out for Delivery", color: "bg-purple-500", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-500", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500", icon: XCircle },
  refunded: { label: "Refunded", color: "bg-gray-500", icon: XCircle },
};

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/60 p-5 space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export default function DashboardPage() {
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const orders = useQuery(api.orders.getAll, token ? { sessionToken: token } : "skip");
  const products = useQuery(api.products.getAll, token ? { sessionToken: token } : "skip");
  const customers = useQuery(api.customers.getAll, token ? { sessionToken: token } : "skip");
  const inventory = useQuery(api.inventory.getAll, token ? { sessionToken: token } : "skip");

  const isLoading = orders === undefined || products === undefined || customers === undefined;

  const stats = useMemo(() => {
    if (!orders || !products || !customers || !inventory) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayOrders = orders.filter((o: Order) => o.createdAt >= todayStart);
    const yesterdayOrders = orders.filter(
      (o: Order) => o.createdAt >= yesterdayStart && o.createdAt < todayStart,
    );

    // Revenue = PAID money only. Unpaid reservations are reported separately as
    // pending collection and never counted as revenue.
    const todayMetrics = computeRevenueMetrics(todayOrders);
    const yesterdayMetrics = computeRevenueMetrics(yesterdayOrders);
    const todayRevenue = todayMetrics.paidRevenue;
    const yesterdayRevenue = yesterdayMetrics.paidRevenue;

    const revenueChange =
      yesterdayRevenue > 0
        ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
        : todayRevenue > 0
          ? 100
          : 0;

    const newCustomersThisMonth = customers.filter(
      (c: Customer) => c.createdAt >= monthStart,
    ).length;

    const lowStockCount = inventory.filter(
      (inv: InventoryItem) =>
        inv.lowStockAlert !== undefined && inv.stockQuantity <= inv.lowStockAlert,
    ).length;

    return {
      todayRevenue,
      revenueChange,
      todayOrderCount: todayOrders.length,
      totalOrders: orders.length,
      totalCustomers: customers.length,
      newCustomersThisMonth,
      totalProducts: products.filter((p: { deletedAt?: number }) => !p.deletedAt).length,
      lowStockCount,
    };
  }, [orders, products, customers, inventory]);

  const dailyRevenue = useMemo(() => {
    if (!orders) return [];

    const now = new Date();
    const days: { date: Date; label: string; revenue: number; orders: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 86400000;
      const dayOrders = orders.filter(
        (o: Order) => o.createdAt >= dayStart && o.createdAt < dayEnd,
      );
      const metrics = computeRevenueMetrics(dayOrders);
      days.push({
        date: d,
        label: DAY_NAMES[d.getDay()],
        // Paid revenue only — pending/unpaid money is never charted as revenue.
        revenue: metrics.paidRevenue,
        orders: dayOrders.length,
      });
    }
    return days;
  }, [orders]);

  const orderStatusCounts = useMemo(() => {
    if (!orders) return [];
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    const total = orders.length;
    return Object.entries(STATUS_CONFIG)
      .filter(([key]) => counts[key] > 0)
      .map(([key, config]) => ({
        status: key,
        ...config,
        count: counts[key],
        percent: total > 0 ? Math.round((counts[key] / total) * 100) : 0,
      }));
  }, [orders]);

  const bestSellers = useMemo(() => {
    if (!orders) return [];
    const productCounts: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const o of orders) {
      // Best sellers reflect PAID demand — unpaid/cancelled/refunded orders are
      // excluded so the value column never overstates money collected.
      if (!isPaidRevenueOrder(o)) continue;
      for (const item of o.items ?? []) {
        if (!productCounts[item.name]) {
          productCounts[item.name] = { name: item.name, count: 0, revenue: 0 };
        }
        productCounts[item.name].count += item.quantity;
        productCounts[item.name].revenue += item.unitPrice * item.quantity;
      }
    }
    return Object.values(productCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [orders]);

  const lowStockItems = useMemo(() => {
    if (!inventory) return [];
    return inventory
      .filter(
        (inv: InventoryItem) =>
          inv.lowStockAlert !== undefined && inv.stockQuantity <= inv.lowStockAlert,
      )
      .slice(0, 5);
  }, [inventory]);

  const recentOrders = useMemo(() => {
    if (!orders) return [];
    return orders.slice(0, 10);
  }, [orders]);

  const maxDailyRevenue = useMemo(
    () => Math.max(...dailyRevenue.map((d) => d.revenue), 1),
    [dailyRevenue],
  );

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your business" />

      {/* Summary Cards */}
      <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stats ? (
          <>
            <StatCard label="Paid Revenue Today" value={formatCurrency(stats.todayRevenue)} />
            <StatCard label="Total Orders" value={stats.totalOrders} />
            <StatCard label="Active Customers" value={stats.totalCustomers} />
            <StatCard label="Products" value={stats.totalProducts} />
          </>
        ) : null}
      </motion.div>

      {/* Sub-stat badges */}
      {!isLoading && stats && (
        <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
          <div className="rounded-xl border border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              {stats.revenueChange >= 0 ? (
                <TrendingUp className="size-4 text-green-500" />
              ) : (
                <TrendingDown className="size-4 text-red-500" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  stats.revenueChange >= 0 ? "text-green-500" : "text-red-500",
                )}
              >
                {stats.revenueChange >= 0 ? "+" : ""}
                {stats.revenueChange.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">vs yesterday</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-blue-500" />
              <span className="text-sm font-medium">{stats.todayOrderCount}</span>
              <span className="text-xs text-muted-foreground">today</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-purple-500" />
              <span className="text-sm font-medium">{stats.newCustomersThisMonth}</span>
              <span className="text-xs text-muted-foreground">new this month</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-orange-500" />
              <span className="text-sm font-medium">{stats.lowStockCount}</span>
              <span className="text-xs text-muted-foreground">low stock</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart — spans 2 cols */}
        <motion.div {...fadeUp} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IndianRupee className="size-5" />
                Paid Revenue — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="flex items-end gap-2 h-48">
                  {dailyRevenue.map((day, i) => {
                    const heightPercent =
                      maxDailyRevenue > 0 ? (day.revenue / maxDailyRevenue) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 gap-1">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {day.revenue > 0 ? formatCurrency(day.revenue) : ""}
                        </span>
                        <div className="w-full relative flex justify-center" style={{ minHeight: 4 }}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(heightPercent, 2)}%` }}
                            transition={{ duration: 0.6, delay: i * 0.08 }}
                            className={cn(
                              "w-full max-w-10 rounded-t-md",
                              day.label === DAY_NAMES[new Date().getDay()]
                                ? "bg-primary"
                                : "bg-primary/60",
                            )}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Orders by Status */}
        <motion.div {...fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Orders by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : orderStatusCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No orders yet</p>
              ) : (
                <div className="space-y-3">
                  {orderStatusCounts.map((s) => (
                    <div key={s.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", s.color)} />
                          {s.label}
                        </span>
                        <span className="text-muted-foreground">
                          {s.count} ({s.percent}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${s.percent}%` }}
                          transition={{ duration: 0.6 }}
                          className={cn("h-full rounded-full", s.color)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Best Sellers */}
        <motion.div {...fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-5" />
                Best Sellers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : bestSellers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales data yet</p>
              ) : (
                <div className="space-y-3">
                  {bestSellers.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.count} paid · {formatCurrency(item.revenue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Low Stock Alert */}
        <motion.div {...fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-500" />
                Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : lowStockItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  All items well stocked
                </p>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map((item) => (
                    <div key={item._id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.variantName}</p>
                      </div>
                      <Badge variant="destructive" className="shrink-0 ml-2">
                        {item.stockQuantity} left
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div {...fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No recent orders
                </p>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => {
                    const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={order._id}
                        className="flex items-center gap-3 rounded-lg border border-border/40 p-3"
                      >
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full",
                            cfg.color + "/10",
                          )}
                        >
                          <Icon className={cn("size-4", cfg.color.replace("bg-", "text-"))} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{order.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(order.total)} · {cfg.label}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(order.createdAt, "relative")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
