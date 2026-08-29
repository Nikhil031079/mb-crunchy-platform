import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageCircle,
  RefreshCcw,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { ROUTES } from "@/constants";
import { formatCurrency, formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import type { Order } from "@/types";

// ============================================================================
// PaymentPendingCard — customer-facing payment continuation.
//
// Renders the right state for an order whose payment is not yet verified:
//   - Cancelled / refunded
//   - Outside-area quote pending / quoted (delivery quote, not payment)
//   - Quote accepted awaiting payment (Razorpay Pay Now)
//   - Awaiting payment (Razorpay Pay Now)
//   - Failed payment retry (Razorpay Pay Now)
//   - Return null for all other states
// ============================================================================

interface PaymentPendingCardProps {
  order: Order;
  onOrderAgain: (order: Order) => void;
  phone?: string;
}

interface PaymentConfig {
  upiId?: string;
  merchantName?: string;
  whatsappNumber?: string;
}

export function PaymentPendingCard({ order, onOrderAgain, phone }: PaymentPendingCardProps) {
  const acceptDeliveryQuote = useMutation(api.orders.acceptDeliveryQuote);
  const rejectDeliveryQuote = useMutation(api.orders.rejectDeliveryQuote);
  const [quoteAction, setQuoteAction] = useState<"idle" | "accepting" | "rejecting">("idle");

  const settings = useQuery(
    api.settings.getBusinessUnitSettings,
    { businessUnitId: order.businessUnitId as any },
  ) as { paymentConfig?: PaymentConfig } | null | undefined;

  const cancelled = order.status === "cancelled";
  const refunded = order.status === "refunded";
  const isAwaitingPayment = order.status === "awaiting_payment";
  const needsRetry =
    order.paymentStatus === "failed" && (order.status === "pending" || order.status === "confirmed");

  // Outside-area delivery quote states
  const isOutsideArea = order.deliveryQuoteRequired === true;
  const quotePending = isOutsideArea && order.deliveryQuoteStatus === "pending";
  const quoteQuoted = isOutsideArea && order.deliveryQuoteStatus === "quoted";
  const quoteAccepted = isOutsideArea && order.deliveryQuoteStatus === "accepted";
  const quoteRejected = isOutsideArea && order.deliveryQuoteStatus === "rejected";

  // --------------------------------------------------------------------------
  // Reservation expired / cancelled / refunded
  // --------------------------------------------------------------------------
  if (cancelled || refunded) {
    // Check if this was an outside-area order with quote rejected
    if (quoteRejected) {
      return (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                Delivery Quote Declined
              </p>
              <p className="mt-1 text-sm text-amber-600/90 dark:text-amber-300/80">
                You declined the delivery quote. This order has been cancelled.
                You can contact us if you&apos;d like to discuss another delivery option.
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => onOrderAgain(order)}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Order Again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-700 dark:text-red-300">
              {isAwaitingPayment ? "Order Cancelled \u00B7 Reservation Expired" : "Order Cancelled"}
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-300/80">
              {isAwaitingPayment
                ? "Payment wasn't completed in time, so this reservation was released. Your items are no longer reserved."
                : refunded
                ? "This order was refunded."
                : "This order was cancelled."}
            </p>
            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => onOrderAgain(order)}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Order Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Outside-area: Delivery quote pending — admin hasn't quoted yet
  // --------------------------------------------------------------------------
  if (quotePending) {
    const waPhone = (settings?.paymentConfig?.whatsappNumber ?? "").replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `Hi MB Crunchy,\nI have requested outside-area delivery.\n\nOrder: ${order.orderNumber}\nOrder value: ${formatCurrency(order.subtotal - order.discount)}\n\nPlease check delivery availability and confirm the delivery charge.`
    );
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Delivery Quote Pending
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              We&apos;re preparing a delivery quote for your location. You&apos;ll be contacted on WhatsApp with the delivery charge.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Order Number</dt>
                <dd className="font-mono font-medium text-amber-900 dark:text-amber-100">{order.orderNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Order Subtotal</dt>
                <dd className="font-semibold text-amber-900 dark:text-amber-100">{formatCurrency(order.subtotal - order.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Delivery</dt>
                <dd className="text-amber-900 dark:text-amber-100">To be confirmed</dd>
              </div>
            </dl>
            {waPhone && (
              <div className="mt-3">
                <a
                  href={`https://wa.me/${waPhone}?text=${msg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat on WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Outside-area: Quote received — customer can accept or decline
  // --------------------------------------------------------------------------
  if (quoteQuoted) {
    const handleAccept = async () => {
      if (quoteAction !== "idle") return;
      setQuoteAction("accepting");
      try {
        await acceptDeliveryQuote({
          orderId: order._id as Id<"orders">,
          phone: phone || order.customerPhone,
        });
        toast.success("Quote accepted!", {
          description: "Proceed to payment to complete your order.",
        });
      } catch (err) {
        toast.error("Could not accept quote", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setQuoteAction("idle");
      }
    };

    const handleReject = async () => {
      if (quoteAction !== "idle") return;
      setQuoteAction("rejecting");
      try {
        await rejectDeliveryQuote({
          orderId: order._id as Id<"orders">,
          phone: phone || order.customerPhone,
        });
        toast.success("Quote declined", {
          description: "Your order has been cancelled.",
        });
      } catch (err) {
        toast.error("Could not decline quote", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setQuoteAction("idle");
      }
    };

    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-blue-950/30">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-blue-800 dark:text-blue-200">
              Delivery Quote Ready
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              We&apos;ve confirmed the delivery charge for your location.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-blue-700/80 dark:text-blue-300/70">Order Subtotal</dt>
                <dd className="font-medium text-blue-900 dark:text-blue-100">{formatCurrency(order.subtotal - order.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-blue-700/80 dark:text-blue-300/70">Delivery Charge</dt>
                <dd className="font-semibold text-blue-900 dark:text-blue-100">{formatCurrency(order.deliveryQuoteAmount ?? 0)}</dd>
              </div>
              {order.deliveryQuoteNotes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-blue-700/80 dark:text-blue-300/70">Note</dt>
                  <dd className="text-blue-900 dark:text-blue-100">{order.deliveryQuoteNotes}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-blue-200/60 dark:border-blue-800/40 pt-1.5">
                <dt className="font-semibold text-blue-800 dark:text-blue-200">Total</dt>
                <dd className="font-bold text-blue-900 dark:text-blue-100">{formatCurrency(order.total)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-blue-600/80 dark:text-blue-300/70">
              Delivery charge confirmed for your location. Accept to proceed with payment.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={handleAccept} disabled={quoteAction !== "idle"}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {quoteAction === "accepting" ? "Accepting..." : `Accept & Pay ${formatCurrency(order.total)}`}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={handleReject} disabled={quoteAction !== "idle"}>
                <XCircle className="h-3.5 w-3.5" />
                {quoteAction === "rejecting" ? "Declining..." : "Decline"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Outside-area: Quote accepted but payment not yet made — Razorpay Pay Now
  // --------------------------------------------------------------------------
  if (isAwaitingPayment && isOutsideArea && quoteAccepted) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-blue-950/30">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-blue-800 dark:text-blue-200">
              Quote Accepted — Complete Payment
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              You accepted the delivery quote. Complete payment to confirm your order.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-blue-700/80 dark:text-blue-300/70">Order Subtotal</dt>
                <dd className="font-medium text-blue-900 dark:text-blue-100">{formatCurrency(order.subtotal - order.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-blue-700/80 dark:text-blue-300/70">Delivery</dt>
                <dd className="font-semibold text-blue-900 dark:text-blue-100">{formatCurrency(order.deliveryQuoteAmount ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-blue-200/60 dark:border-blue-800/40 pt-1.5">
                <dt className="font-semibold text-blue-800 dark:text-blue-200">Total to Pay</dt>
                <dd className="font-bold text-blue-900 dark:text-blue-100">{formatCurrency(order.total)}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => toast.info("Payment via Razorpay coming soon")}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Pay Now
              </Button>
            </div>

            <p className="mt-2 text-xs text-blue-600/80 dark:text-blue-300/70">
              Complete payment to confirm your order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // awaiting_payment — Razorpay Pay Now
  // --------------------------------------------------------------------------
  if (isAwaitingPayment) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment Not Completed
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Your order is reserved for {formatCurrency(order.total)}. Complete the payment to continue.
            </p>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Order Number</dt>
                <dd className="font-mono font-medium text-amber-900 dark:text-amber-100">
                  {order.orderNumber}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Amount</dt>
                <dd className="font-semibold text-amber-900 dark:text-amber-100">
                  {formatCurrency(order.total)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-amber-700/80 dark:text-amber-300/70">Created</dt>
                <dd className="text-amber-900 dark:text-amber-100">
                  {formatDateTime(order.createdAt)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => toast.info("Payment via Razorpay coming soon")}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Pay Now
              </Button>
            </div>

            <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/70">
              Complete payment to confirm your order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Failed payment — offer a retry
  // --------------------------------------------------------------------------
  if (needsRetry) {
    return (
      <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-700 dark:text-red-300">
              Payment failed
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-300/80">
              The payment didn&apos;t go through. Please try again.
            </p>

            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => toast.info("Payment via Razorpay coming soon")}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Pay Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
