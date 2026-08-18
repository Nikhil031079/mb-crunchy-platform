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

    const staleAwaitingPayment = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
      .filter(stalePredicate)
      .collect();

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

    const staleOrders = [...staleAwaitingPayment, ...stalePending, ...staleConfirmed];
    let cancelled = 0;
    let releasedItems = 0;

    for (const order of staleOrders) {
      if (
        order.paymentStatus === "paid" ||
        order.paymentStatus === "refunded"
      ) {
        continue;
      }

      // Skip orders already in a terminal state (already cancelled by a
      // previous cleanup run or by manual admin action).
      if (order.status === "cancelled" || order.status === "refunded") {
        continue;
      }

      // Confirmed orders already deducted on-hand stock at confirmation, so
      // the stock must be added back. Pending and awaiting_payment orders only
      // release the reservation (stock was never deducted from on-hand).
      // Mirrors the cancel/refund logic in orders.updateStatus.
      const deducted = order.status === "confirmed";

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

      // Reverse coupon usage if the order had a consumed coupon.
      // The coupon is consumed exactly when inventory is reserved (logged as
      // an "inventory_reserved" activity). For local orders this happens at
      // orders.create; for outside-area orders at claimPayment. Checking for
      // this activity is the authoritative signal that usage was incremented.
      if (order.offerId) {
        const reservedActivity = await ctx.db
          .query("orderActivities")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .filter((q) => q.eq(q.field("action"), "inventory_reserved"))
          .first();

        if (reservedActivity) {
          await ctx.runMutation(internal.offers.decrementUsage, { id: order.offerId });
        }
      }

      // Reverse loyalty points if they were redeemed during order creation.
      // Look up the loyalty redemption transaction for this order and restore
      // the points balance.
      if (order.customerId) {
        const loyaltyTxn = await ctx.db
          .query("loyaltyTransactions")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .filter((q) => q.eq(q.field("type"), "redeemed"))
          .first();

        if (loyaltyTxn) {
          const account = await ctx.db
            .query("loyaltyAccounts")
            .withIndex("by_customer", (q) => q.eq("customerId", order.customerId!))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .first();

          if (account) {
            const pointsToRestore = Math.abs(loyaltyTxn.points);
            const settings = await ctx.db.query("loyaltySettings").first();
            const restoredValue = pointsToRestore * (settings?.rupeesPerPointRedemption ?? 1);

            await ctx.db.patch(account._id, {
              pointsBalance: account.pointsBalance + pointsToRestore,
              totalRedeemed: account.totalRedeemed - pointsToRestore,
              updatedAt: now,
            });

            await ctx.db.insert("loyaltyTransactions", {
              customerId: order.customerId,
              orderId: order._id,
              type: "adjusted",
              points: pointsToRestore,
              description: `Restored from cancelled order #${order.orderNumber}`,
              balanceAfter: account.pointsBalance + pointsToRestore,
              createdAt: now,
            });
          }
        }
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
