// ============================================================================
// MB CRUNCHY - Bulk Order Operations (Sprint 5 Phase 2)
// Reuses the existing single-order workflow (api.orders.updateStatus) so that
// inventory adjustments, loyalty handling and Sprint 5 Phase 1 activity logging
// are preserved for every order in the batch. Each order runs in its own nested
// transaction and results are reported per order so partial failures can be
// surfaced to the administrator.
// ============================================================================

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdminSession } from "./utils/adminAuth";
import { CANCELLABLE_STATUSES, getAllowedTransitions } from "./orderWorkflow";

type OrderDoc = Doc<"orders">;

interface BulkResult {
  orderId: Id<"orders">;
  orderNumber: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

type EvalResult =
  | { outcome: "ok" }
  | { outcome: "skip" }
  | { outcome: "error"; error: string };

// Shared batch runner: resolves each order, applies the eligibility check, then
// invokes the per-order action. Skipped orders count as successful no-ops.
async function runBulk(
  ctx: MutationCtx,
  orderIds: Id<"orders">[],
  evaluate: (order: OrderDoc) => EvalResult,
  apply: (ctx: MutationCtx, order: OrderDoc) => Promise<unknown>,
): Promise<{ succeeded: number; results: BulkResult[] }> {
  const results: BulkResult[] = [];
  let succeeded = 0;

  for (const orderId of orderIds) {
    const order = await ctx.db.get(orderId);
    if (!order || order.deletedAt) {
      results.push({ orderId, orderNumber: "", success: false, error: "Order not found" });
      continue;
    }

    const verdict = evaluate(order);
    if (verdict.outcome === "skip") {
      results.push({ orderId, orderNumber: order.orderNumber, success: true, skipped: true });
      continue;
    }
    if (verdict.outcome === "error") {
      results.push({ orderId, orderNumber: order.orderNumber, success: false, error: verdict.error });
      continue;
    }

    try {
      await apply(ctx, order);
      succeeded++;
      results.push({ orderId, orderNumber: order.orderNumber, success: true });
    } catch (err) {
      results.push({
        orderId,
        orderNumber: order.orderNumber,
        success: false,
        error: err instanceof Error ? err.message : "Bulk operation failed",
      });
    }
  }

  return { succeeded, results };
}

// ============================================================================
// Mutations
// ============================================================================

export const bulkUpdateStatus = mutation({
  args: {
    sessionToken: v.string(),
    orderIds: v.array(v.id("orders")),
    status: v.union(
      v.literal("awaiting_payment"),
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { succeeded, results } = await runBulk(
      ctx,
      args.orderIds,
      (order) => {
        if (order.status === args.status) return { outcome: "skip" as const };
        if (!getAllowedTransitions(order.status, order.orderType).includes(args.status)) {
          return {
            outcome: "error" as const,
            error: `Order ${order.orderNumber} cannot move from ${order.status} to ${args.status}`,
          };
        }
        return { outcome: "ok" as const };
      },
      (mctx, order) =>
        mctx.runMutation(api.orders.updateStatus, {
          sessionToken: args.sessionToken,
          id: order._id,
          status: args.status,
        }),
    );

    return { succeeded, total: args.orderIds.length, results };
  },
});

export const bulkCancel = mutation({
  args: { sessionToken: v.string(), orderIds: v.array(v.id("orders")) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { succeeded, results } = await runBulk(
      ctx,
      args.orderIds,
      (order) => {
        if (order.status === "cancelled") return { outcome: "skip" as const };
        if (!CANCELLABLE_STATUSES.includes(order.status)) {
          return {
            outcome: "error" as const,
            error: `Order ${order.orderNumber} cannot be cancelled from ${order.status} status`,
          };
        }
        return { outcome: "ok" as const };
      },
      (mctx, order) =>
        mctx.runMutation(api.orders.updateStatus, {
          sessionToken: args.sessionToken,
          id: order._id,
          status: "cancelled",
        }),
    );

    return { succeeded, total: args.orderIds.length, results };
  },
});

export const bulkRefund = mutation({
  args: { sessionToken: v.string(), orderIds: v.array(v.id("orders")) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { succeeded, results } = await runBulk(
      ctx,
      args.orderIds,
      (order) => {
        if (order.status === "refunded") return { outcome: "skip" as const };
        if (order.status !== "delivered" || order.paymentStatus !== "paid") {
          return {
            outcome: "error" as const,
            error: `Order ${order.orderNumber} is not eligible for refund`,
          };
        }
        return { outcome: "ok" as const };
      },
      (mctx, order) =>
        mctx.runMutation(api.orders.updateStatus, {
          sessionToken: args.sessionToken,
          id: order._id,
          status: "refunded",
          paymentStatus: "refunded",
        }),
    );

    return { succeeded, total: args.orderIds.length, results };
  },
});
