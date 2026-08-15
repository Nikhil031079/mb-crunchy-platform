import { useQuery, useMutation } from "convex/react";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { STATUS_COLORS } from "@/constants";
import { formatCurrency } from "@/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminAuth } from "@/hooks/use-admin-auth";

import type { OrderRecord } from "./types";
import { STATUS_LABELS, DELIVERY_TYPE_LABELS, DELIVERY_QUOTE_STATUS_LABELS, DELIVERY_QUOTE_STATUS_COLORS } from "./types";
import { getPaymentMethodLabel } from "@/lib/payment";
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
  focusQuoteSection?: boolean;
}

const toOrderId = (id: string) => id as unknown as Id<"orders">;

export function OrderDetailDialog({ open, order, onOpenChange, focusQuoteSection }: OrderDetailDialogProps) {
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken();

  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const quoteAmountRef = useRef<HTMLInputElement>(null);

  const updateDeliveryQuote = useMutation(api.orders.updateDeliveryQuote);

  // Auto-focus the quote amount input when opened via "Enter Quote"
  useEffect(() => {
    if (open && focusQuoteSection) {
      // Small delay to allow dialog animation to complete
      const timer = setTimeout(() => {
        quoteAmountRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, focusQuoteSection]);

  const activities = useQuery(
    api.orderActivities.getByOrder,
    order && sessionToken
      ? { sessionToken, orderId: toOrderId(order.id) }
      : "skip",
  );

  if (!order) return null;

  const createdDate = new Date(order.createdAt);
  const updatedDate = new Date(order.updatedAt);
  const isOutsideArea = order.deliveryType === "outside_area" && order.deliveryQuoteRequired;
  const quotePending = isOutsideArea && (order.deliveryQuoteStatus === "pending" || order.deliveryQuoteStatus === "quoted");

  const handleQuote = async () => {
    if (!sessionToken) return;
    const amount = parseFloat(quoteAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", { description: "Enter a valid delivery charge." });
      return;
    }
    setIsQuoting(true);
    try {
      await updateDeliveryQuote({
        sessionToken,
        orderId: toOrderId(order.id),
        deliveryQuoteAmount: amount,
        deliveryQuoteNotes: quoteNotes.trim() || undefined,
      });
      toast.success("Delivery quote sent", { description: `₹${amount} delivery charge set.` });
      setQuoteAmount("");
      setQuoteNotes("");
    } catch (err) {
      toast.error("Failed to send quote", { description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setIsQuoting(false);
    }
  };

  // WhatsApp link for admin to contact customer
  const whatsappPhone = order.customerPhone.replace(/[^0-9]/g, "");
  const isQuotePending = isOutsideArea && order.deliveryQuoteStatus === "pending";
  const isQuoted = isOutsideArea && order.deliveryQuoteStatus === "quoted";
  const whatsappMsg = isQuotePending
    ? encodeURIComponent(
        `Hi ${order.customerName},\n\nThis is MB Crunchy regarding your outside-area delivery request.\n\nOrder: ${order.orderNumber}\nOrder value: ${formatCurrency(order.subtotal - order.discount)}\nDelivery charge: Quote pending\n\nWe are checking delivery availability for your location. We will confirm the delivery charge shortly.\n\nThank you,\nMB Crunchy`
      )
    : isQuoted
    ? encodeURIComponent(
        `Hi ${order.customerName},\n\nYour MB Crunchy outside-area delivery quote is ready.\n\nOrder: ${order.orderNumber}\nOrder value: ${formatCurrency(order.subtotal - order.discount)}\nDelivery charge: ${formatCurrency(order.deliveryQuoteAmount ?? 0)}\nTotal payable: ${formatCurrency(order.total)}\n\nPlease open your order tracking page to accept the delivery quote and proceed with payment.\n\nThank you,\nMB Crunchy`
      )
    : encodeURIComponent(
        `Hi ${order.customerName},\n\nThis is MB Crunchy regarding your order ${order.orderNumber}.\n\nOrder value: ${formatCurrency(order.subtotal - order.discount)}\nTotal: ${formatCurrency(order.total)}\n\nThank you,\nMB Crunchy`
      );

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
              {isOutsideArea && order.deliveryQuoteStatus && (
                <Badge variant="outline" className={cn("text-xs", DELIVERY_QUOTE_STATUS_COLORS[order.deliveryQuoteStatus])}>
                  {DELIVERY_QUOTE_STATUS_LABELS[order.deliveryQuoteStatus]}
                </Badge>
              )}
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
              {order.deliveryType && (
                <div><span className="text-muted-foreground">Delivery:</span> <span className="font-medium">{DELIVERY_TYPE_LABELS[order.deliveryType] ?? order.deliveryType}</span></div>
              )}
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
              {isOutsideArea && quotePending ? (
                <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className="tabular-nums text-amber-600">Not quoted</span></div>
              ) : order.deliveryFee > 0 ? (
                <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className="tabular-nums">{formatCurrency(order.deliveryFee)}</span></div>
              ) : null}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatCurrency(order.tax)}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(order.total)}</span></div>
            </div>
          </section>

          {/* Delivery Quote Entry (admin) */}
          {isOutsideArea && quotePending && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="font-medium text-foreground">Enter Delivery Quote</h4>
                <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  Determine the courier/delivery cost for this location and enter it below. The customer will be notified and can accept or decline.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="quote-amount" className="text-xs">Delivery charge (₹)</Label>
                    <Input
                      ref={quoteAmountRef}
                      id="quote-amount"
                      type="number"
                      min="1"
                      step="1"
                      value={quoteAmount}
                      onChange={(e) => setQuoteAmount(e.target.value)}
                      placeholder="e.g. 250"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="quote-notes" className="text-xs">Notes (optional)</Label>
                    <Input
                      id="quote-notes"
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      placeholder="e.g. Uber/Ola/Porter"
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={handleQuote} disabled={isQuoting || !quoteAmount}>
                  {isQuoting ? "Sending..." : "Send Quote to Customer"}
                </Button>
              </section>
            </>
          )}

          <Separator />

          {/* WhatsApp + Payment */}
          <section className="space-y-2">
            <h4 className="font-medium text-foreground">Actions</h4>
            <div className="flex flex-wrap gap-2">
              {whatsappPhone && (
                <a
                  href={`https://wa.me/${whatsappPhone}?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  WhatsApp Customer
                </a>
              )}
            </div>
          </section>

          <Separator />

          {/* Payment Information */}
          <section className="space-y-2">
            <h4 className="font-medium text-foreground">Payment</h4>
            <div className="grid gap-1 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Status:</span> <PaymentStatusBadge status={order.paymentStatus} /></div>
              <div><span className="text-muted-foreground">Method:</span> <span>{getPaymentMethodLabel(order.paymentMethod)}</span></div>
              {order.paymentReference && (
                <div><span className="text-muted-foreground">UPI Reference:</span> <span className="font-mono">{order.paymentReference}</span></div>
              )}
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
