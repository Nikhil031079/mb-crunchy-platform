import { useCallback, useRef } from "react";

// ============================================================================
// useRazorpay — opens Razorpay checkout and returns payment response
// ============================================================================

interface RazorpayPaymentArgs {
  amount: number;
  currency?: string;
  name: string;
  description?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Pre-fill contact with phone (Razorpay expects this as "contact") */
}

interface RazorpayPaymentResult {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;

export function useRazorpay() {
  const processingRef = useRef(false);

  const openCheckout = useCallback(
    (args: RazorpayPaymentArgs): Promise<RazorpayPaymentResult> => {
      if (!RAZORPAY_KEY_ID) {
        return Promise.reject(
          new Error("Payment is not configured. Please contact support to enable payments.")
        );
      }

      if (typeof window.Razorpay === "undefined") {
        return Promise.reject(
          new Error("Payment gateway is loading. Please try again in a moment.")
        );
      }

      if (processingRef.current) {
        return Promise.reject(new Error("A payment is already in progress."));
      }

      return new Promise((resolve, reject) => {
        processingRef.current = true;

        const options: RazorpayOptions = {
          key: RAZORPAY_KEY_ID,
          amount: Math.round(args.amount * 100), // Razorpay expects paise
          currency: args.currency ?? "INR",
          name: args.name,
          description: args.description ?? "Order Payment",
          handler: (response: RazorpayResponse) => {
            processingRef.current = false;
            resolve(response);
          },
          prefill: {
            name: args.customerName,
            contact: args.customerPhone,
            email: args.customerEmail,
          },
          theme: {
            color: "#f97316", // Primary orange
          },
          modal: {
            ondismiss: () => {
              processingRef.current = false;
              reject(new Error("Payment cancelled."));
            },
          },
        };

        try {
          const rzp = new window.Razorpay(options);
          rzp.on("payment.failed", (response) => {
            processingRef.current = false;
            reject(new Error(response.error.description || "Payment failed."));
          });
          rzp.open();
        } catch (err) {
          processingRef.current = false;
          reject(err);
        }
      });
    },
    []
  );

  return { openCheckout, isProcessing: processingRef.current };
}
