// ============================================================================
// MB CRUNCHY - Shipping Zones CRUD
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminRole } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getAll = query({
  args: {
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingZones")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Coverage Reporting (12D — read-only admin visibility)
// ----------------------------------------------------------------------------
// Single indexed read per business unit; no writes; superadmin/admin only.
// ============================================================================

export interface ZoneCoverage {
  total: number;
  active: number;
  inactive: number;
}

export const getCoverage = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args): Promise<ZoneCoverage> => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const zones = await ctx.db
      .query("shippingZones")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const active = zones.filter((z) => z.status === "active").length;
    return { total: zones.length, active, inactive: zones.length - active };
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    name: v.string(),
    code: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const name = args.name.trim();
    if (!name) {
      throw new Error("Zone name is required.");
    }

    const bu = await ctx.db.get(args.businessUnitId);
    if (!bu || bu.deletedAt !== undefined) {
      throw new Error("Business unit not found.");
    }

    const now = Date.now();
    return await ctx.db.insert("shippingZones", {
      businessUnitId: args.businessUnitId,
      name,
      code: args.code?.trim() || undefined,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingZones"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping zone not found.");
    }

    const fields: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Zone name is required.");
      fields.name = name;
    }
    if (args.code !== undefined) {
      fields.code = args.code?.trim() || undefined;
    }
    if (args.status !== undefined) {
      fields.status = args.status;
    }

    await ctx.db.patch(args.id, fields);
  },
});

export const softDelete = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingZones"),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping zone not found.");
    }

    // Block deletion if active pincode records reference this zone
    const activePincodes = await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", existing.businessUnitId).eq("status", "active")
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("shippingZoneId"), args.id),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .first();

    if (activePincodes) {
      throw new Error(
        "Cannot delete zone: active pincode records still reference it. Reassign or remove them first."
      );
    }

    // Block deletion if active rates reference this zone
    const activeRates = await ctx.db
      .query("shippingRates")
      .withIndex("by_zone", (q) =>
        q.eq("shippingZoneId", args.id).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (activeRates) {
      throw new Error(
        "Cannot delete zone: active shipping rates still reference it. Delete or deactivate them first."
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
