// ============================================================================
// MB CRUNCHY - Scheduled Maintenance Operations
// Internal mutations invoked by convex/crons.ts. Keeps operational cleanup
// (expired order reservations) out of the request path.
// ============================================================================

import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { logActivity } from "./orderActivities";
import { notify } from "./notificationService";

const DEFAULT_RESERVATION_TIMEOUT_MINUTES = 60;

async function findInventoryForOrderItem(
  ctx: MutationCtx,
  catalogItemId: Id<"catalogItems">,
  variantName: string,
) {
  const items = await ctx.db
    .query("inventory")
    .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", catalogItemId))
    .filter((q) =>
      q.and(
        q.eq(q.field("variantName"), variantName),
        q.eq(q.field("deletedAt"), undefined),
      ),
    )
    .collect();

  return items[0] ?? null;
}

// ============================================================================
// Reservation Timeout Reclamation
// ============================================================================

/**
 * Cancel orders that have been stuck without payment past the reservation
 * timeout and release the stock reserved for them. Without this, an abandoned
 * checkout permanently ties up inventory and the storefront can show
 * "insufficient stock" for items that are actually on hand.
 *
 * Two order states are scanned:
 *  - "pending"  — payment was never verified. Only the reservation exists, so
 *    it is released (reservedStock reduced; on-hand stock untouched).
 *  - "confirmed" — an admin accepted the order, so on-hand stock was already
 *    deducted at confirmation. These are restored back to on-hand inventory
 *    (stockQuantity increased; reservedStock is already reduced).
 *
 * Only unpaid orders are touched (paymentStatus pending / pending_verification
 * / failed / rejected). Orders already marked paid or refunded are never
 * auto-cancelled, and delivered orders are never scanned.
 *
 * Timeout is configurable via the RESERVATION_TIMEOUT_MINUTES env var
 * (default 60 minutes). Safe to run repeatedly: restoreStock is a no-op when
 * the reservation was already released.
 */
export const cleanupExpiredReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rawTimeout = process.env.RESERVATION_TIMEOUT_MINUTES;
    const timeoutMinutes =
      rawTimeout && rawTimeout.trim() !== ""
        ? Number(rawTimeout)
        : DEFAULT_RESERVATION_TIMEOUT_MINUTES;

    // A value of 0 disables auto-cancellation (operator override).
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return { scanned: 0, cancelled: 0, releasedItems: 0 };
    }

    const cutoff = Date.now() - timeoutMinutes * 60 * 1000;
    const now = Date.now();

    const stalePredicate = (q: any) =>
      q.and(
        q.eq(q.field("deletedAt"), undefined),
        q.lt(q.field("createdAt"), cutoff),
      );

    const stalePending = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter(stalePredicate)
      .collect();

    const staleConfirmed = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .filter(stalePredicate)
      .collect();

    const staleOrders = [...stalePending, ...staleConfirmed];
    let cancelled = 0;
    let releasedItems = 0;

    for (const order of staleOrders) {
      if (
        order.paymentStatus === "paid" ||
        order.paymentStatus === "refunded"
      ) {
        continue;
      }

      // Confirmed orders already deducted on-hand stock at confirmation, so
      // the stock must be added back. Pending orders only release the
      // reservation. Mirrors the cancel/refund logic in orders.updateStatus.
      const deducted = order.status !== "pending";

      for (const item of order.items) {
        const inventory = await findInventoryForOrderItem(
          ctx,
          item.catalogItemId,
          item.variantName,
        );
        if (!inventory) continue;

        await ctx.runMutation(internal.inventory.restoreStock, {
          inventoryId: inventory._id,
          quantity: item.quantity,
          orderId: order._id,
          deducted,
        });
        releasedItems++;
      }

      await ctx.db.patch(order._id, {
        status: "cancelled",
        terminalAt: now,
        updatedAt: now,
      });

      await logActivity(ctx, {
        orderId: order._id,
        businessUnitId: order.businessUnitId,
        action: "cancelled",
        previousValue: order.status,
        newValue: "cancelled",
        actor: "system",
        visibleToCustomer: true,
      });

      await notify("ORDER_CANCELLED", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason: `Payment not completed within ${timeoutMinutes} minutes`,
      });

      cancelled++;
    }

    if (cancelled > 0) {
      console.warn(
        `[mb-maintenance] Auto-cancelled ${cancelled} stale order(s), released ${releasedItems} reservation(s)`,
      );
    }

    return { scanned: staleOrders.length, cancelled, releasedItems };
  },
});
