import { useCallback, useState } from "react";
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

import { SITE_NAME, ROUTES } from "@/constants";
import { formatCurrency, formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { PaymentQR } from "@/components/customer/PaymentQR";

import type { Order } from "@/types";

// ============================================================================
// PaymentPendingCard — customer-facing payment continuation.
//
// Renders the right state for an order whose payment is not yet verified:
//   - Payment Pending  -> Pay Now (reopens the same QR flow) + I've Paid
//   - Claim submitted  -> honest "we're verifying" message
//   - In preparation   -> "payment under verification" note (no pay actions)
//   - Failed/Rejected  -> retry with Pay Now
//   - Reservation gone -> Order Cancelled / Reservation Expired + Order Again
//
// Payment is only ever confirmed by an admin; "I've Paid" records a claim via
// api.orders.claimPayment, which is idempotent and never creates a new order.
// ============================================================================

interface PaymentPendingCardProps {
  order: Order;
  onOrderAgain: (order: Order) => void;
  /**
   * Phone number of the customer who placed the order. The sanitized,
   * customer-facing order projection intentionally strips `customerPhone`, so
   * the caller supplies it from the verified source (tracking form / profile).
   */
  phone?: string;
}

interface PaymentConfig {
  upiId?: string;
  merchantName?: string;
  whatsappNumber?: string;
}

export function PaymentPendingCard({ order, onOrderAgain, phone }: PaymentPendingCardProps) {
  const [showQR, setShowQR] = useState(false);
  const [claimState, setClaimState] = useState<"idle" | "claiming" | "claimed">("idle");
  const [reference, setReference] = useState("");

  const claimPayment = useMutation(api.orders.claimPayment);
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
  const isPendingVerification = order.status === "pending" && order.paymentStatus === "pending_verification";
  const isWorkStartedUnpaid =
    (order.status === "preparing" ||
      order.status === "ready" ||
      order.status === "out_for_delivery" ||
      order.status === "delivered") &&
    order.paymentStatus === "pending_verification";
  const needsRetry =
    (order.paymentStatus === "failed" || order.paymentStatus === "rejected") &&
    (order.status === "pending" || order.status === "confirmed");

  // Outside-area delivery quote states
  const isOutsideArea = order.deliveryQuoteRequired === true;
  const quotePending = isOutsideArea && order.deliveryQuoteStatus === "pending";
  const quoteQuoted = isOutsideArea && order.deliveryQuoteStatus === "quoted";
  const quoteAccepted = isOutsideArea && order.deliveryQuoteStatus === "accepted";
  const quoteRejected = isOutsideArea && order.deliveryQuoteStatus === "rejected";

  const handleClaim = useCallback(async (referenceArg?: string) => {
    if (claimState !== "idle") return;
    setClaimState("claiming");
    try {
      const res = await claimPayment({
        orderId: order._id as Id<"orders">,
        phone: phone || order.customerPhone,
        reference: referenceArg?.trim() || undefined,
      });
      if (res.outcome === "claimed" || res.outcome === "already_claimed") {
        setClaimState("claimed");
        toast.success("Payment claim received", {
          description: "We'll verify your payment and start preparing your order shortly.",
        });
      } else if (res.outcome === "already_paid") {
        toast.success("Payment already verified", {
          description: "This order is confirmed — we're on it!",
        });
      } else if (res.outcome === "expired") {
        toast.error("Reservation expired", {
          description: "This order was cancelled. You can place a new one.",
        });
      } else if (res.outcome === "quote_not_accepted") {
        toast.error("Delivery quote pending", {
          description: "Please wait for the delivery quote before making payment.",
        });
      } else {
        toast.info("Payment still pending", {
          description: "We'll update this order as soon as your payment is verified.",
        });
      }
    } catch (err) {
      toast.error("Could not submit payment claim", {
        description: err instanceof Error ? err.message : "Please try again or contact support.",
      });
    } finally {
      setClaimState("idle");
    }
  }, [claimState, claimPayment, order]);

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
  // Payment pending but work has started (preparing/ready) — honest note only
  // --------------------------------------------------------------------------
  if (isWorkStartedUnpaid) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment under verification
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              We&apos;re waiting to verify your payment. Your order is safely
              reserved and will start preparing as soon as payment is confirmed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Outside-area: Quote accepted but payment not yet made — show payment prompt
  // with Pay Now + I've Paid actions (mirrors the awaiting_payment UI)
  // --------------------------------------------------------------------------
  if (isPendingVerification && isOutsideArea && quoteAccepted) {
    const paymentConfig = settings?.paymentConfig;
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

            <div className="mt-3 space-y-2">
              <div>
                <label
                  htmlFor="card-utr-reference-accepted"
                  className="block text-xs font-medium text-blue-800 dark:text-blue-200"
                >
                  UPI Reference (UTR){" "}
                  <span className="text-blue-700/70 dark:text-blue-300/60">— optional</span>
                </label>
                <input
                  id="card-utr-reference-accepted"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="mt-1 w-full rounded-lg border border-blue-300/60 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[10px] text-blue-700/70 dark:text-blue-300/60">
                  Found in your UPI app after paying. It helps us verify your payment faster.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setShowQR(true)}>
                <CreditCard className="h-3.5 w-3.5" />
                Pay Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => handleClaim(reference)}
                disabled={claimState !== "idle"}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {claimState === "claiming"
                  ? "Submitting…"
                  : claimState === "claimed"
                    ? "Claim Received"
                    : "I've Paid"}
              </Button>
            </div>

            <p
              className={cn(
                "mt-2 text-xs",
                claimState === "claimed"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-blue-600/80 dark:text-blue-300/70",
              )}
            >
              {claimState === "claimed"
                ? "Payment claim received — we're verifying it and will update this order as soon as it's confirmed."
                : "Just paid? Let us know and we'll verify it for you."}
            </p>
          </div>
        </div>

        {showQR && (
          <PaymentQR
            upiId={paymentConfig?.upiId ?? ""}
            merchantName={paymentConfig?.merchantName ?? SITE_NAME}
            amount={order.total}
            orderNumber={order.orderNumber}
            whatsappNumber={paymentConfig?.whatsappNumber}
            initialReference={reference}
            onPaid={(ref) => {
              setShowQR(false);
              handleClaim(ref || reference);
            }}
            onWhatsApp={
              paymentConfig?.whatsappNumber
                ? () => {
                    const phone = (paymentConfig.whatsappNumber ?? "").replace(/[^0-9]/g, "");
                    const msg = encodeURIComponent(
                      `Hi! I've placed order #${order.orderNumber} for ${formatCurrency(order.total)}. Please confirm my payment.`,
                    );
                    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                  }
                : undefined
            }
            onClose={() => {
              setShowQR(false);
              toast.info("Payment pending", {
                description:
                  "Your order is reserved. Pay now or complete it later from Track Order.",
              });
            }}
          />
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // awaiting_payment — Pay Now + I've Paid (customer hasn't claimed payment yet)
  // --------------------------------------------------------------------------
  if (isAwaitingPayment) {
    const paymentConfig = settings?.paymentConfig;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment Not Completed
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Your order is reserved for {formatCurrency(order.total)}. Complete the UPI payment to continue.
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

            <div className="mt-3 space-y-2">
              <div>
                <label
                  htmlFor="card-utr-reference"
                  className="block text-xs font-medium text-amber-800 dark:text-amber-200"
                >
                  UPI Reference (UTR){" "}
                  <span className="text-amber-700/70 dark:text-amber-300/60">— optional</span>
                </label>
                <input
                  id="card-utr-reference"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="mt-1 w-full rounded-lg border border-amber-300/60 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[10px] text-amber-700/70 dark:text-amber-300/60">
                  Found in your UPI app after paying. It helps us verify your payment faster.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setShowQR(true)}>
                <CreditCard className="h-3.5 w-3.5" />
                Pay Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => handleClaim(reference)}
                disabled={claimState !== "idle"}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {claimState === "claiming"
                  ? "Submitting…"
                  : claimState === "claimed"
                    ? "Claim Received"
                    : "I've Paid"}
              </Button>
            </div>

            <p
              className={cn(
                "mt-2 text-xs",
                claimState === "claimed"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700/80 dark:text-amber-300/70",
              )}
            >
              {claimState === "claimed"
                ? "Payment claim received — we're verifying it and will update this order as soon as it's confirmed."
                : "Just paid? Let us know and we'll verify it for you."}
            </p>
          </div>
        </div>

        {showQR && (
          <PaymentQR
            upiId={paymentConfig?.upiId ?? ""}
            merchantName={paymentConfig?.merchantName ?? SITE_NAME}
            amount={order.total}
            orderNumber={order.orderNumber}
            whatsappNumber={paymentConfig?.whatsappNumber}
            initialReference={reference}
            onPaid={(ref) => {
              setShowQR(false);
              handleClaim(ref || reference);
            }}
            onWhatsApp={
              paymentConfig?.whatsappNumber
                ? () => {
                    const phone = (paymentConfig.whatsappNumber ?? "").replace(/[^0-9]/g, "");
                    const msg = encodeURIComponent(
                      `Hi! I've placed order #${order.orderNumber} for ${formatCurrency(order.total)}. Please confirm my payment.`,
                    );
                    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                  }
                : undefined
            }
            onClose={() => {
              setShowQR(false);
              toast.info("Payment pending", {
                description:
                  "Your order is reserved. Pay now or complete it later from Track Order.",
              });
            }}
          />
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // pending_verification — Customer has submitted "I've Paid"
  // --------------------------------------------------------------------------
  if (isPendingVerification) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment Submitted for Verification
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              We've received your payment claim. MB Crunchy will verify your payment shortly.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 gap-1.5"
              asChild
            >
              <Link to={ROUTES.TRACK_ORDER}>
                Track Order
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Failed / rejected payment — offer a retry
  // --------------------------------------------------------------------------
  if (needsRetry) {
    const paymentConfig = settings?.paymentConfig;
    return (
      <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-700 dark:text-red-300">
              Payment {order.paymentStatus === "rejected" ? "was not confirmed" : "failed"}
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-300/80">
              {order.paymentStatus === "rejected"
                ? "We couldn't match a payment for this order. Please complete payment to keep it moving."
                : "The payment didn't go through. Please try again."}
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <label
                  htmlFor="retry-utr-reference"
                  className="block text-xs font-medium text-red-700 dark:text-red-300"
                >
                  UPI Reference (UTR){" "}
                  <span className="text-red-600/70 dark:text-red-300/60">— optional</span>
                </label>
                <input
                  id="retry-utr-reference"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="mt-1 w-full rounded-lg border border-red-300/60 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[10px] text-red-600/70 dark:text-red-300/60">
                  Found in your UPI app after paying. It helps us verify your payment faster.
                </p>
              </div>
            </div>

            <Button size="sm" className="mt-3 gap-1.5" onClick={() => setShowQR(true)}>
              <CreditCard className="h-3.5 w-3.5" />
              Pay Now
            </Button>
          </div>
        </div>

        {showQR && (
          <PaymentQR
            upiId={paymentConfig?.upiId ?? ""}
            merchantName={paymentConfig?.merchantName ?? SITE_NAME}
            amount={order.total}
            orderNumber={order.orderNumber}
            whatsappNumber={paymentConfig?.whatsappNumber}
            initialReference={reference}
            onPaid={(ref) => {
              setShowQR(false);
              handleClaim(ref || reference);
            }}
            onWhatsApp={
              paymentConfig?.whatsappNumber
                ? () => {
                    const phone = (paymentConfig.whatsappNumber ?? "").replace(/[^0-9]/g, "");
                    const msg = encodeURIComponent(
                      `Hi! I've placed order #${order.orderNumber} for ${formatCurrency(order.total)}. Please confirm my payment.`,
                    );
                    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                  }
                : undefined
            }
            onClose={() => setShowQR(false)}
          />
        )}
      </div>
    );
  }

  return null;
}
