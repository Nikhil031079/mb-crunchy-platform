import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  Bell,
  Volume2,
  VolumeX,
  Printer,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Building2,
} from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import type { OrderStatus } from "@/types";
import { useKitchenAuth } from "@/hooks/use-kitchen-auth";
import { ROUTES } from "@/constants";
import { toast } from "sonner";

const KITCHEN_GROUPS = [
  { statuses: ["pending", "confirmed"], label: "New Orders", color: "blue", icon: AlertTriangle },
  { statuses: ["preparing"], label: "Preparing", color: "amber", icon: Clock },
  { statuses: ["ready"], label: "Ready", color: "emerald", icon: CheckCircle2 },
];

const KITCHEN_ACTIONS: Record<string, { label: string; nextStatus: string }> = {
  pending: { label: "Accept Order", nextStatus: "confirmed" },
  confirmed: { label: "Start Preparing", nextStatus: "preparing" },
  preparing: { label: "Mark Ready", nextStatus: "ready" },
  ready: { label: "Dispatch", nextStatus: "out_for_delivery" },
};

function getKitchenActionForOrder(order: any) {
  if (order.orderType === "pickup" && order.status === "ready") {
    return { label: "Mark Collected", nextStatus: "delivered" };
  }
  return KITCHEN_ACTIONS[order.status];
}

function kitchenPriorityScore(order: any) {
  let score = 0;
  if (order.orderType === "delivery") score += 3;
  if (order.status === "confirmed") score += 1;
  if (order.status === "preparing") score += 2;
  return score;
}

function kitchenStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  return labels[status] ?? status;
}

