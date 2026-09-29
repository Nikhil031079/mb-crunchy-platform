import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { Package, Search, Clock, CheckCircle2, Truck, XCircle, AlertTriangle, ExternalLink, RotateCcw, ShoppingBag, CookingPot, PackageCheck, MapPin, Store } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

// ============================================================================
// 7C — LOCAL PRESENTATION MAPPING (visual only, never touches the status model)
//
// Actual order.status values (convex/schema.ts):
//   awaiting_payment | pending | confirmed | preparing | ready |
//   out_for_delivery | delivered | cancelled | refunded
// Actual paymentStatus values: pending | paid | failed | refunded
//
// The old STATUS_STEPS used ACTIVITY keys (order_created, payment_verified)
// which never equal order.status for pending/confirmed/awaiting_payment, so
// those orders rendered a fully-upcoming timeline. This progression is keyed
// by REAL order.status values. `awaiting_payment` presents at "Order Placed"
// (the order exists, so it was placed); the payment badge explains the rest.
// Payment state is NEVER merged into these steps — it gets its own badge.
// Shipment state stays in the shipment section (7D boundary).
// ============================================================================

const ORDER_PROGRESSION = [
  { status: "pending", label: "Order Placed", icon: ShoppingBag },
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "preparing", label: "Preparing", icon: CookingPot },
  { status: "ready", label: "Ready", icon: Package },
  { status: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { status: "delivered", label: "Delivered", icon: PackageCheck },
] as const;

// Real activity action -> progression-step index, for REAL per-step
// timestamps only. Payment/order-acceptance-adjacent actions are deliberately
// absent here: payment is presented separately, never merged into the order
// timeline. Steps without a matching activity show no timestamp (never faked).
const ACTIVITY_ACTION_TO_STEP: Record<string, number> = {
  order_created: 0,
  order_accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  delivered: 5,
};

