// ============================================================================
// MB CRUNCHY — In-App Notifications
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getForUser = query({
  args: {
    userId: v.string(),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.unreadOnly) {
      return await ctx.db
        .query("inAppNotifications")
        .withIndex("by_user_read", (q) =>
          q.eq("userId", args.userId).eq("read", false)
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("inAppNotifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const getUnreadCount = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("inAppNotifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();

    return unread.length;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    type: v.union(
      v.literal("order_update"),
      v.literal("promotion"),
      v.literal("system"),
      v.literal("low_stock"),
    ),
    link: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("inAppNotifications", {
      userId: args.userId,
      title: args.title,
      body: args.body,
      type: args.type,
      link: args.link,
      read: false,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("inAppNotifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const doc = await ctx.db.get(args.notificationId);
    if (!doc) throw new Error("Notification not found");
    if (doc.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllRead = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (args.userId !== identity.subject) throw new Error("Unauthorized");

    const unread = await ctx.db
      .query("inAppNotifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();

    await Promise.all(
      unread.map((n) => ctx.db.patch(n._id, { read: true }))
    );
  },
});

export const remove = mutation({
  args: { notificationId: v.id("inAppNotifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const doc = await ctx.db.get(args.notificationId);
    if (!doc) throw new Error("Notification not found");
    if (doc.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.delete(args.notificationId);
  },
});

export const clearAll = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    if (args.userId !== identity.subject) throw new Error("Unauthorized");

    const all = await ctx.db
      .query("inAppNotifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    await Promise.all(all.map((n) => ctx.db.delete(n._id)));
  },
});
