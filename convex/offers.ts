// ============================================================================
// MB CRUNCHY - Offers Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdminRole } from "./utils/adminAuth";

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

/**
 * Returns all active offers across ALL active business units.
 * Each offer retains its businessUnitId for store attribution.
 * Used by FeaturedOffersSection to avoid fixed-N BU query slots.
 *
 * Server-enforced lifecycle: status active, not deleted, and inside the
 * startsAt/endsAt window (missing dates mean no boundary), mirroring the
 * client isOfferActive helper in src/utils/marketing.ts. Callers keep
 * their defensive client-side filtering.
 */
export const getAllActiveAcrossBusinessUnits = query({
  handler: async (ctx) => {
    const now = Date.now();
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.or(
            q.eq(q.field("startsAt"), undefined),
            q.lte(q.field("startsAt"), now)
          ),
          q.or(
            q.eq(q.field("endsAt"), undefined),
            q.gte(q.field("endsAt"), now)
          )
        )
      )
      .order("asc")
      .collect();
    return offers;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Reject a coupon code that is already used by another live offer.
 * Comparison is upper-cased to match the redemption lookup in
 * validateCouponInternal (which queries by_code with the upper-cased code).
 * Code-less (automatic) offers never collide; soft-deleted offers are
 * ignored. Updates pass excludeId so an offer keeps its own code.
 */
async function assertUniqueCouponCode(
  ctx: { db: QueryCtx["db"] },
  code: string | undefined,
  excludeId?: string
): Promise<void> {
  if (!code) return;
  const normalized = code.toUpperCase();
  const clash = await ctx.db
    .query("offers")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();
  if (clash && clash._id !== excludeId) {
    throw new Error(`Coupon code "${normalized}" is already in use`);
  }
}

export const create = mutation({
  args: {
    sessionToken: v.string(),
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
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    if (!args.businessUnitId) throw new Error("Select a business unit.");
    if (args.endsAt <= args.startsAt) {
      throw new Error("End date must be after the start date.");
    }
    if (
      args.discountType === "percentage" &&
      (args.discountValue <= 0 || args.discountValue > 100)
    ) {
      throw new Error("Percentage discount must be between 1 and 100.");
    }
    if (args.discountType === "fixed" && args.discountValue < 0) {
      throw new Error("Fixed discount must not be negative.");
    }
    await assertUniqueCouponCode(ctx, args.code);

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    return await ctx.db.insert("offers", {
      ...insertArgs,
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
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
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Offer not found");

    const startsAt = args.startsAt ?? existing.startsAt;
    const endsAt = args.endsAt ?? existing.endsAt;
    if (startsAt !== undefined && endsAt !== undefined && endsAt <= startsAt) {
      throw new Error("End date must be after the start date.");
    }
    const discountType = args.discountType ?? existing.discountType;
    const discountValue = args.discountValue ?? existing.discountValue;
    if (
      discountType === "percentage" &&
      discountValue !== undefined &&
      (discountValue <= 0 || discountValue > 100)
    ) {
      throw new Error("Percentage discount must be between 1 and 100.");
    }
    if (
      discountType === "fixed" &&
      discountValue !== undefined &&
      discountValue < 0
    ) {
      throw new Error("Fixed discount must not be negative.");
    }
    if (args.code !== undefined) {
      await assertUniqueCouponCode(ctx, args.code, args.id);
    }

    const { sessionToken: _, id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export interface CouponConsumption {
  /** True when a usage slot was reserved (usedCount incremented). */
  consumed: boolean;
  /** usedCount after this call (unchanged when not consumed). */
  usedCount: number;
}

/**
 * Atomically consume one coupon usage slot (10C — P2 usage race fix).
 *
 * MUST run inline inside the caller's mutation transaction
 * (orders.create, finalizePaidOrder) — never via a separate ctx.runMutation
 * — so the limit check and the increment share one Convex
 * optimistic-concurrency transaction: a concurrent committer retries the
 * whole caller mutation against fresh state instead of overshooting.
 *
 * Enforces ONLY the usage limit. Offer validity (active/window/eligibility)
 * is validated upstream at order time; re-litigating it here would strand
 * in-flight paid orders if an admin deactivates a coupon mid-flow.
 * Returns consumed:false (no write) when exhausted or already over-limit.
 */
export async function consumeCouponUsage(
  ctx: { db: MutationCtx["db"] },
  offerId: Id<"offers">,
): Promise<CouponConsumption> {
  const offer = await ctx.db.get(offerId);
  if (!offer || offer.deletedAt !== undefined) {
    throw new Error("Offer not found");
  }
  if (offer.usageLimit != null && offer.usedCount >= offer.usageLimit) {
    return { consumed: false, usedCount: offer.usedCount };
  }
  const nextCount = offer.usedCount + 1;
  await ctx.db.patch(offerId, {
    usedCount: nextCount,
    updatedAt: Date.now(),
  });
  return { consumed: true, usedCount: nextCount };
}

/**
 * Decrement coupon usage count exactly once per order cancellation/refund.
 * Idempotent: clamps usedCount to 0 so double-reversal can never produce
 * negative values.
 */
export const decrementUsage = internalMutation({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) return;
    await ctx.db.patch(args.id, {
      usedCount: Math.max(0, offer.usedCount - 1),
      updatedAt: Date.now(),
    });
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("offers") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Admin-only full offer listing (10I). Previously public; Phase 10H
 * established zero customer callers — the only callers are the admin
 * Offers/FlashSales pages, which pass their session token. Returns the
 * complete unfiltered documents (including inactive/archived) for admin
 * management; customer surfaces use getActive/getAllActiveAcrossBusinessUnits.
 */
export const getAll = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
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

export type CouponValidationResult =
  | { valid: false; error?: string }
  | {
      valid: true;
      offerId: Id<"offers">;
      title: string;
      code?: string;
      discountType: "percentage" | "fixed";
      discountValue: number;
      discount: number;
      maxDiscount?: number;
    };

/**
 * Shared coupon validation used by the `validateCoupon` query and by the
 * order-creation flow (server recomputes the coupon discount at order time).
 */
export async function validateCouponInternal(
  ctx: { db: QueryCtx["db"] },
  args: { code: string; businessUnitId: Id<"businessUnits">; subtotal: number },
): Promise<CouponValidationResult> {
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
}

export const validateCoupon = query({
  args: {
    code: v.string(),
    businessUnitId: v.id("businessUnits"),
    subtotal: v.number(),
  },
  handler: async (ctx, args) => validateCouponInternal(ctx, args),
});

/**
 * Restore — clears deletedAt and reactivates the offer.
 */
export const restore = mutation({
  args: { sessionToken: v.string(), id: v.id("offers") },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });
  },
});