// Independent payment presentation (order.paymentStatus). Mirrors the color
// semantics already used on CheckoutPage (paid emerald / failed red / else
// amber). Displayed as its own badge — never folded into order.status.
const PAYMENT_META: Record<string, { label: string; classes: string }> = {
  paid: {
    label: "Paid",
    classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  pending: {
    label: "Payment Pending",
    classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  failed: {
    label: "Payment Failed",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  refunded: {
    label: "Refunded",
    classes: "bg-muted text-muted-foreground",
  },
};

// Human-readable activity labels. Same vocabulary as the shared
// OrderActivityFeed so customer language stays consistent everywhere.
// Deterministic: unknown keys fall back to Title-Cased raw action.
const ACTIVITY_LABELS: Record<string, string> = {
  order_created: "Order Created",
  payment_pending: "Payment Pending",
  payment_verified: "Payment Verified",
  payment_failed: "Payment Failed",
  order_accepted: "Order Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refund_initiated: "Refund Initiated",
  refund_completed: "Refund Completed",
  manual_status_change: "Manual Status Change",
  inventory_reserved: "Inventory Reserved",
  inventory_released: "Inventory Released",
  note_added: "Note Added",
  note_updated: "Note Updated",
  note_deleted: "Note Deleted",
};

function toActivityLabel(action: string): string {
  const known = ACTIVITY_LABELS[action];
  if (known) return known;
  return action
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const CANCELLED_STATUSES = ["cancelled", "refunded"];

export default function OrderTrackingPage() {
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // Visual-only thumbnail fallback: indexes whose stored image URL failed
  // to load render the existing neutral tile instead. No behavior change.
  const [failedImages, setFailedImages] = useState<ReadonlySet<number>>(new Set());

  const lookup = useQuery(
    api.orders.getByPhoneAndOrderNumber,
    submitted && phone && orderNumber ? { phone, orderNumber } : "skip"
  );

  const shipmentLookup = useQuery(
    api.courier.customerShipmentTracking.getShipmentByPhoneAndOrderNumber,
    submitted && phone && orderNumber ? { phone, orderNumber } : "skip"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim() && orderNumber.trim()) {
      setSubmitted(true);
    }
  };

  // Order number format: MB- followed by 5 alphanumeric characters
  // (e.g. MB-ABC123). This is the standard format used by MB Crunchy.

  const order = lookup?.order;
  const activities = lookup?.activities ?? [];
  const shipment = shipmentLookup?.shipment;
  const trackingEvents = shipmentLookup?.trackingEvents ?? [];

  // Presentation index into ORDER_PROGRESSION. `awaiting_payment` presents at
  // step 0: the order exists, so it was placed; the payment badge (below)
  // carries the awaiting-payment meaning. Backend values untouched.
  const progressIndex = order
    ? ORDER_PROGRESSION.findIndex((s) => s.status === order.status)
    : -1;
  const presentationIndex =
    order?.status === "awaiting_payment" ? 0 : progressIndex;

  const isCancelled = order ? CANCELLED_STATUSES.includes(order.status) : false;
  const isRefundedOrder = order?.status === "refunded";

  // Earliest REAL activity timestamp per progression step (activities arrive
  // newest-first, so keep the minimum). Steps without a matching activity
  // get no timestamp — never fabricated.
  const stepTimeByIndex: Record<number, number> = {};
  for (const act of activities) {
    const idx = ACTIVITY_ACTION_TO_STEP[(act as { action: string }).action];
    if (idx === undefined) continue;
    const ts = (act as { createdAt: number }).createdAt;
    const prev = stepTimeByIndex[idx];
    if (prev === undefined || ts < prev) stepTimeByIndex[idx] = ts;
  }

  const paymentMeta = order
    ? (PAYMENT_META[order.paymentStatus] ?? {
        label: order.paymentStatus.replace(/_/g, " "),
        classes: "bg-muted text-muted-foreground",
      })
    : null;

  const currentStep =
    !isCancelled && presentationIndex >= 0
      ? ORDER_PROGRESSION[presentationIndex]
      : null;

  // Outside-area delivery quote: show an honest pending line ONLY when the
  // real flags say so. Never implies delivery progression.
  const isQuotePending =
    !!order?.deliveryQuoteRequired && order?.deliveryQuoteStatus === "pending";

  return (
    <div className="min-h-screen culinary-canvas">
      {/* Frosted breadcrumb strip — real tracking info only */}
      <div className="border-b border-white/60 bg-white/40 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-foreground">Track Order</span>
            {order && (
              <span className="ml-1 max-w-[120px] truncate rounded-full border border-culinary-outline-variant/60 bg-white/60 px-2 py-0.5 font-mono text-[10px] font-semibold backdrop-blur-md sm:max-w-[180px]">
                {order.orderNumber}
              </span>
            )}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Inner frame preserves the established single-column flow */}
        <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-culinary-heading text-2xl font-bold tracking-tight sm:text-3xl">Track Your Order</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your phone number and order number to view order status.
          </p>
        </div>

        <Card className="rounded-3xl glass-tier-1">
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-culinary-heading mb-4 text-base font-bold tracking-tight">Find your order</h2>
<form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
                  Phone Number
                </label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSubmitted(false);
                  }}
                  required
                  className="h-11"
                />
              </div>
              <div>
                <label htmlFor="orderNumber" className="mb-1.5 block text-sm font-medium">
                  Order Number
                </label>
                <Input
                  id="orderNumber"
                  type="text"
                  placeholder="e.g. MB-ABC123"
                  value={orderNumber}
                  onChange={(e) => {
                    setOrderNumber(e.target.value);
                    setSubmitted(false);
                  }}
                  required
                  className="h-11 font-mono"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Order number format: MB- followed by 5 alphanumeric characters
                  (e.g. MB-ABC123)
                </p>
              </div>
              <Button type="submit" variant="crunch" className="h-11 w-full gap-2 font-culinary-heading">
                <Search className="h-4 w-4" />
                Track Order
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lookup loading — static skeleton only (no animation, timers, or
            polling). Convex returns undefined while the query is in flight;
            query behavior itself is unchanged. */}
        {submitted && lookup === undefined && (
          <Card className="mt-6 rounded-3xl glass-tier-1" role="status" aria-label="Looking up your order">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">Looking up your order</p>
              <div className="h-11 rounded-xl bg-muted" aria-hidden="true" />
              <div className="h-11 rounded-xl bg-muted" aria-hidden="true" />
              <div className="h-11 rounded-full bg-muted" aria-hidden="true" />
            </CardContent>
          </Card>
        )}

        {submitted && lookup === null && (
          <Card className="mt-6 rounded-3xl glass-tier-1 border-amber-200/60 dark:border-amber-900/40">
            <CardContent className="flex flex-col items-center gap-4 p-5 py-8 text-center sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </span>
              <h2 className="font-culinary-heading text-xl font-bold text-amber-900 dark:text-amber-200">Order Not Found</h2>
              <p className="max-w-md text-sm text-amber-800 dark:text-amber-300/90">
                We couldn&apos;t find an order with the phone number and order number you entered.
              </p>
              <ul className="max-w-md list-inside list-disc space-y-2 text-sm text-amber-700 dark:text-amber-300/80">
                <li>
                  Verify the phone number is correct (10-digit Indian mobile number)
                </li>
                <li>
                  Verify the order number format: MB- followed by 5 alphanumeric characters
                  (e.g. MB-ABC123)
                </li>
                <li>
                  Check your order confirmation email or SMS for the correct details
                </li>
              </ul>
              <Button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-2 h-11 w-full gap-2 font-culinary-heading"
              >
                <RotateCcw className="h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {order && (
          <Card className="mt-6 overflow-hidden rounded-3xl glass-tier-1">
            {/* 7C hero — real data only: current presentation state, order
                number, placed time, order type, and an INDEPENDENT payment
                badge (payment state is never merged into order state). */}
            <CardHeader>
              <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    isCancelled
                      ? "bg-red-100 dark:bg-red-900/30"
                      : "bg-culinary-primary/10"
                  )}
                  aria-hidden="true"
                >
                  {isCancelled ? (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  ) : currentStep ? (
                    <currentStep.icon className="h-6 w-6 text-culinary-primary" />
                  ) : (
                    <Clock className="h-6 w-6 text-culinary-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Order {order.orderNumber}
                  </p>
                  <h2
                    className="font-culinary-heading text-xl font-bold tracking-tight sm:text-2xl"
                    aria-label={`Order status: ${isCancelled ? (isRefundedOrder ? "Refunded" : "Cancelled") : (currentStep?.label ?? "Processing")}`}
                  >
                    {isCancelled
                      ? isRefundedOrder
                        ? "Order Refunded"
                        : "Order Cancelled"
                      : (currentStep?.label ?? "Processing")}
                  </h2>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    Placed {formatDateTime(order.createdAt)} ·{" "}
                    {order.orderType === "delivery" ? "Delivery" : "Pickup"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      isCancelled || isRefundedOrder
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : order.status === "delivered"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    )}
                  >
                    {isCancelled
                      ? isRefundedOrder
                        ? "Refunded"
                        : "Cancelled"
                      : toActivityLabel(order.status)}
                  </span>
                  {paymentMeta && (
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        paymentMeta.classes
                      )}
                    >
                      {paymentMeta.label}
                    </span>
                  )}
                </div>
              </div>
              {isQuotePending && (
                <p className="mt-3 break-words text-xs text-muted-foreground">
                  Delivery quote pending.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-6 p-5 sm:p-6">
              {/* 7C order timeline — presentation of REAL order.status only.
                  Static states, no animation: completed (saffron), current
                  (glass highlight + ring), upcoming (muted). Per-step
                  timestamps come from real activities; steps without one
                  show no timestamp. Cancelled/refunded orders use the
                  terminal branch below instead. */}
              {!isCancelled && currentStep && (
                <ol aria-label="Order progress" className="space-y-0">
                  {ORDER_PROGRESSION.map((step, i) => {
                    const completed = i < presentationIndex;
                    const current = i === presentationIndex;
                    const Icon = step.icon;
                    const reachedAt = stepTimeByIndex[i];
                    return (
                      <li
                        key={step.status}
                        aria-current={current ? "step" : undefined}
                        className="flex items-start gap-3"
                      >
                        <div className="flex flex-col items-center" aria-hidden="true">
                          <div
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                              completed
                                ? "border-culinary-primary bg-culinary-primary text-white"
                                : current
                                  ? "border-culinary-primary bg-white text-culinary-primary ring-2 ring-culinary-primary/25 dark:bg-culinary-primary/10"
                                  : "border-border bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {i < ORDER_PROGRESSION.length - 1 && (
                            <div
                              className={cn(
                                "h-6 w-0.5",
                                i < presentationIndex
                                  ? "bg-culinary-primary/60"
                                  : "bg-border"
                              )}
                            />
                          )}
                        </div>
                        <div
                          className={cn(
                            "min-w-0 flex-1",
                            current
                              ? "rounded-xl border border-culinary-primary/25 bg-culinary-primary/5 px-3 py-2 ring-1 ring-culinary-primary/30"
                              : "px-0 py-1.5"
                          )}
                        >
                          <p
                            className={cn(
                              "break-words font-culinary-heading text-sm font-bold",
                              completed || current
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {step.label}
                          </p>
                          {reachedAt !== undefined ? (
                            <p className="mt-0.5 break-words text-xs text-muted-foreground">
                              {formatDateTime(reachedAt)}
                            </p>
                          ) : current ? (
                            <p className="mt-0.5 text-xs font-semibold text-culinary-primary-deep dark:text-culinary-primary">
                              Current status
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {isCancelled && (
                <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
                  <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-red-700 dark:text-red-300">
                      This order has been {isRefundedOrder ? "refunded" : order.status}.
                    </p>
                    {order.paymentStatus === "refunded" && (
                      <p className="mt-0.5 break-words text-xs text-red-700/80 dark:text-red-300/80">
                        Payment status: refunded.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Order contents — real items only: thumbnail when the query
                  supplies one, name, variant, quantity x unit price, and the
                  stored line total. Nothing invented. */}
              {order.items.length > 0 && (
                <section
                  aria-label="Order items"
                  className="rounded-2xl border border-border/50 bg-white/50 p-4 dark:bg-white/5"
                >
                  <h3 className="font-culinary-heading mb-1 text-sm font-bold">Your Order</h3>
                  <ul className="divide-y divide-border/50">
                    {order.items.map((item, idx) => (
                      <li
                        key={`${item.catalogItemId}-${item.variantName}-${idx}`}
                        className="flex items-start gap-3 py-3 first:pt-1 last:pb-0"
                      >
                        {item.image && !failedImages.has(idx) ? (
                          <img
                            src={item.image}
                            alt=""
                            loading="lazy"
                            onError={() =>
                              setFailedImages((prev) => new Set(prev).add(idx))
                            }
                            className="h-12 w-12 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <span
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted"
                            aria-hidden="true"
                          >
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium">{item.name}</p>
                          {item.variantName && (
                            <p className="mt-0.5 break-words text-xs text-muted-foreground">
                              {item.variantName}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {item.quantity} × ₹{item.unitPrice}
                          </p>
                        </div>
                        <p className="font-culinary-heading shrink-0 text-sm font-bold tabular-nums">
                          ₹{item.totalPrice}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Financial summary — stored values only, shown as-is. Discount
                  row only when a real discount exists (Cart precedent);
                  delivery fee only for delivery orders; tax only when charged.
                  No recomputation, no currency changes. */}
              <section
                aria-label="Order summary"
                className="rounded-2xl glass-tier-2 p-4"
              >
                <h3 className="font-culinary-heading mb-2 text-sm font-bold">Order Summary</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="tabular-nums">₹{order.subtotal}</dd>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Discount</dt>
                      <dd className="tabular-nums text-green-700 dark:text-green-400">
                        −₹{order.discount}
                      </dd>
                    </div>
                  )}
                  {order.orderType === "delivery" && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Delivery fee</dt>
                      <dd className="tabular-nums">₹{order.deliveryFee}</dd>
                    </div>
                  )}
                  {order.tax > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Tax</dt>
                      <dd className="tabular-nums">₹{order.tax}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-t border-border/60 pt-2.5">
                    <dt className="font-culinary-heading font-bold">Total</dt>
                    <dd className="font-culinary-heading text-base font-bold tabular-nums">
                      ₹{order.total}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Fulfillment — mode and area from real order flags only. The
                  customer projection carries no address fields (stripped
                  server-side), so none is shown or invented. */}
              <section
                aria-label="Fulfillment"
                className="rounded-2xl border border-border/50 bg-white/50 p-4 dark:bg-white/5"
              >
                <h3 className="font-culinary-heading mb-2 text-sm font-bold">Fulfillment</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="flex min-w-0 items-center gap-1.5 font-medium">
                      {order.orderType === "delivery" ? (
                        <Truck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="truncate">
                        {order.orderType === "delivery" ? "Delivery" : "Pickup"}
                      </span>
                    </dd>
                  </div>
                  {order.deliveryType && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Area</dt>
                      <dd className="min-w-0 truncate font-medium">
                        {order.deliveryType === "local" ? "Local delivery" : "Outside-area delivery"}
                      </dd>
                    </div>
                  )}
                  {shipment?.destinationPincode && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Pincode
                      </dt>
                      <dd className="min-w-0 truncate font-mono font-medium">
                        {shipment.destinationPincode}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Shipment Tracking (Mart Delivery Orders Only) — 7D visual
                  migration. Same data, same conditions: status badge, courier
                  and AWB only when present, tracking button only when the URL
                  exists, events in their existing chronological order. */}
              {shipment && (
                <section
                  aria-label="Shipment tracking"
                  className="rounded-2xl glass-tier-2 p-4 sm:p-5"
                >
                  <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="font-culinary-heading min-w-0 flex-1 basis-32 text-sm font-bold">
                      Shipment Tracking
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                        shipment.status === "delivered"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : shipment.status === "cancelled" || shipment.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      )}
                    >
                      {shipment.statusLabel}
                    </span>
                  </div>

                  {(shipment.courierName || shipment.awbNumber) && (
                    <dl className="divide-y divide-border/50 rounded-2xl border border-border/50 bg-white/50 text-sm dark:bg-white/5">
                      {shipment.courierName && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <dt className="shrink-0 text-muted-foreground">Courier</dt>
                          <dd className="min-w-0 truncate font-medium">
                            {shipment.courierName}
                          </dd>
                        </div>
                      )}
                      {shipment.awbNumber && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <dt className="shrink-0 text-muted-foreground">AWB</dt>
                          <dd className="font-culinary-heading min-w-0 break-all text-right text-[13px] font-bold tabular-nums">
                            {shipment.awbNumber}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {/* Tracking URL — behavior untouched */}
                  {shipment.trackingUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-10 w-full gap-2"
                      onClick={() => window.open(shipment.trackingUrl!, "_blank")}
                    >
                      <Truck className="h-4 w-4" />
                      Track Shipment
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Tracking events — compact vertical timeline in the
                      existing chronological order. The latest event reads as
                      current unless the shipment already reached a terminal
                      state (delivered/cancelled/failed); nothing invented. */}
                  {trackingEvents.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Shipment Updates
                      </h4>
                      <ol aria-label="Shipment updates" className="space-y-0">
                        {trackingEvents.map((event, idx) => {
                          const isLatest = idx === trackingEvents.length - 1;
                          const isTerminal = ["delivered", "cancelled", "failed"].includes(
                            shipment.status
                          );
                          const isCurrent = isLatest && !isTerminal;
                          return (
                            <li
                              key={event._id}
                              aria-current={isCurrent ? "step" : undefined}
                              className="flex items-start gap-2.5 text-sm"
                            >
                              <span className="flex flex-col items-center self-stretch" aria-hidden="true">
                                <span
                                  className={cn(
                                    "mt-1.5 rounded-full",
                                    isCurrent
                                      ? "h-2.5 w-2.5 bg-culinary-primary ring-2 ring-culinary-primary/30"
                                      : "h-2 w-2 bg-primary"
                                  )}
                                />
                                {!isLatest && <span className="w-px flex-1 bg-border" />}
                              </span>
                              <span className="min-w-0 flex-1 pb-3 last:pb-0">
                                <span className="block break-words font-medium">
                                  {event.statusLabel}
                                </span>
                                {event.description && (
                                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                                    {event.description}
                                  </span>
                                )}
                                {event.location && (
                                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                                    {event.location}
                                  </span>
                                )}
                                <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                                  {formatDateTime(event.eventTimestamp)}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}

                  {/* No tracking events yet */}
                  {trackingEvents.length === 0 && shipment.status === "pending" && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Shipment is being prepared. Tracking updates will appear here.
                    </p>
                  )}
                </section>
              )}

              {/* Shipment not yet created */}
              {!shipment && order.orderType === "delivery" && (
                <div className="rounded-2xl border border-border/50 bg-white/50 p-4 dark:bg-white/5">
                  <h3 className="font-culinary-heading mb-2 text-sm font-bold">Shipment Tracking</h3>
                  <p className="text-xs text-muted-foreground">
                    Shipment information will be available once your order is processed.
                  </p>
                </div>
              )}

              {/* Activity Timeline */}
              {activities.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-white/50 p-4 dark:bg-white/5">
                  <h3 className="font-culinary-heading mb-1 text-sm font-bold">Activity</h3>
                  <div className="divide-y divide-border/50">
                    {activities.map((act: any) => (
                      <div key={act._id} className="flex items-start gap-3 py-2.5 text-sm first:pt-2 last:pb-0">
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium">{toActivityLabel(act.action)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(act.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
