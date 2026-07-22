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
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils";

// UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// Order Tracking Page — phone lookup → order list → status timeline
// ============================================================================

const ORDER_STATUS_STEPS = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: Package },
  { key: "ready", label: "Ready", icon: CheckCircle2 },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
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

export default function OrderTrackingPage() {
  const [phone, setPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const orders = useQuery(
    api.orders.getByPhone,
    searchedPhone ? { phone: searchedPhone } : "skip"
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

  // ==========================================================================
  // Status Timeline
  // ==========================================================================

  function StatusTimeline({ status }: { status: string }) {
    const isCancelled = status === "cancelled" || status === "refunded";
    const currentStepIndex = ORDER_STATUS_STEPS.findIndex((s) => s.key === status);
    const isDelivered = status === "delivered";

    if (isCancelled) {
      return (
        <div className="flex items-center gap-3 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <XCircle className="h-5 w-5 text-red-600" />
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

    return (
      <div className="space-y-1">
        {ORDER_STATUS_STEPS.map((step, index) => {
          const isCompleted = index < currentStepIndex || isDelivered;
          const isCurrent = index === currentStepIndex && !isDelivered;
          const isFuture = index > currentStepIndex && !isDelivered;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isCompleted && "border-emerald-500 bg-emerald-500 text-white",
                  isCurrent && "border-primary bg-primary text-primary-foreground animate-pulse",
                  isFuture && "border-border bg-background text-muted-foreground/40"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCompleted && "text-emerald-600",
                    isCurrent && "text-primary",
                    isFuture && "text-muted-foreground/40"
                  )}
                >
                  {step.label}
                </p>
              </div>
              {isCompleted && !isFuture && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

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
              <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
                <div className="animate-pulse text-muted-foreground">
                  Searching orders...
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
                  {orders.map((order) => (
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
                              {STATUS_LABELS[order.status] ?? order.status}
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
                          <div className="grid gap-4 sm:grid-cols-2">
                            {/* Status Timeline */}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                                Order Status
                              </p>
                              <StatusTimeline status={order.status} />
                            </div>

                            {/* Order Details */}
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                                  Details
                                </p>
                                <div className="space-y-1.5 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Type</span>
                                    <span className="font-medium capitalize">
                                      {order.orderType}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Payment</span>
                                    <span
                                      className={cn(
                                        "font-medium capitalize",
                                        order.paymentStatus === "paid" && "text-emerald-600",
                                        order.paymentStatus === "pending" && "text-amber-600",
                                        order.paymentStatus === "failed" && "text-red-600"
                                      )}
                                    >
                                      {order.paymentStatus}
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

                              {/* Delivery Address */}
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
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
