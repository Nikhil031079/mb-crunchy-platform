import { useState } from "react";
import { useQuery } from "convex/react";
import { Package, Search, Clock, CheckCircle2, Truck, XCircle, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

const STATUS_STEPS = [
  { key: "order_created", label: "Order Placed", icon: Clock },
  { key: "payment_verified", label: "Payment Confirmed", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: Package },
  { key: "ready", label: "Ready", icon: CheckCircle2 },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const CANCELLED_STATUSES = ["cancelled", "refunded"];

export default function OrderTrackingPage() {
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);

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

  const currentStepIndex = order
    ? STATUS_STEPS.findIndex((s) => s.key === order.status)
    : -1;

  const isCancelled = order ? CANCELLED_STATUSES.includes(order.status) : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Track Your Order</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your phone number and order number to view order status.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
<form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="phone" className="mb-1 block text-sm font-medium">
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
                />
              </div>
              <div>
                <label htmlFor="orderNumber" className="mb-1 block text-sm font-medium">
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
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Order number format: MB- followed by 5 alphanumeric characters
                  (e.g. MB-ABC123)
                </p>
              </div>
              <Button type="submit" className="w-full gap-2">
                <Search className="h-4 w-4" />
                Track Order
              </Button>
            </form>
          </CardContent>
        </Card>

        {submitted && lookup === null && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <h2 className="text-xl font-bold text-amber-900">Order Not Found</h2>
              <p className="text-sm text-amber-800 text-center max-w-md">
                We couldn't find an order with the phone number and order number you entered.
              </p>
              <ul className="list-disc list-inside text-sm text-amber-700 text-center space-y-2 max-w-md">
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
                className="mt-4 w-full gap-2"
              >
                <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {order && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Order {order.orderNumber}</span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    isCancelled
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : order.status === "delivered"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  )}
                >
                  {isCancelled ? "Cancelled" : order.status.replace(/_/g, " ")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress Steps */}
              {!isCancelled && (
                <div className="space-y-0">
                  {STATUS_STEPS.map((step, i) => {
                    const isCompleted = i <= currentStepIndex && currentStepIndex >= 0;
                    const isCurrent = i === currentStepIndex;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                              isCompleted
                                ? "border-green-500 bg-green-500 text-white"
                                : isCurrent
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {i < STATUS_STEPS.length - 1 && (
                            <div
                              className={cn(
                                "w-0.5 h-6",
                                isCompleted && i < currentStepIndex
                                  ? "bg-green-500"
                                  : "bg-muted-foreground/30"
                              )}
                            />
                          )}
                        </div>
                        <div className="pt-1">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              isCompleted ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {step.label}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    This order has been {order.status}.
                  </p>
                </div>
              )}

              {/* Order Summary */}
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 text-sm font-semibold">Order Details</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium">{order.orderType === "delivery" ? "Delivery" : "Pickup"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="font-medium">₹{order.total}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Placed</dt>
                    <dd>{formatDateTime(order.createdAt)}</dd>
                  </div>
                </dl>
              </div>

              {/* Shipment Tracking (Mart Delivery Orders Only) */}
              {shipment && (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-semibold">Shipment Tracking</h3>
                  
                  {/* Shipment Status */}
                  <div className="mb-4 flex items-center gap-2">
                    <div
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        shipment.status === "delivered"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : shipment.status === "cancelled" || shipment.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      )}
                    >
                      {shipment.statusLabel}
                    </div>
                    {shipment.courierName && (
                      <span className="text-sm text-muted-foreground">
                        via {shipment.courierName}
                      </span>
                    )}
                  </div>

                  {/* AWB Number */}
                  {shipment.awbNumber && (
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">AWB Number</span>
                      <span className="font-mono font-medium">{shipment.awbNumber}</span>
                    </div>
                  )}

                  {/* Tracking URL */}
                  {shipment.trackingUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => window.open(shipment.trackingUrl!, "_blank")}
                    >
                      <Truck className="h-4 w-4" />
                      Track Shipment
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Tracking Timeline */}
                  {trackingEvents.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                        Shipment Updates
                      </h4>
                      <div className="space-y-2">
                        {trackingEvents.map((event) => (
                          <div
                            key={event._id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <div>
                              <p className="font-medium">{event.statusLabel}</p>
                              {event.description && (
                                <p className="text-xs text-muted-foreground">
                                  {event.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(event.eventTimestamp)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No tracking events yet */}
                  {trackingEvents.length === 0 && shipment.status === "pending" && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Shipment is being prepared. Tracking updates will appear here.
                    </p>
                  )}
                </div>
              )}

              {/* Shipment not yet created */}
              {!shipment && order.orderType === "delivery" && (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 text-sm font-semibold">Shipment Tracking</h3>
                  <p className="text-xs text-muted-foreground">
                    Shipment information will be available once your order is processed.
                  </p>
                </div>
              )}

              {/* Activity Timeline */}
              {activities.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Activity</h3>
                  <div className="space-y-3">
                    {activities.map((act: any) => (
                      <div key={act._id} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div>
                          <p className="font-medium">{act.action.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">
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
  );
}
