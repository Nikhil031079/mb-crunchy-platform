import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Search,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ArrowLeft,
  MapPin,
  Phone,
  ChevronRight,
  CalendarClock,
  Store,
  Tag,
  CreditCard,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { OrderActivityFeed } from "@/components/shared/OrderActivityFeed";
import { PaymentPendingCard } from "@/components/customer/PaymentPendingCard";
import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/utils";
import { useCart } from "@/stores/cart";

// UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

import type { Order, OrderStatus, OrderType } from "@/types";

// ============================================================================
// Order Tracking Page — phone lookup → order list → status timeline
// ============================================================================

const ORDER_STATUS_STEPS = [
  { key: "pending", label: "Order Placed", icon: Clock, color: "bg-blue-500" },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2, color: "bg-amber-500" },
  { key: "preparing", label: "Preparing", icon: Package, color: "bg-orange-500" },
  { key: "ready", label: "Ready", icon: CheckCircle2, color: "bg-emerald-500" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck, color: "bg-purple-500" },
  { key: "delivered", label: "Delivered", icon: CheckCircle2, color: "bg-emerald-600" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-500/10 text-blue-600 border-blue-200",
  confirmed: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  preparing: "bg-amber-500/10 text-amber-600 border-amber-200",
  ready: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  out_for_delivery: "bg-purple-500/10 text-purple-600 border-purple-200",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  cancelled: "bg-red-500/10 text-red-600 border-red-200",
  refunded: "bg-gray-500/10 text-gray-600 border-gray-200",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pending",
  pending_verification: "Pending Verification",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  rejected: "Rejected",
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  pending_verification: "text-amber-600",
  paid: "text-emerald-600",
  failed: "text-red-600",
  rejected: "text-red-600",
  refunded: "text-gray-500",
};

// ============================================================================
// Tracking helpers
// ============================================================================

// Plain-language status label. Pickup orders skip the delivery leg, so "Ready"
// becomes "Ready for Pickup" and "Delivered" becomes "Collected".
function getStatusLabel(status: string, orderType: OrderType): string {
  if (orderType === "pickup") {
    if (status === "ready") return "Ready for Pickup";
    if (status === "delivered") return "Collected";
  }
  return STATUS_LABELS[status] ?? status;
}

// Step map for the order progress flow. When payment is still unverified the
// "Order Placed / Confirmed" milestones are replaced with an honest payment
// map — Payment Pending → Payment Verification — so the customer always sees
// exactly where they are and what's left to do.
function getTrackingSteps(orderType: OrderType, paymentStatus?: string) {
  const base =
    orderType === "pickup"
      ? ORDER_STATUS_STEPS.filter((s) => s.key !== "out_for_delivery").map((s) =>
          s.key === "ready"
            ? { ...s, label: "Ready for Pickup" }
            : s.key === "delivered"
              ? { ...s, label: "Collected" }
              : s,
        )
      : ORDER_STATUS_STEPS;

  const unpaid =
    paymentStatus === "pending_verification" || paymentStatus === "pending";

  if (!unpaid) return base;

  const paymentSteps = [
    { key: "payment_pending", label: "Payment Pending", icon: CreditCard, color: "bg-amber-500" },
    { key: "payment_verification", label: "Payment Verification", icon: BadgeCheck, color: "bg-emerald-500" },
  ] as const;

  return [...paymentSteps, ...base.filter((s) => s.key !== "pending" && s.key !== "confirmed")];
}

