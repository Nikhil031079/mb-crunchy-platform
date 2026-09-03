// ============================================================================
// MB CRUNCHY - Mart Pincode Serviceability
// Dedicated table for Mart courier delivery pincode coverage.
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Types
// ============================================================================

export interface MartServiceabilityResult {
  serviceable: boolean;
  reasonCode?: string;
  message?: string;
}

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: {
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getByPincode = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    pincode: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_bu_pincode", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("pincode", args.pincode)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const checkServiceability = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    pincode: v.string(),
  },
  handler: async (ctx, args): Promise<MartServiceabilityResult> => {
    // 1. Validate pincode format
    if (!/^\d{6}$/.test(args.pincode)) {
      return {
        serviceable: false,
        reasonCode: "INVALID_PINCODE",
        message: "Pincode must be a valid 6-digit number.",
      };
    }

    // 2. Verify BU exists and is delivery-enabled
    const bu = await ctx.db.get(args.businessUnitId);
    if (!bu || bu.deletedAt !== undefined) {
      return {
        serviceable: false,
        reasonCode: "BUSINESS_UNIT_NOT_FOUND",
        message: "Business unit not found.",
      };
    }
    if (!bu.enableDelivery) {
      return {
        serviceable: false,
        reasonCode: "MART_DELIVERY_DISABLED",
        message: "Delivery is not enabled for this business unit.",
      };
    }

    // 3. Verify BU uses pincode_region mode
    if (bu.serviceabilityMode !== "pincode_region") {
      return {
        serviceable: false,
        reasonCode: "MART_SERVICEABILITY_NOT_CONFIGURED",
        message: "This business unit does not use pincode-based delivery.",
      };
    }

    // 4. Check pincode exists and is active
    const pincodeRecord = await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_bu_pincode", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("pincode", args.pincode)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!pincodeRecord) {
      return {
        serviceable: false,
        reasonCode: "PINCODE_NOT_SERVICEABLE",
        message: "Delivery is not available for this pincode.",
      };
    }

    if (pincodeRecord.status !== "active") {
      return {
        serviceable: false,
        reasonCode: "PINCODE_NOT_SERVICEABLE",
        message: "Delivery is temporarily unavailable for this pincode.",
      };
    }

    return {
      serviceable: true,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    pincode: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    deliveryDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    // Validate pincode format
    if (!/^\d{6}$/.test(args.pincode)) {
      throw new Error("Pincode must be a valid 6-digit number.");
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_bu_pincode", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("pincode", args.pincode)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (existing) {
      throw new Error(
        `Pincode ${args.pincode} already exists for this business unit.`
      );
    }

    // Verify BU exists
    const bu = await ctx.db.get(args.businessUnitId);
    if (!bu || bu.deletedAt !== undefined) {
      throw new Error("Business unit not found.");
    }

    const now = Date.now();
    return await ctx.db.insert("martPincodeServiceability", {
      businessUnitId: args.businessUnitId,
      pincode: args.pincode,
      city: args.city?.trim() || undefined,
      state: args.state?.trim() || undefined,
      status: args.status,
      deliveryDays: args.deliveryDays,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("martPincodeServiceability"),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    deliveryDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Pincode serviceability record not found.");
    }

    await ctx.db.patch(args.id, {
      city: args.city?.trim() || undefined,
      state: args.state?.trim() || undefined,
      status: args.status,
      deliveryDays: args.deliveryDays,
      updatedAt: Date.now(),
    });
  },
});

export const softDelete = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("martPincodeServiceability"),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Pincode serviceability record not found.");
    }

    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