function formatElapsed(totalMinutes: number) {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function useLiveClock(intervalMs = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function KitchenDashboard() {
  const { kitchen, isAuthenticated, logout, getSessionToken } = useKitchenAuth();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const now = useLiveClock(30000);
  const updateStatusMutation = useMutation(api.orders.updateStatus);

  const allBUs = useQuery(api.businessUnits.getAll);
  
  // Get assigned business unit IDs from kitchen auth
  const assignedBuIds = kitchen?.businessUnitIds ?? [];
  
  // Query orders for each assigned business unit
  const ordersQueries = assignedBuIds.map((buId) =>
    useQuery(
      api.orders.getByBusinessUnit,
      buId ? { sessionToken: getSessionToken()!, businessUnitId: buId as any } : "skip"
    )
  );

  // Combine orders from all assigned business units
  const allOrders = useMemo(() => {
    const combined: any[] = [];
    ordersQueries.forEach((orders, index) => {
      if (orders) {
        combined.push(...orders.map((o: any) => ({ ...o, businessUnitId: assignedBuIds[index] })));
      }
    });
    return combined;
  }, [ordersQueries, assignedBuIds]);

  // Get business unit settings for display
  const buSettingsQueries = assignedBuIds.map((buId) =>
    useQuery(
      api.settings.getBusinessUnitSettings,
      buId ? { businessUnitId: buId as any } : "skip"
    )
  );

  const buSettingsMap = useMemo(() => {
    const map: Record<string, any> = {};
    assignedBuIds.forEach((buId, index) => {
      if (buSettingsQueries[index]) {
        map[buId] = buSettingsQueries[index];
      }
    });
    return map;
  }, [assignedBuIds, buSettingsQueries]);

  // Get business unit names for display
  const assignedBUNames = useMemo(() => {
    if (!allBUs) return [];
    return assignedBuIds
      .map((buId) => allBUs.find((bu: any) => bu._id === buId)?.name)
      .filter(Boolean);
  }, [allBUs, assignedBuIds]);

  // Sound notification for new orders
  useEffect(() => {
    if (!soundEnabled || !allOrders) return;
    const pendingCount = allOrders.filter((o) => o.status === "pending").length;
    if (pendingCount > 0) {
      const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAD//w==");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }
  }, [allOrders, soundEnabled, now]);

  if (!isAuthenticated) return null;

  const filteredOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders
      .filter((o) => !o.deletedAt && KITCHEN_ACTIONS[o.status])
      .sort((a, b) => kitchenPriorityScore(b) - kitchenPriorityScore(a));
  }, [allOrders]);

  const handleAdvance = async (order: any) => {
    const action = getKitchenActionForOrder(order);
    if (!action) return;

    // Check payment status for preparing
    if (action.nextStatus === "preparing" && order.paymentStatus !== "paid") {
      toast.error("Payment must be verified before preparation can begin");
      return;
    }

    try {
      const token = getSessionToken();
      if (!token) throw new Error("No session token");
      await updateStatusMutation({ sessionToken: token, id: order._id, status: action.nextStatus as OrderStatus });
      toast.success(`Order ${action.label.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    }
  };

  const handlePrint = (order: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const itemsHtml = order.items
      .map(
        (item: any) =>
          `<tr><td>${item.name}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td></tr>`
      )
      .join("");
    printWindow.document.write(`
      <html><head><title>Kitchen Ticket #${order.orderNumber}</title>
      <style>body{font-family:monospace;padding:20px;font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px}th{text-align:left}</style></head>
      <body>
        <h2>Kitchen Ticket - ${order.orderNumber}</h2>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Phone:</strong> ${order.customerPhone}</p>
        <p><strong>Type:</strong> ${order.orderType === "delivery" ? "Delivery" : "Pickup"}</p>
        <p><strong>Address:</strong> ${order.deliveryAddress ?? "N/A"}</p>
        <p><strong>Time:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
        <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        <p><strong>Total:</strong> ${formatCurrency(order.total)}</p>
        <p><strong>Notes:</strong> ${order.deliveryNotes ?? "None"}</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleRefresh = () => {
    toast.info("Refreshing...");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to={ROUTES.KITCHEN.DASHBOARD} className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
                <span className="text-xl">🍳</span>
              </span>
              <span className="font-bold text-lg">Kitchen</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {/* Assigned Business Units Indicator */}
            {assignedBUNames.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                <Building2 className="h-4 w-4" />
                <span>Assigned: {assignedBUNames.join(" + ")}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={soundEnabled ? "text-foreground" : "text-muted-foreground"}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Kitchen Columns */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {KITCHEN_GROUPS.map((group) => {
          const groupOrders = filteredOrders.filter((o) => group.statuses.includes(o.status));
          const Icon = group.icon;
          return (
            <section key={group.label} className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon className={cn("h-5 w-5", `text-${group.color}-600`)} />
                  {group.label}
                  <Badge variant="secondary" className="ml-2">
                    {groupOrders.length}
                  </Badge>
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groupOrders.map((order) => {
                  const action = getKitchenActionForOrder(order);
                  const elapsed = Math.floor((now - order.createdAt) / 60000);
                  const isCritical = elapsed >= 21;
                  const isWarning = elapsed >= 11 && elapsed < 21;
                  const isPaid = order.paymentStatus === "paid";

                  return (
                    <motion.div
                      key={order._id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={cn(
                        "relative overflow-hidden rounded-xl border p-4 transition-all hover:shadow-lg",
                        `border-${group.color}-200 bg-${group.color}-50`,
                        isCritical && "ring-2 ring-red-500",
                        isWarning && "ring-2 ring-amber-400"
                      )}
                    >
                      {/* Critical/Warning indicator */}
                      {(isCritical || isWarning) && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 text-xs font-medium">
                          <Clock className="h-3 w-3" />
                          <span className={isCritical ? "text-red-600" : "text-amber-600"}>
                            {formatElapsed(elapsed)}
                          </span>
                        </div>
                      )}

                      {/* Order Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-bold text-foreground">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">{order.customerName}</p>
                        </div>
                        <Badge variant="secondary" className={cn("shrink-0", `bg-${group.color}-100 text-${group.color}-700`)}>
                          {kitchenStatusLabel(order.status)}
                        </Badge>
                      </div>

                      {/* Order Details */}
                      <div className="space-y-1.5 text-sm mb-3">
                        <p className="text-muted-foreground">
                          {order.orderType === "delivery" ? <Truck className="inline h-3 w-3 mr-1" /> : "🏪"}{" "}
                          {order.orderType === "delivery" ? "Delivery" : "Pickup"}
                        </p>
                        {order.deliveryAddress && (
                          <p className="text-xs text-muted-foreground truncate">
                            📍 {order.deliveryAddress}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Items: {order.items.reduce((sum: number, i: any) => sum + i.quantity, 0)} | {formatCurrency(order.total)}
                        </p>
                        {!isPaid && action.nextStatus === "preparing" && (
                          <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Awaiting payment verification
                          </p>
                        )}
                      </div>

                      {/* Items */}
                      <div className="border-t pt-3 space-y-1">
                        {order.items.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                            <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                          </div>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-xs text-muted-foreground">+{order.items.length - 3} more items</p>
                        )}
                      </div>

                      {/* Action Button */}
                      {action && (
                        <Button
                          className="mt-4 w-full gap-1.5"
                          variant={action.nextStatus === "preparing" && !isPaid ? "outline" : "default"}
                          disabled={action.nextStatus === "preparing" && !isPaid}
                          onClick={() => handleAdvance(order)}
                        >
                          {action.label}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Print Ticket */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 w-full gap-1.5"
                        onClick={() => handlePrint(order)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print Ticket
                      </Button>
                    </motion.div>
                  );
                })}
                {groupOrders.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Icon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p>No {group.label.toLowerCase()}</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {/* Completed Orders (Ready for Delivery/Delivered) - collapsible */}
        <details className="border rounded-xl">
          <summary className="flex items-center justify-between p-4 cursor-pointer">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Completed Today
            </h2>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform" />
          </summary>
          <div className="px-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOrders
                .filter((o) => ["out_for_delivery", "delivered"].includes(o.status))
                .map((order) => (
                  <motion.div
                    key={order._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border bg-emerald-50 p-3 text-sm"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-mono font-bold">{order.orderNumber}</p>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                        {kitchenStatusLabel(order.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{order.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.items.reduce((sum: number, i: any) => sum + i.quantity, 0)} items · {formatCurrency(order.total)}
                    </p>
                  </motion.div>
                ))}
              {filteredOrders.filter((o) => ["out_for_delivery", "delivered"].includes(o.status)).length === 0 && (
                <p className="text-center text-muted-foreground py-8">No completed orders today</p>
              )}
            </div>
          </div>
        </details>
      </main>
    </div>
  );
}