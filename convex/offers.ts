// ============================================================================
// MB CRUNCHY - Offers Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Helpers
// ============================================================================

async function requireAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
}

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("offers")
      .withIndex("by_business_unit", (q) => q.eq("businessUnitId", args.businessUnitId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getActive = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db
      .query("offers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.eq(q.field("businessUnitId"), args.businessUnitId),
          q.eq(q.field("deletedAt"), undefined),
          q.lte(q.field("startsAt"), now),
          q.gte(q.field("endsAt"), now)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("offers")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    discountType: v.union(v.literal("percentage"), v.literal("fixed")),
    discountValue: v.number(),
    minOrderValue: v.optional(v.number()),
    maxDiscount: v.optional(v.number()),
    startsAt: v.number(),
    endsAt: v.number(),
    applicableCatalogItemIds: v.array(v.id("catalogItems")),
    applicableCategoryIds: v.array(v.id("categories")),
    usageLimit: v.optional(v.number()),
    displayOrder: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    banner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();

    return await ctx.db.insert("offers", {
      ...args,
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("offers"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    discountValue: v.optional(v.number()),
    minOrderValue: v.optional(v.number()),
    maxDiscount: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    applicableCatalogItemIds: v.optional(v.array(v.id("catalogItems"))),
    applicableCategoryIds: v.optional(v.array(v.id("categories"))),
    usageLimit: v.optional(v.number()),
    displayOrder: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
    banner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const incrementUsage = mutation({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) throw new Error("Offer not found");
    await ctx.db.patch(args.id, {
      usedCount: offer.usedCount + 1,
      updatedAt: Date.now(),
    });
  },
});

export const softDelete = mutation({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("offers")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Validate Coupon Code
// ============================================================================

export const validateCoupon = query({
  args: {
    code: v.string(),
    businessUnitId: v.id("businessUnits"),
    subtotal: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const offer = await ctx.db
      .query("offers")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!offer) {
      return { valid: false, error: "Invalid coupon code" };
    }

    if (offer.businessUnitId !== args.businessUnitId) {
      return { valid: false, error: "This coupon is not valid for this store" };
    }

    if (offer.status !== "active") {
      return { valid: false, error: "This coupon is no longer active" };
    }

    if (now < offer.startsAt) {
      return { valid: false, error: "This coupon is not yet active" };
    }

    if (now > offer.endsAt) {
      return { valid: false, error: "This coupon has expired" };
    }

    if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
      return { valid: false, error: "This coupon has reached its usage limit" };
    }

    if (offer.minOrderValue && args.subtotal < offer.minOrderValue) {
      return {
        valid: false,
        error: `Minimum order value of ${offer.minOrderValue} required`,
      };
    }

    // Calculate discount
    let discount = 0;
    if (offer.discountType === "percentage") {
      discount = (args.subtotal * offer.discountValue) / 100;
      if (offer.maxDiscount) {
        discount = Math.min(discount, offer.maxDiscount);
      }
    } else {
      discount = Math.min(offer.discountValue, args.subtotal);
    }

    return {
      valid: true,
      offerId: offer._id,
      title: offer.title,
      code: offer.code,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      discount: Math.round(discount * 100) / 100,
      maxDiscount: offer.maxDiscount,
    };
  },
});

/**
 * Restore — clears deletedAt and reactivates the offer.
 */
export const restore = mutation({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });
  },
});