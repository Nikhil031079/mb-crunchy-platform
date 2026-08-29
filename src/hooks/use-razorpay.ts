import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// Razorpay — Server-validated Standard Checkout
//
// Flow:
//   1. createOrder (server) → Razorpay Order ID
//   2. Open Razorpay Checkout (browser)
//   3. verifyPayment (server) → signature verification
//   4. Returns success / failure
//
// The Key Secret never leaves the server. The browser receives only the
// Key ID and the server-created Order ID.
// ============================================================================

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;

interface RazorpayCheckoutArgs {
  /** MB Crunchy order ID (created before Razorpay checkout opens). */
  orderId: Id<"orders">;
  /** Amount in rupees — server recomputes from its own records, not from this. */
  amount: number;
  /** Customer pre-fill. */
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Business name shown in Razorpay checkout. */
  businessName: string;
  /** Convex action for creating Razorpay order (from api.razorpay.createOrder). */
  createRazorpayOrder: (args: { orderId: Id<"orders">; amount: number }) => Promise<{
    razorpayOrderId: string;
    keyId: string;
  }>;
  /** Convex action for verifying payment (from api.razorpay.verifyPayment). */
  verifyRazorpayPayment: (args: {
    orderId: Id<"orders">;
    razorpayPaymentId: string;
    razorpayOrderId: string;
    razorpaySignature: string;
  }) => Promise<{ verified: boolean }>;
}

export interface RazorpayCheckoutResult {
  success: boolean;
  error?: string;
}

/**
 * Opens Razorpay Standard Checkout for an already-created MB Crunchy order.
 * Call this AFTER `orders.create` succeeds.
 */
export async function openRazorpayCheckout(
  args: RazorpayCheckoutArgs
): Promise<RazorpayCheckoutResult> {
  // --- Guards ---
  if (!RAZORPAY_KEY_ID) {
    return { success: false, error: "Payment is not configured. Please contact support." };
  }
  if (typeof window.Razorpay === "undefined") {
    return { success: false, error: "Payment gateway is loading. Please try again." };
  }

  try {
    // Step 1: Create Razorpay Order (server-side).
    const amountInPaise = Math.round(args.amount * 100);
    const { razorpayOrderId } = await args.createRazorpayOrder({
      orderId: args.orderId,
      amount: amountInPaise,
    });

    // Step 2: Open Razorpay Checkout (browser).
    const razorpayResponse = await openRazorpayModal({
      keyId: RAZORPAY_KEY_ID,
      orderId: razorpayOrderId,
      amount: amountInPaise,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      businessName: args.businessName,
    });

    // Step 3: Verify payment signature (server-side).
    const { verified } = await args.verifyRazorpayPayment({
      orderId: args.orderId,
      razorpayPaymentId: razorpayResponse.razorpay_payment_id,
      razorpayOrderId: razorpayResponse.razorpay_order_id,
      razorpaySignature: razorpayResponse.razorpay_signature,
    });

    if (!verified) {
      return { success: false, error: "Payment verification failed. Please contact support." };
    }

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Payment failed. Please try again.";
    // "Payment cancelled" means user dismissed the modal — not an error to display.
    if (message === "Payment cancelled.") {
      return { success: false, error: undefined };
    }
    return { success: false, error: message };
  }
}

// ============================================================================
// Helpers
// ============================================================================

interface RazorpayModalArgs {
  keyId: string;
  orderId: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  businessName: string;
}

function openRazorpayModal(args: RazorpayModalArgs): Promise<{
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}> {
  return new Promise((resolve, reject) => {
    const options: RazorpayOptions = {
      key: args.keyId,
      amount: args.amount,
      currency: "INR",
      name: args.businessName,
      description: "Order Payment",
      order_id: args.orderId,
      handler: (response: RazorpayResponse) => {
        if (response.razorpay_payment_id && response.razorpay_signature) {
          resolve({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id ?? args.orderId,
            razorpay_signature: response.razorpay_signature,
          });
        } else {
          reject(new Error("Incomplete payment response."));
        }
      },
      prefill: {
        name: args.customerName,
        contact: args.customerPhone,
        email: args.customerEmail,
      },
      theme: {
        color: "#f97316",
      },
      modal: {
        ondismiss: () => {
          reject(new Error("Payment cancelled."));
        },
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        // Do not reject here.
        // Razorpay Checkout keeps the modal open and allows the customer to retry.
        // If the customer retries successfully, the handler callback resolves
        // the existing Promise.
        // If the customer closes the checkout, ondismiss will reject the Promise.
      });
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });
}