function StatusProgressFlow({
  status,
  orderType,
  paymentStatus,
}: {
  status: OrderStatus;
  orderType: OrderType;
  paymentStatus?: string;
}) {
  const isCancelled = status === "cancelled" || status === "refunded";

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200/60 bg-red-50/50 p-4 dark:bg-red-900/20">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30">
          <XCircle className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-red-600">
            {status === "cancelled" ? "Order Cancelled" : "Order Refunded"}
          </p>
          <p className="text-xs text-muted-foreground">
            This order was {status === "cancelled" ? "cancelled" : "refunded"}.
          </p>
        </div>
      </div>
    );
  }

  const steps = getTrackingSteps(orderType, paymentStatus);
  const unpaid =
    paymentStatus === "pending_verification" || paymentStatus === "pending";
  // While payment is unverified the current step is "Payment Pending" (the
  // customer's action). Once verified, progress flows by order status.
  const currentKey = unpaid ? "payment_pending" : status;
  const currentStepIndex = steps.findIndex((s) => s.key === currentKey);
  const isDelivered = status === "delivered";

  return (
    <ol>
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex || isDelivered;
        const isCurrent = index === currentStepIndex && !isDelivered;
        const isFuture = !isCompleted && !isCurrent;
        const Icon = step.icon;

        return (
          <li key={step.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5",
                  isCompleted ? "bg-emerald-500/60" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                isCompleted && cn("text-white", step.color),
                isCurrent && cn("text-white", step.color, "ring-4 ring-primary/15 animate-pulse"),
                isFuture && "border-2 border-border bg-background text-muted-foreground/40"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={cn(
                  "text-sm",
                  isCompleted && "font-medium text-foreground",
                  isCurrent && "font-semibold text-foreground",
                  isFuture && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </p>
              {isCurrent && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.key === "ready" && orderType === "pickup"
                    ? "Waiting for customer"
                    : "Current status"}
                </p>
              )}
            </div>
            {isCompleted && (
              <CheckCircle2 className="h-4 w-4 shrink-0 self-center text-emerald-500" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TrackingSummary({
  order,
  businessUnitName,
}: {
  order: Order;
  businessUnitName?: string;
}) {
  const isCancelled = order.status === "cancelled" || order.status === "refunded";
  const steps = getTrackingSteps(order.orderType, order.paymentStatus);
  const unpaid =
    order.paymentStatus === "pending_verification" || order.paymentStatus === "pending";
  const currentKey = unpaid ? "payment_pending" : order.status;
  const currentStepIndex = steps.findIndex((s) => s.key === currentKey);
  const completedSteps =
    order.status === "delivered"
      ? steps.length
      : currentStepIndex >= 0
        ? currentStepIndex + 1
        : 0;
  const progressPct =
    steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const lastUpdated = order.updatedAt ?? order.createdAt;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Current Status
            </p>
            <Badge
              variant="outline"
              className={cn(
                "mt-1.5 capitalize",
                STATUS_COLORS[order.status] ?? ""
              )}
            >
              {getStatusLabel(order.status, order.orderType)}
            </Badge>
          </div>
          {!isCancelled && steps.length > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Estimated Progress
              </p>
              <p className="mt-1.5 text-sm font-semibold">
                {completedSteps} of {steps.length} steps · {progressPct}%
              </p>
            </div>
          )}
        </div>

        {!isCancelled && steps.length > 0 && (
          <Progress value={progressPct} className="mt-3 h-2" />
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="truncate font-medium">{formatDateTime(lastUpdated)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Business Unit</p>
              <p className="truncate font-medium">{businessUnitName ?? "—"}</p>
            </div>
          </div>
          <div className="col-span-2 flex items-start gap-2 sm:col-span-1">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Order Type</p>
              <p className="capitalize font-medium">{order.orderType}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrderTrackingPage() {
  const [phone, setPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { addItem } = useCart();

  const orders = useQuery(
    api.orders.getByPhone,
    searchedPhone ? { phone: searchedPhone } : "skip"
  );

  const businessUnits = useQuery(
    api.businessUnits.getAll,
    selectedOrderId ? {} : "skip"
  );

  useEffect(() => {
    document.title = `Track Order | ${SITE_NAME}`;
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = phone.trim().replace(/[\s\-()]/g, "");
      if (!cleaned || cleaned.length < 7) {
        toast.error("Please enter a valid phone number");
        return;
      }
      setSearchedPhone(cleaned);
      setSelectedOrderId(null);
    },
    [phone]
  );

  const selectedOrder = orders?.find((o) => o._id === selectedOrderId);

  const activities = useQuery(
    api.orderActivities.getByOrderForCustomer,
    selectedOrder ? { orderId: selectedOrder._id } : "skip"
  );

  // Re-add a previous order's items to the cart so the customer can order again
  // (e.g. after a reservation expired). Stock is validated again at checkout.
  const handleOrderAgain = useCallback(
    (order: Order) => {
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
      }
      toast.success("Items added to your cart", {
        description: `${order.orderNumber} — ready to check out.`,
      });
    },
    [addItem]
  );

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <Link
            to={ROUTES.HOME}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Track Your Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the phone number you used to place your order.
          </p>
        </motion.div>

        {/* Phone Search Form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-border/60 bg-card p-6 mb-6"
        >
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="phone" className="sr-only">
                Phone Number
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button type="submit">
              <Search className="mr-1.5 h-4 w-4" />
              Search
            </Button>
          </form>
        </motion.div>

        {/* Results */}
        {searchedPhone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            {orders === undefined ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Searching orders...
                </p>
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card p-12 text-center space-y-3">
                <Package className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No orders found for {searchedPhone}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Check the phone number or try a different one.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Found {orders.length} order{orders.length !== 1 ? "s" : ""} for{" "}
                  <span className="font-medium text-foreground">{searchedPhone}</span>
                </p>

                {/* Order List */}
                <div className="space-y-3">
                  {orders.map((order) => {
                    const businessUnitName = businessUnits?.find(
                      (bu) => bu._id === order.businessUnitId
                    )?.name;
                    return (
                    <button
                      key={order._id}
                      onClick={() =>
                        setSelectedOrderId(
                          selectedOrderId === order._id ? null : order._id
                        )
                      }
                      className={cn(
                        "w-full rounded-xl border bg-card p-4 text-left transition-all hover:shadow-sm",
                        selectedOrderId === order._id
                          ? "border-primary ring-1 ring-primary/20"
                          : "border-border/60 hover:border-border"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">
                              {order.orderNumber}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                STATUS_COLORS[order.status] ?? ""
                              )}
                            >
                              {getStatusLabel(order.status, order.orderType)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {formatCurrency(order.total)}
                          </span>
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              selectedOrderId === order._id && "rotate-90"
                            )}
                          />
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {selectedOrderId === order._id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-4 pt-4 border-t border-border/60"
                        >
                          {/* Payment pending / continuation */}
                          {(order.paymentStatus === "pending_verification" ||
                            order.paymentStatus === "failed" ||
                            order.paymentStatus === "rejected" ||
                            order.status === "cancelled" ||
                            order.status === "refunded") && (
                            <div className="mb-5">
                              <PaymentPendingCard
                                order={order}
                                onOrderAgain={handleOrderAgain}
                              />
                            </div>
                          )}

                          {/* Tracking Summary */}
                          <TrackingSummary
                            order={order}
                            businessUnitName={businessUnitName}
                          />

                          {/* Progress Flow */}
                          <div className="mt-5">
                            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                              Order Progress
                            </p>
                            <StatusProgressFlow
                              status={order.status}
                              orderType={order.orderType}
                              paymentStatus={order.paymentStatus}
                            />
                          </div>

                          {/* Details */}
                          <div className="mt-5 grid gap-5 sm:grid-cols-2">
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                                  Details
                                </p>
                                <div className="space-y-1.5 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Payment</span>
                                    <span
                                      className={cn(
                                        "font-medium capitalize",
                                        PAYMENT_COLORS[order.paymentStatus] ?? ""
                                      )}
                                    >
                                      {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Items</span>
                                    <span className="font-medium">
                                      {order.items.length}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Items */}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                                  Items
                                </p>
                                <div className="space-y-1">
                                  {order.items.map((item, i) => (
                                    <div
                                      key={i}
                                      className="flex justify-between text-xs"
                                    >
                                      <span className="text-muted-foreground truncate">
                                        {item.quantity}x {item.name} ({item.variantName})
                                      </span>
                                      <span className="font-medium shrink-0 ml-2">
                                        {formatCurrency(item.totalPrice)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div>
                              {order.deliveryAddress && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                                    Delivery Address
                                  </p>
                                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                    <span>{order.deliveryAddress}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Activity Timeline */}
                          <div className="mt-5 pt-5 border-t border-border/60">
                            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                              Activity Timeline
                            </p>
                            <OrderActivityFeed activities={activities} />
                          </div>
                        </motion.div>
                      )}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
