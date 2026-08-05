import { useMemo, useCallback } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Star,
  Package,
  MapPin,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRight,
  Clock,
  RotateCcw,
  Calendar,
  TrendingUp,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/constants";
import { formatCurrency, formatDate } from "@/utils";
import { useCart } from "@/stores/cart";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

import type { Id } from "@convex/_generated/dataModel";

import type {
  Order,
  CustomerAddress,
  LoyaltyAccount,
  LoyaltySettings,
  LoyaltyTransaction,
  CatalogItem,
  CustomerCollection,
} from "@/types";

// ============================================================================
// Constants
// ============================================================================

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-600",
  silver: "bg-gray-400",
  gold: "bg-yellow-500",
  platinum: "bg-purple-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green-100 text-green-800",
  out_for_delivery: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Payment pending",
  pending_verification: "Awaiting payment verification",
  paid: "Payment verified",
  failed: "Payment failed",
  refunded: "Refunded",
  rejected: "Payment not confirmed",
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  pending_verification: "text-amber-600",
  paid: "text-emerald-600",
  failed: "text-red-600",
  rejected: "text-red-600",
  refunded: "text-gray-500",
};

const LOYALTY_TYPE_LABELS: Record<string, string> = {
  earned: "Earned",
  redeemed: "Redeemed",
  expired: "Expired",
  adjusted: "Adjusted",
};

const LOYALTY_TYPE_COLORS: Record<string, string> = {
  earned: "text-emerald-600",
  redeemed: "text-orange-600",
  expired: "text-red-500",
  adjusted: "text-blue-600",
};

// ============================================================================
// Quick Stats Bar
// ============================================================================

interface QuickStatsBarProps {
  totalOrders: number;
  totalSpent: number;
  pointsBalance: number;
  memberSince: number;
}

