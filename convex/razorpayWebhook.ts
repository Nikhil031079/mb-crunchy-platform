import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Razorpay Webhook Handler
//
// Endpoint: POST /razorpay/webhook
//
// Razorpay sends events to this URL. We verify the webhook signature
// using the Web Crypto API (available in all Convex runtimes), then
// update the MB Crunchy order.
//
// Supported events:
//   - payment.captured → order paymentStatus = "paid"
//   - payment.failed   → order paymentStatus = "failed"
// ============================================================================

// Timing-safe string comparison
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// Base64 encode
export function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================================
// Webhook event idempotency (10D — replay hardening).
//
// Razorpay webhook deliveries carry no unique delivery identifier, so the
// dedup key is derived deterministically as
//   `${eventType}:${razorpayPaymentId ?? razorpayOrderId ?? "unknown"}`.
// Payment entity ids (`pay_*`) are unique per payment attempt, so redeliveries
// of the same webhook collide while distinct events (failed-then-captured,
// two payments on one order) produce distinct keys and both process.
// ============================================================================

export function buildRazorpayEventKey(args: {
  eventType: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
}): string {
  const subject =
    args.razorpayPaymentId ?? args.razorpayOrderId ?? "unknown";
  return `${args.eventType}:${subject}`;
}

/**
 * Atomically claim a webhook event for processing. Single-transaction
 * check-then-insert on the by_event_key index: concurrent duplicate
 * deliveries serialize under Convex OCC (loser retries, observes the row,
 * reports duplicate). Survives restarts/redeploys (durable table).
 * MUST only be called after HMAC verification — never reserves on failure.
 */
export const claimWebhookEvent = internalMutation({
  args: { eventKey: v.string(), eventType: v.string() },
  handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();
    if (existing) {
      return { duplicate: true };
    }
    await ctx.db.insert("webhookEvents", {
      eventKey: args.eventKey,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
    return { duplicate: false };
  },
});

/**
 * Release a claim when downstream processing throws, so a legitimate retry
 * can establish a fresh claim instead of no-op-ing forever. Best-effort;
 * safe to call for absent keys.
 */
export const releaseWebhookEvent = internalMutation({
  args: { eventKey: v.string() },
  handler: async (ctx, args): Promise<{ released: boolean }> => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();
    if (!existing) {
      return { released: false };
    }
    await ctx.db.delete(existing._id);
    return { released: true };
  },
});



export const razorpayWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // --- Read body + signature ---
  const body = await request.text();
  const razorpaySignature = request.headers.get("x-razorpay-signature");

  if (!razorpaySignature) {
    console.error("[razorpay-webhook] Missing x-razorpay-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  // --- Verify HMAC-SHA256 signature using Web Crypto API ---
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSignature = base64Encode(signatureBuffer);

  if (!timingSafeEqual(
    encoder.encode(expectedSignature),
    encoder.encode(razorpaySignature)
  )) {
    console.error("[razorpay-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // --- Parse event ---
  let event: { event: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.error("[razorpay-webhook] Failed to parse body:", err);
    return new Response("Invalid JSON", { status: 400 });
  }

  const paymentEntity = event.payload?.payment?.entity;
  if (!paymentEntity) {
    return new Response("OK", { status: 200 });
  }

  const razorpayOrderId = paymentEntity.order_id as string | undefined;
  const razorpayPaymentId = paymentEntity.id as string | undefined;

  if (!razorpayOrderId && !razorpayPaymentId) {
    console.error("[razorpay-webhook] No order_id or payment_id in event");
    return new Response("Missing identifiers", { status: 400 });
  }

  // --- Find the MB Crunchy order ---
  let order: { _id: string; paymentStatus: string } | null = null;

  if (razorpayOrderId) {
    const orders = await ctx.runQuery(
      internal.orders.getByRazorpayOrderIdInternal,
      { razorpayOrderId }
    );
    if (orders && orders.length > 0) {
      order = orders[0];
    }
  }

  if (!order && razorpayPaymentId) {
    const orders = await ctx.runQuery(
      internal.orders.getByRazorpayPaymentIdInternal,
      { razorpayPaymentId }
    );
    if (orders && orders.length > 0) {
      order = orders[0];
    }
  }

  if (!order) {
    console.error("[razorpay-webhook] Order not found for", {
      razorpayOrderId,
      razorpayPaymentId,
    });
    return new Response("OK", { status: 200 });
  }

  // --- Handle event ---
  const eventType = event.event;

  switch (eventType) {
    case "payment.captured": {
      if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
        return new Response("OK", { status: 200 });
      }

      // 10D replay hardening: claim this delivery before processing.
      // Duplicate deliveries return success without repeating side effects.
      // A downstream throw releases the claim so legitimate retries proceed.
      const eventKey = buildRazorpayEventKey({
        eventType,
        razorpayPaymentId,
        razorpayOrderId,
      });
      const claim = await ctx.runMutation(
        internal.razorpayWebhook.claimWebhookEvent,
        { eventKey, eventType },
      );
      if (claim.duplicate) {
        return new Response("OK", { status: 200 });
      }

      try {
        await ctx.runMutation(internal.orders.finalizePaidOrder, {
          orderId: order._id as any,
          razorpayPaymentId: razorpayPaymentId ?? "",
        });
      } catch (err) {
        await ctx.runMutation(
          internal.razorpayWebhook.releaseWebhookEvent,
          { eventKey },
        );
        throw err;
      }

      console.log("[razorpay-webhook] payment.captured for order", order._id);
      break;
    }

    case "payment.failed": {
      if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
        return new Response("OK", { status: 200 });
      }

      // 10D replay hardening: same claim/release contract as above.
      const eventKey = buildRazorpayEventKey({
        eventType,
        razorpayPaymentId,
        razorpayOrderId,
      });
      const claim = await ctx.runMutation(
        internal.razorpayWebhook.claimWebhookEvent,
        { eventKey, eventType },
      );
      if (claim.duplicate) {
        return new Response("OK", { status: 200 });
      }

      try {
        await ctx.runMutation(internal.orders.failPaymentFromWebhook, {
          orderId: order._id as any,
          razorpayPaymentId: razorpayPaymentId ?? undefined,
        });
      } catch (err) {
        await ctx.runMutation(
          internal.razorpayWebhook.releaseWebhookEvent,
          { eventKey },
        );
        throw err;
      }

      console.log("[razorpay-webhook] payment.failed for order", order._id);
      break;
    }

    default:
      console.log("[razorpay-webhook] Unhandled event:", eventType);
      break;
  }

  return new Response("OK", { status: 200 });
});
