"use node";

// ============================================================================
// MB CRUNCHY - Razorpay Server-Side Integration
//
// All Razorpay API calls happen here (Convex actions). The Razorpay Key
// Secret never leaves the server. The browser receives only the Key ID
// and the server-created Order ID.
// ============================================================================

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return { keyId, keySecret };
}

function getRazorpayBaseUrl(): string {
  return "https://api.razorpay.com/v1";
}

// Timing-safe string comparison to prevent timing attacks on signature verification.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// createOrder — Server-side Razorpay Order creation
//
// Called by the browser after MB Crunchy order is created. Returns the
// Razorpay order_id for the frontend to pass to Razorpay Checkout.
//
// The amount is derived from the SERVER-VALIDATED MB Crunchy order total,
// not from any client-supplied value.
// ---------------------------------------------------------------------------

export const createOrder = action({
  args: {
    orderId: v.id("orders"),
    amount: v.number(), // in paise — must match server-validated total
  },
  handler: async (ctx, args): Promise<{ razorpayOrderId: string; keyId: string }> => {
    const { keyId, keySecret } = getRazorpayCredentials();

    // Fetch the MB Crunchy order to get the authoritative amount.
    // This is a read-only query via the action's ctx — safe.
    const order = await ctx.runQuery(internal.orders.getByIdInternal, {
      orderId: args.orderId,
    });

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify the amount matches the server-validated total.
    const serverAmountInPaise = Math.round(order.total * 100);
    if (serverAmountInPaise !== args.amount) {
      throw new Error(
        `Amount mismatch: expected ${serverAmountInPaise} paise, got ${args.amount} paise`
      );
    }

    // Create Razorpay Order via REST API.
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`${getRazorpayBaseUrl()}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: serverAmountInPaise,
        currency: "INR",
        receipt: order.orderNumber,
        notes: {
          mbCrunchyOrderId: order._id,
          orderNumber: order.orderNumber,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[razorpay] createOrder failed:", response.status, errorBody);
      throw new Error(`Razorpay order creation failed: ${response.status}`);
    }

    const razorpayOrder = await response.json();

    // Store the Razorpay Order ID on the MB Crunchy order.
    await ctx.runMutation(internal.orders.updateRazorpayOrderId, {
      orderId: args.orderId,
      razorpayOrderId: razorpayOrder.id,
    });

    return {
      razorpayOrderId: razorpayOrder.id,
      keyId,
    };
  },
});

// ---------------------------------------------------------------------------
// verifyPayment — Server-side signature verification
//
// Called by the browser after Razorpay Checkout returns. Verifies the
// HMAC-SHA256 signature using the server-side Key Secret.
// ---------------------------------------------------------------------------

export const verifyPayment = action({
  args: {
    orderId: v.id("orders"),
    razorpayPaymentId: v.string(),
    razorpayOrderId: v.string(),
    razorpaySignature: v.string(),
  },
  handler: async (ctx, args): Promise<{ verified: boolean }> => {
    const { keySecret } = getRazorpayCredentials();

    // Fetch the MB Crunchy order to get the stored Razorpay Order ID.
    const order = await ctx.runQuery(internal.orders.getByIdInternal, {
      orderId: args.orderId,
    });

    if (!order) {
      throw new Error("Order not found");
    }

    // Use the STORED razorpayOrderId, not the one from the browser.
    const storedRazorpayOrderId = order.razorpayOrderId;
    if (!storedRazorpayOrderId) {
      throw new Error("No Razorpay Order ID stored for this order");
    }

    // Verify the Razorpay Order ID matches.
    if (storedRazorpayOrderId !== args.razorpayOrderId) {
      console.error("[razorpay] verifyPayment: order ID mismatch", {
        stored: storedRazorpayOrderId,
        submitted: args.razorpayOrderId,
      });
      return { verified: false };
    }

    // Verify HMAC-SHA256 signature.
    // Razorpay signature = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
    const crypto = await import("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
      .digest("hex");

    const verified = timingSafeEqual(expectedSignature, args.razorpaySignature);

    if (verified) {
      // Signature valid — finalize the order (idempotent, safe for
      // concurrent webhook arrival).
      await ctx.runMutation(
        internal.orders.finalizePaidOrder,
        {
          orderId: args.orderId,
          razorpayPaymentId: args.razorpayPaymentId,
          razorpaySignature: args.razorpaySignature,
        }
      );
    } else {
      console.error("[razorpay] verifyPayment: signature mismatch", {
        orderId: args.orderId,
        razorpayOrderId: args.razorpayOrderId,
      });
    }

    return { verified };
  },
});

// ---------------------------------------------------------------------------
// getPaymentsForOrder — Server-side Razorpay payment lookup
//
// Called by the cron pre-cleanup check to verify whether a Razorpay order
// has been paid before cancelling a stale awaiting_payment order.
// ---------------------------------------------------------------------------

export const getPaymentsForOrder = internalAction({
  args: {
    razorpayOrderId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ items: Array<{ id: string; status: string }> } | null> => {
    const { keyId, keySecret } = getRazorpayCredentials();
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetch(
      `${getRazorpayBaseUrl()}/orders/${args.razorpayOrderId}/payments`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    if (!response.ok) {
      console.error(
        "[razorpay] getPaymentsForOrder failed:",
        response.status,
      );
      return null;
    }

    return await response.json();
  },
});

// ---------------------------------------------------------------------------
// getPublicKey — Returns the Razorpay Key ID for the frontend.
// ---------------------------------------------------------------------------

export const getPublicKey = action({
  args: {},
  handler: async (): Promise<{ keyId: string | null }> => {
    const keyId = process.env.RAZORPAY_KEY_ID ?? null;
    return { keyId };
  },
});