function QuickStatsBar({ totalOrders, totalSpent, pointsBalance, memberSince }: QuickStatsBarProps) {
  const stats = [
    {
      icon: Package,
      label: "Total Orders",
      value: totalOrders.toString(),
      color: "text-blue-500",
    },
    {
      icon: CreditCard,
      label: "Total Paid",
      value: formatCurrency(totalSpent),
      color: "text-emerald-500",
    },
    {
      icon: Star,
      label: "Points Balance",
      value: pointsBalance.toString(),
      color: "text-yellow-500",
    },
    {
      icon: Calendar,
      label: "Member Since",
      value: formatDate(memberSince, "short"),
      color: "text-purple-500",
    },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/80">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight truncate">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quick Reorder
// ============================================================================

interface QuickReorderProps {
  lastOrder: Order | undefined;
  onReorder: (order: Order) => void;
}

function QuickReorder({ lastOrder, onReorder }: QuickReorderProps) {
  if (!lastOrder) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4" />
            Quick Reorder
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {lastOrder.orderNumber}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Horizontal scroll of order items */}
        <div className="-mx-1 overflow-x-auto px-1 pb-2 scrollbar-none">
          <div className="flex gap-3">
            {lastOrder.items.map((item, index) => (
              <div
                key={`${item.catalogItemId}-${item.variantName}-${index}`}
                className="flex w-24 shrink-0 flex-col items-center gap-1.5"
              >
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary/50 border border-border/40">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground/40" />
                  )}
                </div>
                <p className="w-full text-center text-[11px] font-medium leading-tight line-clamp-2">
                  {item.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.quantity}x {formatCurrency(item.unitPrice)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {lastOrder.items.length} item{lastOrder.items.length === 1 ? "" : "s"} · Total
          </span>
          <span className="text-sm font-semibold">{formatCurrency(lastOrder.total)}</span>
        </div>

        <Button
          onClick={() => onReorder(lastOrder)}
          className="w-full gap-2"
          size="sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reorder All Items
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loyalty Transactions
// ============================================================================

interface LoyaltyTransactionsProps {
  transactions: LoyaltyTransaction[] | undefined;
}

function LoyaltyTransactions({ transactions }: LoyaltyTransactionsProps) {
  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Loyalty Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            No loyalty transactions yet. Start ordering to earn points!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Loyalty Transactions
          </CardTitle>
          <Link to={ROUTES.ACCOUNT.LOYALTY}>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {transactions.slice(0, 5).map((tx) => (
            <div
              key={tx._id}
              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-xs text-muted-foreground">
                  {LOYALTY_TYPE_LABELS[tx.type] ?? tx.type} · {formatDate(tx.createdAt, "relative")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-sm font-bold ${LOYALTY_TYPE_COLORS[tx.type] ?? "text-foreground"}`}
                >
                  {tx.points > 0 ? "+" : ""}{tx.points}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  bal: {tx.balanceAfter}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Recently Viewed Items
// ============================================================================

interface RecentlyViewedProps {
  items: CatalogItem[] | undefined;
  isLoading: boolean;
}

function RecentlyViewedItems({ items, isLoading }: RecentlyViewedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Recently Viewed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 space-y-1.5">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Recently Viewed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-none">
          {items.slice(0, 4).map((item) => (
            <div
              key={item._id}
              className="group w-24 shrink-0 text-center"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-secondary/50 transition-shadow group-hover:shadow-md">
                {item.coverImage || item.thumbnail ? (
                  <img
                    src={item.thumbnail || item.coverImage}
                    alt={item.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] font-medium leading-tight line-clamp-2 transition-colors group-hover:text-primary">
                {item.name}
              </p>
              <p className="text-[10px] font-bold text-primary">
                {formatCurrency(item.price)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Dashboard Page
// ============================================================================

export default function AccountDashboardPage() {
  const { user } = useAuth();
  const { addItem } = useCart();

  const customer = useQuery(api.customers.getByAuthUser, {});
  const loyaltyAccount = useQuery(
    api.loyalty.getBalance,
    customer ? { customerId: customer._id } : "skip",
  );
  const loyaltySettings = useQuery(api.loyalty.getSettings, {});
  const tierProgress = useQuery(
    api.loyalty.getTierProgress,
    customer ? { customerId: customer._id } : "skip",
  );

  const orders = useQuery(
    api.orders.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as Order[] | undefined;

  const addresses = useQuery(
    api.addresses.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as CustomerAddress[] | undefined;

  // Loyalty transactions (last 5)
  const loyaltyTransactions = useQuery(
    api.loyalty.getTransactions,
    customer ? { customerId: customer._id } : "skip",
  ) as LoyaltyTransaction[] | undefined;

  // Recently viewed items
  const recentlyViewedCollections = useQuery(
    api.collections.getByCustomerAndType,
    customer ? { customerId: customer._id, collectionType: "recentlyViewed" } : "skip",
  ) as CustomerCollection[] | undefined;

  const recentlyViewedIds = useMemo(
    () => (recentlyViewedCollections ?? []).slice(0, 4).map((c) => c.itemId),
    [recentlyViewedCollections],
  );

  const recentlyViewedItems = useQuery(
    api.catalogItems.getByIds,
    recentlyViewedIds.length > 0
      ? { ids: recentlyViewedIds as Id<"catalogItems">[] }
      : "skip",
  ) as CatalogItem[] | undefined;

  const recentOrders = orders?.slice(0, 3) ?? [];
  const savedAddresses = addresses?.slice(0, 3) ?? [];

  // "Total Paid" = money actually collected — only verified payments count so
  // unpaid/pending/cancelled/refunded orders never inflate the number.
  const totalPaid = useMemo(
    () =>
      (orders ?? []).reduce(
        (sum, o) => (o.paymentStatus === "paid" ? sum + (o.total ?? 0) : sum),
        0,
      ),
    [orders],
  );

  // Most recent order still awaiting payment verification — surface it so the
  // customer is never left wondering what to do next.
  const pendingPaymentOrder = recentOrders.find(
    (o) =>
      o.paymentStatus === "pending_verification" &&
      (o.status === "pending" || o.status === "confirmed"),
  );

  // Quick Reorder — use the most recent delivered/completed order
  const lastOrder = useMemo(() => {
    if (!orders || orders.length === 0) return undefined;
    return orders.find((o) => o.status === "delivered") ?? orders[0];
  }, [orders]);

  // Reorder handler
  const handleReorder = useCallback(
    (order: Order) => {
      if (!order.businessUnitId) return;
      let addedCount = 0;
      for (const item of order.items) {
        addItem({
          catalogItemId: item.catalogItemId,
          itemType: item.itemType,
          businessUnitId: order.businessUnitId,
          name: item.name,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          image: item.image,
        });
        addedCount += item.quantity;
      }
      toast.success("Items added to cart", {
        description: `${addedCount} item${addedCount === 1 ? "" : "s"} from ${order.orderNumber}`,
      });
    },
    [addItem],
  );

  // Profile completion calculation
  const completionItems = [
    { label: "Name", completed: !!user?.name, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Email", completed: !!user?.email, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Phone", completed: !!customer?.phone, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Saved Address", completed: (addresses?.length ?? 0) > 0, href: ROUTES.ACCOUNT.ADDRESSES },
    { label: "First Order", completed: (customer?.totalOrders ?? 0) > 0, href: "/" },
  ];
  const completionCount = completionItems.filter((i) => i.completed).length;
  const completionPercent = Math.round((completionCount / completionItems.length) * 100);

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <QuickStatsBar
          totalOrders={customer?.totalOrders ?? 0}
          totalSpent={totalPaid}
          pointsBalance={loyaltyAccount?.pointsBalance ?? 0}
          memberSince={customer?.createdAt ?? Date.now()}
        />
      </motion.div>

      {/* Profile Completion Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profile Completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{completionPercent}% complete</span>
              <span className="font-medium">{completionCount}/{completionItems.length}</span>
            </div>
            <Progress value={completionPercent} className="h-2" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {completionItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className={item.completed ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Reorder */}
      {lastOrder && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <QuickReorder lastOrder={lastOrder} onReorder={handleReorder} />
        </motion.div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Loyalty Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4" />
                  Loyalty Points
                </CardTitle>
                {loyaltyAccount && (
                  <Badge className={`${TIER_COLORS[loyaltyAccount.tier]} text-white`}>
                    {loyaltyAccount.tier.charAt(0).toUpperCase() + loyaltyAccount.tier.slice(1)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="py-4 text-center">
                <div className="text-3xl font-bold text-primary">
                  {loyaltyAccount?.pointsBalance ?? 0}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">points available</p>
              </div>
              {tierProgress?.nextTier && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tierProgress.tier}</span>
                    <span>{tierProgress.nextTier}</span>
                  </div>
                  <Progress
                    value={
                      loyaltySettings
                        ? Math.min(
                            100,
                            tierProgress.pointsToNextTier > 0
                              ? ((loyaltyAccount?.totalEarned ?? 0) /
                                  loyaltySettings.tierThresholds[tierProgress.nextTier]) *
                                  100
                              : 100,
                          )
                        : 0
                    }
                    className="h-1.5"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    {tierProgress.pointsToNextTier} more points to {tierProgress.nextTier}
                  </p>
                </div>
              )}
              <Link to={ROUTES.ACCOUNT.LOYALTY}>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  View History <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        {/* Current Offers */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4" />
                Current Offers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Browse our latest deals and promotions.
              </p>
              <Link to="/">
                <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
                  Browse Offers <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Loyalty Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
      >
        <LoyaltyTransactions transactions={loyaltyTransactions} />
      </motion.div>

      {/* Recently Viewed Items */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <RecentlyViewedItems
          items={recentlyViewedItems}
          isLoading={recentlyViewedIds.length > 0 && recentlyViewedItems === undefined}
        />
      </motion.div>

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Recent Orders
              </CardTitle>
              {orders && orders.length > 0 && (
                <Link to={ROUTES.ACCOUNT.ORDERS}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingPaymentOrder && (
              <Link
                to={ROUTES.ACCOUNT.ORDERS}
                className="mb-3 block"
              >
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {pendingPaymentOrder.orderNumber} —{" "}
                    {formatCurrency(pendingPaymentOrder.total)} still pending.
                    Complete payment to get it moving.
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
              </Link>
            )}
            {recentOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No orders yet. Start ordering to earn loyalty points!
              </p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order._id}
                    className="flex items-center justify-between rounded-lg border border-border/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item(s)
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`${STATUS_COLORS[order.status]} text-xs`}
                      >
                        {order.status.replace(/_/g, " ")}
                      </Badge>
                      <span
                        className={cn(
                          "hidden text-xs font-medium sm:inline",
                          PAYMENT_COLORS[order.paymentStatus] ?? "",
                        )}
                      >
                        {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Saved Addresses */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Saved Addresses
              </CardTitle>
              <Link to={ROUTES.ACCOUNT.ADDRESSES}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  Manage <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {savedAddresses.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No saved addresses yet.
              </p>
            ) : (
              <div className="space-y-3">
                {savedAddresses.map((addr) => (
                  <div
                    key={addr._id}
                    className="rounded-lg border border-border/60 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{addr.label}</span>
                      {addr.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{addr.address}</p>
                    {addr.landmark && (
                      <p className="text-xs text-muted-foreground">Landmark: {addr.landmark}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
