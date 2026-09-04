// ============================================================================
// MB CRUNCHY - Shipping Rates CRUD (Static weight-slab pricing)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getByZone = query({
  args: {
    shippingZoneId: v.id("shippingZones"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingRates")
      .withIndex("by_zone", (q) =>
        q.eq("shippingZoneId", args.shippingZoneId).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: {
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingRates")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Helpers
// ============================================================================

async function checkOverlappingSlabs(
  ctx: any,
  zoneId: string,
  minWeightGrams: number,
  maxWeightGrams: number,
  excludeId?: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("shippingRates")
    .withIndex("by_zone", (q: any) =>
      q.eq("shippingZoneId", zoneId).eq("status", "active")
    )
    .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
    .collect();

  for (const rate of existing) {
    if (excludeId && rate._id === excludeId) continue;
    // Overlap rule: minB <= maxA AND maxB >= minA
    if (minWeightGrams <= rate.maxWeightGrams && maxWeightGrams >= rate.minWeightGrams) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    shippingZoneId: v.id("shippingZones"),
    businessUnitId: v.id("businessUnits"),
    name: v.string(),
    minWeightGrams: v.number(),
    maxWeightGrams: v.number(),
    charge: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const name = args.name.trim();
    if (!name) throw new Error("Rate name is required.");

    if (args.minWeightGrams < 0) {
      throw new Error("Minimum weight must be >= 0.");
    }
    if (args.maxWeightGrams <= args.minWeightGrams) {
      throw new Error("Maximum weight must be greater than minimum weight.");
    }
    if (args.charge < 0) {
      throw new Error("Charge must be >= 0.");
    }

    // Zone must exist
    const zone = await ctx.db.get(args.shippingZoneId);
    if (!zone || zone.deletedAt !== undefined) {
      throw new Error("Shipping zone not found.");
    }

    // Zone BU must match rate BU
    if (zone.businessUnitId !== args.businessUnitId) {
      throw new Error("Shipping zone does not belong to this business unit.");
    }

    // Zone must be active for creating an active rate
    if (args.status === "active" && zone.status !== "active") {
      throw new Error("Cannot create an active rate for an inactive zone.");
    }

    // Check overlapping slabs
    if (args.status === "active") {
      const overlaps = await checkOverlappingSlabs(
        ctx,
        args.shippingZoneId,
        args.minWeightGrams,
        args.maxWeightGrams,
      );
      if (overlaps) {
        throw new Error("This weight range overlaps with an existing active rate in this zone.");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("shippingRates", {
      shippingZoneId: args.shippingZoneId,
      businessUnitId: args.businessUnitId,
      name,
      minWeightGrams: args.minWeightGrams,
      maxWeightGrams: args.maxWeightGrams,
      charge: args.charge,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingRates"),
    name: v.optional(v.string()),
    minWeightGrams: v.optional(v.number()),
    maxWeightGrams: v.optional(v.number()),
    charge: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping rate not found.");
    }

    const fields: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Rate name is required.");
      fields.name = name;
    }
    if (args.minWeightGrams !== undefined) {
      if (args.minWeightGrams < 0) throw new Error("Minimum weight must be >= 0.");
      fields.minWeightGrams = args.minWeightGrams;
    }
    if (args.maxWeightGrams !== undefined) {
      fields.maxWeightGrams = args.maxWeightGrams;
    }
    if (args.charge !== undefined) {
      if (args.charge < 0) throw new Error("Charge must be >= 0.");
      fields.charge = args.charge;
    }
    if (args.status !== undefined) {
      fields.status = args.status;
    }

    // Validate combined values
    const finalMin = (fields.minWeightGrams as number) ?? existing.minWeightGrams;
    const finalMax = (fields.maxWeightGrams as number) ?? existing.maxWeightGrams;
    const finalStatus = (fields.status as string) ?? existing.status;

    if (finalMax <= finalMin) {
      throw new Error("Maximum weight must be greater than minimum weight.");
    }

    // Zone must be active for an active rate
    if (finalStatus === "active") {
      const zone = await ctx.db.get(existing.shippingZoneId);
      if (zone && zone.status !== "active") {
        throw new Error("Cannot activate rate: zone is inactive.");
      }
    }

    // Check overlapping slabs (excluding self)
    if (finalStatus === "active") {
      const overlaps = await checkOverlappingSlabs(
        ctx,
        existing.shippingZoneId,
        finalMin,
        finalMax,
        args.id,
      );
      if (overlaps) {
        throw new Error("This weight range overlaps with an existing active rate in this zone.");
      }
    }

    await ctx.db.patch(args.id, fields);
  },
});

export const softDelete = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingRates"),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping rate not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
