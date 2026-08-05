import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { SITE_NAME } from "@/constants";
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
}

interface PaymentConfig {
  upiId?: string;
  merchantName?: string;
  whatsappNumber?: string;
}

export function PaymentPendingCard({ order, onOrderAgain }: PaymentPendingCardProps) {
  const [showQR, setShowQR] = useState(false);
  const [claimState, setClaimState] = useState<"idle" | "claiming" | "claimed">("idle");
  const [reference, setReference] = useState("");

  const claimPayment = useMutation(api.orders.claimPayment);

  const settings = useQuery(
    api.settings.getBusinessUnitSettings,
    { businessUnitId: order.businessUnitId as any },
  ) as { paymentConfig?: PaymentConfig } | null | undefined;

  const cancelled = order.status === "cancelled";
  const refunded = order.status === "refunded";
  const unpaid = order.paymentStatus === "pending_verification";
  const stillOpen = order.status === "pending" || order.status === "confirmed";
  const needsRetry = !unpaid && (order.paymentStatus === "failed" || order.paymentStatus === "rejected") && stillOpen;

  const handleClaim = useCallback(async (referenceArg?: string) => {
    if (claimState !== "idle") return;
    setClaimState("claiming");
    try {
      const res = await claimPayment({
        orderId: order._id as Id<"orders">,
        phone: order.customerPhone,
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
    return (
      <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-700 dark:text-red-300">
              {unpaid ? "Order Cancelled · Reservation Expired" : "Order Cancelled"}
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-300/80">
              {unpaid
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
  // Payment pending but work has started (preparing/ready) — honest note only
  // --------------------------------------------------------------------------
  if (unpaid && !stillOpen) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment under verification
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              We're waiting to verify your payment. Your order is safely
              reserved and will start preparing as soon as payment is confirmed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Payment pending / failed / rejected — Pay Now + I've Paid
  // --------------------------------------------------------------------------
  if (unpaid && stillOpen) {
    const paymentConfig = settings?.paymentConfig;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Payment Pending
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Your order is safely reserved. Preparation starts after payment
              verification.
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
