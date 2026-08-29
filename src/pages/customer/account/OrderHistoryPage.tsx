import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { Package, ChevronDown, ChevronUp, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { getStockStatus } from "@/components/customer/StockBadge";
import { OrderActivityFeed } from "@/components/shared/OrderActivityFeed";
import { PaymentPendingCard } from "@/components/customer/PaymentPendingCard";
import { formatCurrency } from "@/utils";
import { useCart } from "@/stores/cart";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import type { Order } from "@/types";

const STATUS_FILTERS = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

const PAYMENT_FILTERS = [
  "all",
  "paid",
  "failed",
  "refunded",
] as const;

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
  paid: "Payment verified",
  failed: "Payment failed",
  refunded: "Refunded",
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  paid: "text-emerald-600",
  failed: "text-red-600",
  refunded: "text-gray-500",
};

export default function OrderHistoryPage() {
  const customer = useQuery(api.customers.getByAuthUser, {});
  const orders = useQuery(
    api.orders.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as Order[] | undefined;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const activities = useQuery(
    api.orderActivities.getByOrderForCustomer,
    expandedOrderId
      ? { orderId: expandedOrderId as unknown as Id<"orders"> }
      : "skip"
  );

  const { addItem } = useCart();

  const expandedOrder =
    orders?.find((o) => o._id === expandedOrderId) ?? null;

  const reorderBusinessUnitId =
    expandedOrder && expandedOrder.status === "delivered"
      ? (expandedOrder.businessUnitId as Id<"businessUnits">)
      : undefined;

  const reorderCatalogItems = useQuery(
    api.catalogItems.getByBusinessUnit,
    reorderBusinessUnitId ? { businessUnitId: reorderBusinessUnitId } : "skip",
  );

  const reorderInventoryItems = useQuery(
    api.inventory.getByBusinessUnit,
    reorderBusinessUnitId ? { businessUnitId: reorderBusinessUnitId } : "skip",
  );

  const reorderAvailabilityLoading =
    reorderBusinessUnitId !== undefined &&
    (reorderCatalogItems === undefined || reorderInventoryItems === undefined);

  const filteredOrders =
    orders?.filter(
      (o) =>
        (statusFilter === "all" || o.status === statusFilter) &&
        (paymentFilter === "all" || o.paymentStatus === paymentFilter),
    ) ?? [];

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const handleReorder = useCallback(
    async (order: Order) => {
      const availableItems = order.items.filter((item) => {
        const catalogItem = reorderCatalogItems?.find(
          (c) => c._id === item.catalogItemId,
        );
        if (!catalogItem) return false;

        const itemInventory = reorderInventoryItems?.filter(
          (inv) => inv.catalogItemId === item.catalogItemId,
        );

        return (
          getStockStatus(itemInventory, item.variantName).status !==
          "out_of_stock"
        );
      });

      if (availableItems.length === 0) {
        toast.info("No items are currently available to reorder.");
        return;
      }

      for (const item of availableItems) {
        await addItem({
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

      toast.success("Items added to your cart.");
    },
    [addItem, reorderCatalogItems, reorderInventoryItems],
  );

  // "Order Again" for cancelled / expired reservations — same cart restore,
  // without availability checks (stock is re-validated at checkout).
  const handleOrderAgain = useCallback(
    async (order: Order) => {
      for (const item of order.items) {
        await addItem({
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
      toast.success("Items added to your cart.", {
        description: `${order.orderNumber} — ready to check out.`,
      });
    },
    [addItem],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Filters */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize text-xs"
              >
                {status === "all" ? "All" : status.replace(/_/g, " ")}
              </Button>
            ))}
          </div>

          {/* Payment Filters */}
          <div className="flex flex-wrap gap-2">
            {PAYMENT_FILTERS.map((payment) => (
              <Button
                key={payment}
                variant={paymentFilter === payment ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentFilter(payment)}
                className="capitalize text-xs"
              >
                {payment === "all" ? "All payments" : payment.replace(/_/g, " ")}
              </Button>
            ))}
          </div>

          <Separator />

          {/* Orders List */}
          {orders === undefined ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {orders?.length === 0
                ? "You haven't placed any orders yet."
                : "No orders match this filter."}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrderId === order._id;
                return (
                  <div
                    key={order._id}
                    className="rounded-lg border border-border/60 overflow-hidden"
                  >
                    {/* Order Header */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/30"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(order._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(order._id);
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                          {order.items.length} item(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={`${STATUS_COLORS[order.status]} text-xs`}
                        >
                          {order.status.replace(/_/g, " ")}
                        </Badge>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            PAYMENT_COLORS[order.paymentStatus] ?? "",
                          )}
                        >
                          {PAYMENT_LABELS[order.paymentStatus] ??
                            order.paymentStatus}
                        </span>
                        <span className="text-sm font-medium">
                          {formatCurrency(order.total)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="border-t border-border/60 p-3 space-y-3 bg-secondary/20">
                        {/* Items */}
                        <div className="space-y-2">
                          {order.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {item.name} ({item.variantName}) × {item.quantity}
                              </span>
                              <span>{formatCurrency(item.totalPrice)}</span>
                            </div>
                          ))}
                        </div>
                        <Separator />
                        {/* Pricing */}
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatCurrency(order.subtotal)}</span>
                          </div>
                          {order.discount > 0 && (
                            <div className="flex justify-between text-emerald-600">
                              <span>Discount</span>
                              <span>-{formatCurrency(order.discount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Delivery</span>
                            <span>{formatCurrency(order.deliveryFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax</span>
                            <span>{formatCurrency(order.tax)}</span>
                          </div>
                          <div className="flex justify-between font-bold pt-1">
                            <span>Total</span>
                            <span>{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                        {/* Delivery Address */}
                        {order.deliveryAddress && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Delivery: </span>
                            {order.deliveryAddress}
                          </div>
                        )}
                        {/* Reorder */}
                        {order.status === "delivered" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={reorderAvailabilityLoading}
                            onClick={() => handleReorder(order)}
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            Buy Again
                          </Button>
                        )}

                        {/* Payment pending / continuation */}
                        {(order.paymentStatus === "failed" ||
                          order.status === "cancelled" ||
                          order.status === "refunded") && (
                          <PaymentPendingCard
                            order={order}
                            phone={customer?.phone}
                            onOrderAgain={handleOrderAgain}
                          />
                        )}

                        <Separator />

                        {/* Activity Timeline */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Activity Timeline
                          </p>
                          <OrderActivityFeed
                            activities={activities}
                            emptyTitle="No activity yet"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
