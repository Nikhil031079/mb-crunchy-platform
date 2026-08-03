// ============================================================================
// MB CRUNCHY - Order Activities (Audit timeline)
// Reusable logging helper + queries. The helper is imported directly by other
// mutations (orders, inventory, orderNotes) so activities are recorded
// automatically whenever existing status mutations execute.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdminSession } from "./utils/adminAuth";

export const ACTIVITY_ACTIONS = [
  "order_created",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "payment_rejected",
  "order_accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refund_initiated",
  "refund_completed",
  "manual_status_change",
  "inventory_reserved",
  "inventory_released",
  "note_added",
  "note_updated",
  "note_deleted",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// ============================================================================
// Helper (used internally by other Convex mutations)
// ============================================================================

interface LogActivityArgs {
  orderId: Id<"orders">;
  businessUnitId: Id<"businessUnits">;
  action: ActivityAction;
  previousValue?: string;
  newValue?: string;
  actor: string;
  actorId?: string;
  visibleToCustomer?: boolean;
}

export async function logActivity(ctx: MutationCtx, args: LogActivityArgs) {
  await ctx.db.insert("orderActivities", {
    orderId: args.orderId,
    businessUnitId: args.businessUnitId,
    action: args.action,
    previousValue: args.previousValue,
    newValue: args.newValue,
    actor: args.actor,
    actorId: args.actorId,
    visibleToCustomer: args.visibleToCustomer ?? true,
    createdAt: Date.now(),
  });
}

// ============================================================================
// Queries
// ============================================================================

export const getByOrder = query({
  args: { sessionToken: v.string(), orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("orderActivities")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .collect();
  },
});

export const getByOrderForCustomer = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderActivities")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.eq(q.field("visibleToCustomer"), true))
      .order("desc")
      .collect();
  },
});
