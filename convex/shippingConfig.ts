// ============================================================================
// MB CRUNCHY - Shipping Config (Per-BU shipping configuration)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminRole } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: {
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingConfig")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    minimumBillableWeightGrams: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    if (args.minimumBillableWeightGrams <= 0) {
      throw new Error("Minimum billable weight must be greater than 0.");
    }

    const bu = await ctx.db.get(args.businessUnitId);
    if (!bu || bu.deletedAt !== undefined) {
      throw new Error("Business unit not found.");
    }

    // Enforce: one active config per BU
    const existing = await ctx.db
      .query("shippingConfig")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) {
      // Update existing instead of creating duplicate
      await ctx.db.patch(existing._id, {
        minimumBillableWeightGrams: args.minimumBillableWeightGrams,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("shippingConfig", {
      businessUnitId: args.businessUnitId,
      minimumBillableWeightGrams: args.minimumBillableWeightGrams,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    minimumBillableWeightGrams: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    if (args.minimumBillableWeightGrams <= 0) {
      throw new Error("Minimum billable weight must be greater than 0.");
    }

    const existing = await ctx.db
      .query("shippingConfig")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!existing) {
      throw new Error("No active shipping configuration found for this business unit.");
    }

    await ctx.db.patch(existing._id, {
      minimumBillableWeightGrams: args.minimumBillableWeightGrams,
      updatedAt: Date.now(),
    });
  },
});
