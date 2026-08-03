// ============================================================================
// MB CRUNCHY - Order Notes (Internal, admin-only)
// Notes are only visible to administrators. There is no customer-facing query.
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";
import { logActivity } from "./orderActivities";

// ============================================================================
// Queries
// ============================================================================

export const getByOrder = query({
  args: { sessionToken: v.string(), orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    return await ctx.db
      .query("orderNotes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const add = mutation({
  args: {
    sessionToken: v.string(),
    orderId: v.id("orders"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const text = args.note.trim();
    if (!text) throw new Error("Note cannot be empty");

    const now = Date.now();
    const noteId = await ctx.db.insert("orderNotes", {
      orderId: args.orderId,
      businessUnitId: order.businessUnitId,
      author: admin.username,
      authorId: admin._id,
      note: text,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orderId: args.orderId,
      businessUnitId: order.businessUnitId,
      action: "note_added",
      newValue: "Internal note added",
      actor: admin.username,
      actorId: admin._id,
      visibleToCustomer: false,
    });

    return noteId;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    noteId: v.id("orderNotes"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.noteId);
    if (!doc || doc.deletedAt) throw new Error("Note not found");

    const text = args.note.trim();
    if (!text) throw new Error("Note cannot be empty");

    await ctx.db.patch(args.noteId, {
      note: text,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      orderId: doc.orderId,
      businessUnitId: doc.businessUnitId,
      action: "note_updated",
      newValue: "Internal note updated",
      actor: admin.username,
      actorId: admin._id,
      visibleToCustomer: false,
    });
  },
});

export const remove = mutation({
  args: {
    sessionToken: v.string(),
    noteId: v.id("orderNotes"),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdminSession(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.noteId);
    if (!doc || doc.deletedAt) throw new Error("Note not found");

    await ctx.db.patch(args.noteId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      orderId: doc.orderId,
      businessUnitId: doc.businessUnitId,
      action: "note_deleted",
      newValue: "Internal note deleted",
      actor: admin.username,
      actorId: admin._id,
      visibleToCustomer: false,
    });
  },
});
