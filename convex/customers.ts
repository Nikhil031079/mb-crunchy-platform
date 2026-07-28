// ============================================================================
// MB CRUNCHY - Customers Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    return await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByAuthUserId = query({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    authUserId: v.optional(v.string()),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("customers", {
      ...args,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    id: v.id("customers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
  },
  handler: async (ctx, args) => {
    const { sessionToken: _, id, ...fields } = args;

    if (args.sessionToken) {
      await requireAdminSession(ctx, args.sessionToken);
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Authentication required");

      const customer = await ctx.db.get(id);
      if (!customer) throw new Error("Customer not found");
      if (customer.authUserId !== identity.subject) throw new Error("Unauthorized");
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const getByAuthUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!customer) throw new Error("Customer not found");

    const { name, email, phone } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email;
    if (phone !== undefined) patch.phone = phone;

    await ctx.db.patch(customer._id, patch);
    return customer._id;
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});
