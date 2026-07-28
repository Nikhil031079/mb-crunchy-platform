import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { STATUS_COLORS, SITE_NAME } from "@/constants";
import { formatCurrency } from "@/utils";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";

import type { OrderRecord, OrderStatus } from "./types";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Status timeline
// ---------------------------------------------------------------------------

const TIMELINE_STEPS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

function StatusTimeline({ currentStatus }: { currentStatus: OrderStatus }) {
  const isCancelled = currentStatus === "cancelled" || currentStatus === "refunded";
  const currentIndex = TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Status Timeline</h4>
      <div className="relative space-y-0">
        {TIMELINE_STEPS.map((step, index) => {
          const isCompleted = !isCancelled && currentIndex >= index;
          const isCurrent = !isCancelled && currentIndex === index;

          return (
            <div key={step} className="relative flex items-start gap-3 pb-4">
              {/* Vertical line */}
              {index < TIMELINE_STEPS.length - 1 && (
                <div className={cn("absolute left-[9px] top-5 h-full w-0.5", isCompleted ? "bg-primary" : "bg-border")} />
              )}
              {/* Dot */}
              <div className={cn("relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", isCompleted ? "border-primary bg-primary" : "border-border bg-background", isCurrent && "ring-2 ring-primary/30")}>
                {isCompleted && (
                  <div className="size-2 rounded-full bg-primary-foreground" />
                )}
              </div>
              {/* Label */}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", isCompleted ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {STATUS_LABELS[step]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {isCancelled && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-500/10 p-2">
          <div className="size-2 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">
            Order {STATUS_LABELS[currentStatus]}
          </span>
        </div>
      )}
    </div>
  );
}

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
// Print Invoice
// ---------------------------------------------------------------------------

function printInvoice(order: OrderRecord) {
  const html = `<!DOCTYPE html><html><head><title>Invoice ${order.orderNumber}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:40px;color:#1a1a1a;font-size:14px}
  h1{font-size:18px;margin:0 0 4px}
  h2{font-size:14px;margin:0 0 16px;color:#666}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:8px;text-align:left;border-bottom:1px solid #eee}
  th{font-size:12px;color:#666;text-transform:uppercase}
  .total{font-weight:bold;font-size:16px}
  .muted{color:#666}
  .right{text-align:right}
  .footer{margin-top:24px;font-size:12px;color:#999;text-align:center}
</style></head><body>
<h1>${SITE_NAME}</h1>
<h2>Invoice</h2>
<p><strong>Order:</strong> ${order.orderNumber}<br>
<strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}<br>
<strong>Type:</strong> ${order.orderType}<br>
<strong>Customer:</strong> ${order.customerName} | ${order.customerPhone}${order.customerEmail ? ` | ${order.customerEmail}` : ""}<br>
${order.deliveryAddress ? `<strong>Delivery:</strong> ${order.deliveryAddress}<br>` : ""}</p>
<table><thead><tr><th>Item</th><th>Variant</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead><tbody>
${order.items.map((i) => `<tr><td>${i.name}</td><td>${i.variantName}</td><td class="right">${i.quantity}</td><td class="right">${formatCurrency(i.unitPrice)}</td><td class="right">${formatCurrency(i.totalPrice)}</td></tr>`).join("")}
</tbody></table>
<div style="text-align:right">
<p>Subtotal: ${formatCurrency(order.subtotal)}</p>
${order.discount > 0 ? `<p class="muted">Discount: -${formatCurrency(order.discount)}</p>` : ""}
${order.deliveryFee > 0 ? `<p class="muted">Delivery: ${formatCurrency(order.deliveryFee)}</p>` : ""}
<p>Tax: ${formatCurrency(order.tax)}</p>
<p class="total">Total: ${formatCurrency(order.total)}</p>
</div>
<div class="footer">Thank you for your order!</div>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface OrderDetailDialogProps {
  open: boolean;
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ open, order, onOpenChange }: OrderDetailDialogProps) {
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
              <Button variant="outline" size="sm" onClick={() => printInvoice(order)} className="gap-1.5">
                <Printer className="size-3.5" /> Print
              </Button>
              <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[order.status])}>
                {STATUS_LABELS[order.status]}
              </Badge>
              <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[order.paymentStatus])}>
                {PAYMENT_STATUS_LABELS[order.paymentStatus]}
              </Badge>
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
              <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{order.orderType}</span></div>
            </div>
            {order.deliveryAddress && (
              <div><span className="text-muted-foreground">Address:</span> <span>{order.deliveryAddress}</span></div>
            )}
            {order.deliveryNotes && (
              <div className="rounded-md bg-muted/50 p-2"><span className="text-muted-foreground">Notes:</span> <span>{order.deliveryNotes}</span></div>
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
              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span></div>
              <div><span className="text-muted-foreground">Method:</span> <span>Razorpay</span></div>
            </div>
          </section>

          <Separator />

          {/* Status Timeline */}
          <StatusTimeline currentStatus={order.status} />

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
