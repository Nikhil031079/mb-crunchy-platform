import { useQuery } from "convex/react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { STATUS_COLORS } from "@/constants";
import { formatCurrency } from "@/utils";
import { cn } from "@/lib/utils";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminAuth } from "@/hooks/use-admin-auth";

import type { OrderRecord } from "./types";
import { STATUS_LABELS } from "./types";
import { PaymentStatusBadge, OrderTypeBadge, PrintInvoice, PrintPackingSlip, PrintKitchenTicket } from "./shared";
import { OrderNotesPanel } from "./OrderNotesPanel";
import { OrderActivityFeed } from "@/components/shared/OrderActivityFeed";

// ---------------------------------------------------------------------------
// Item type badge
// ---------------------------------------------------------------------------

function ItemTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    product: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
    combo: "border-blue-200 bg-blue-500/10 text-blue-700",
    partyPack: "border-purple-200 bg-purple-500/10 text-purple-700",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", colors[type] ?? "border-border bg-muted text-muted-foreground")}>
      {type === "partyPack" ? "Party Pack" : type}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface OrderDetailDialogProps {
  open: boolean;
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
}

const toOrderId = (id: string) => id as unknown as Id<"orders">;

export function OrderDetailDialog({ open, order, onOpenChange }: OrderDetailDialogProps) {
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken();

  const activities = useQuery(
    api.orderActivities.getByOrder,
    order && sessionToken
      ? { sessionToken, orderId: toOrderId(order.id) }
      : "skip",
  );

  if (!order) return null;

  const createdDate = new Date(order.createdAt);
  const updatedDate = new Date(order.updatedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono">{order.orderNumber}</DialogTitle>
            <div className="flex gap-2">
              <PrintInvoice order={order} />
              <PrintPackingSlip order={order} />
              <PrintKitchenTicket order={order} />
              <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[order.status])}>
                {STATUS_LABELS[order.status]}
              </Badge>
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 text-sm">
          {/* Customer Information */}
          <section className="space-y-2">
            <h4 className="font-medium text-foreground">Customer Information</h4>
            <div className="grid gap-1 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{order.customerName}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{order.customerPhone}</span></div>
              {order.customerEmail && (
                <div><span className="text-muted-foreground">Email:</span> <span>{order.customerEmail}</span></div>
              )}
              <div><span className="text-muted-foreground">Type:</span> <OrderTypeBadge type={order.orderType} /></div>
            </div>
            {order.deliveryAddress && (
              <div><span className="text-muted-foreground">Address:</span> <span>{order.deliveryAddress}</span></div>
            )}
            {order.deliveryNotes && (
              <div className="rounded-md bg-muted/50 p-2"><span className="text-muted-foreground">Delivery Notes:</span> <span>{order.deliveryNotes}</span></div>
            )}
          </section>

          <Separator />

          {/* Ordered Items */}
          <section className="space-y-3">
            <h4 className="font-medium text-foreground">Ordered Items ({order.itemCount})</h4>
            <div className="space-y-2">
              {order.items.map((item, index) => (
                <div key={index} className="flex items-center gap-3 rounded-md border p-3">
                  {item.image && (
                    <img src={item.image} alt={item.name} className="size-10 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <ItemTypeBadge type={item.itemType} />
                    </div>
                    <p className="text-xs text-muted-foreground">{item.variantName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(item.totalPrice)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Pricing Breakdown */}
          <section className="space-y-2">
            <h4 className="font-medium text-foreground">Pricing</h4>
            <div className="space-y-1 rounded-md bg-muted/50 p-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatCurrency(order.subtotal)}</span></div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount {order.offerCode && <span className="text-xs">({order.offerCode})</span>}</span>
                  <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                </div>
              )}
              {order.deliveryFee > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className="tabular-nums">{formatCurrency(order.deliveryFee)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatCurrency(order.tax)}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(order.total)}</span></div>
            </div>
          </section>

          <Separator />

          {/* Payment Information */}
          <section className="space-y-2">
            <h4 className="font-medium text-foreground">Payment</h4>
            <div className="grid gap-1 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Status:</span> <PaymentStatusBadge status={order.paymentStatus} /></div>
              <div><span className="text-muted-foreground">Method:</span> <span>Razorpay</span></div>
            </div>
          </section>

          <Separator />

          {/* Timeline & Notes */}
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-3">
              <OrderActivityFeed activities={activities} />
            </TabsContent>
            <TabsContent value="notes" className="mt-3">
              <OrderNotesPanel orderId={order.id} />
            </TabsContent>
          </Tabs>

          {/* Timestamps */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Created: {createdDate.toLocaleString()}</span>
            <span>Updated: {updatedDate.toLocaleString()}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
