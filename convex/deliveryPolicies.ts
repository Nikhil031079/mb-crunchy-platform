// ============================================================================
// MB CRUNCHY - Delivery Policies (Global)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getActivePolicy = query({
  handler: async (ctx) => {
    // Return the active local delivery policy (has fixedFee, estimated time, etc.)
    const localPolicy = await ctx.db
      .query("deliveryPolicies")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("serviceType"), "local"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .first();

    if (localPolicy) return localPolicy;

    // Fallback: return first active policy
    return await ctx.db
      .query("deliveryPolicies")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .first();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("deliveryPolicies")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    scope: v.union(v.literal("global")),
    serviceType: v.union(v.literal("local"), v.literal("manual")),
    feeType: v.union(v.literal("fixed"), v.literal("quote")),
    fixedFee: v.optional(v.number()),
    minimumOrder: v.optional(v.number()),
    freeDeliveryThreshold: v.optional(v.number()),
    estimatedMinutes: v.optional(v.number()),
    radius: v.optional(v.number()),
    requiresQuote: v.boolean(),
    instructions: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    return await ctx.db.insert("deliveryPolicies", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("deliveryPolicies"),
    name: v.optional(v.string()),
    serviceType: v.optional(v.union(v.literal("local"), v.literal("manual"))),
    feeType: v.optional(v.union(v.literal("fixed"), v.literal("quote"))),
    fixedFee: v.optional(v.number()),
    minimumOrder: v.optional(v.number()),
    freeDeliveryThreshold: v.optional(v.number()),
    estimatedMinutes: v.optional(v.number()),
    radius: v.optional(v.number()),
    requiresQuote: v.optional(v.boolean()),
    instructions: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("deliveryPolicies") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Seed — run once from dev dashboard to create the global delivery policies
// ============================================================================

export const seedPolicies = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Check if policies already exist
    const existing = await ctx.db
      .query("deliveryPolicies")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    if (existing.length > 0) {
      return { message: "Policies already seeded", count: existing.length };
    }

    const inserted: string[] = [];

    const localId = await ctx.db.insert("deliveryPolicies", {
      name: "Local Delivery",
      scope: "global",
      serviceType: "local",
      feeType: "fixed",
      fixedFee: 30,
      minimumOrder: 200,
      freeDeliveryThreshold: 500,
      estimatedMinutes: 30,
      radius: 5,
      requiresQuote: false,
      instructions: "Standard local delivery within our service area.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    inserted.push(localId);

    const outsideId = await ctx.db.insert("deliveryPolicies", {
      name: "Outside Local Area",
      scope: "global",
      serviceType: "manual",
      feeType: "quote",
      requiresQuote: true,
      instructions: "Delivery to areas outside our local service zone. Delivery charges confirmed after order placement based on your location.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    inserted.push(outsideId);

    return { message: "Seeded 2 delivery policies", ids: inserted };
  },
});
