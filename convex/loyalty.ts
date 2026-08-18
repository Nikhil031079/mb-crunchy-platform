// ============================================================================
// MB CRUNCHY - Loyalty Engine
// Event-driven loyalty: points earned on delivery, redeemed at checkout
// ============================================================================

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canReadCustomerData } from "./utils/customerAccess";

// ============================================================================
// Helpers
// ============================================================================

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;

function nextTier(
  current: "bronze" | "silver" | "gold" | "platinum",
): "silver" | "gold" | "platinum" | null {
  const idx = TIER_ORDER.indexOf(current);
  const next = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : undefined;
  return (next && next !== "bronze" ? next : null) as "silver" | "gold" | "platinum" | null;
}

// ============================================================================
// Queries
// ============================================================================

export const getSettings = query({
  handler: async (ctx) => {
    return await ctx.db.query("loyaltySettings").first() ?? null;
  },
});

export const getBalance = query({
  args: { sessionToken: v.optional(v.string()), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const allowed = await canReadCustomerData(ctx, args);
    if (!allowed) return null;
    return await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first() ?? null;
  },
});

export const getTransactions = query({
  args: { sessionToken: v.optional(v.string()), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const allowed = await canReadCustomerData(ctx, args);
    if (!allowed) return [];
    return await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();
  },
});

export const getTierProgress = query({
  args: { sessionToken: v.optional(v.string()), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const allowed = await canReadCustomerData(ctx, args);
    if (!allowed) return null;

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!account) {
      return { tier: "bronze" as const, pointsBalance: 0, nextTier: "silver" as const, pointsToNextTier: 0 };
    }

    const settings = await ctx.db.query("loyaltySettings").first();
    if (!settings) {
      return { tier: account.tier, pointsBalance: account.pointsBalance, nextTier: null, pointsToNextTier: 0 };
    }

    const next = nextTier(account.tier);
    if (!next) {
      return { tier: account.tier, pointsBalance: account.pointsBalance, nextTier: null, pointsToNextTier: 0 };
    }

    const threshold = settings.tierThresholds[next];
    const pointsToNext = Math.max(0, threshold - account.totalEarned);

    return { tier: account.tier, pointsBalance: account.pointsBalance, nextTier: next, pointsToNextTier: pointsToNext };
  },
});

export type MaxRedeemableResult = {
  maxPoints: number;
  maxValue: number;
  reason: string | null;
};

/**
 * Shared max-redeemable computation used by the `getMaxRedeemable` query and
 * by the order-creation flow (server clamps any loyalty discount).
 */
export async function getMaxRedeemableInternal(
  ctx: { db: QueryCtx["db"] },
  args: { customerId: Id<"customers">; orderTotal: number },
): Promise<MaxRedeemableResult> {
  const account = await ctx.db
    .query("loyaltyAccounts")
    .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();

  if (!account || account.pointsBalance <= 0) {
    return { maxPoints: 0, maxValue: 0, reason: "No points available" };
  }

  const settings = await ctx.db.query("loyaltySettings").first();
  if (!settings) {
    return { maxPoints: 0, maxValue: 0, reason: "Loyalty not configured" };
  }

  // Cap: max % of order total redeemable
  const maxByOrderValue = Math.floor(
    (args.orderTotal * settings.maxRedeemPercentOfOrder) / settings.rupeesPerPointRedemption,
  );

  // Cap: customer balance
  const maxByBalance = account.pointsBalance;

  // Floor: minimum redeem
  const effectiveMax = Math.max(
    0,
    Math.min(maxByOrderValue, maxByBalance),
  );

  if (effectiveMax < settings.minRedeemPoints) {
    return { maxPoints: 0, maxValue: 0, reason: `Minimum ${settings.minRedeemPoints} points to redeem` };
  }

  return {
    maxPoints: effectiveMax,
    maxValue: effectiveMax * settings.rupeesPerPointRedemption,
    reason: null,
  };
}

/**
 * Server-authoritative loyalty redemption. Called atomically during order
 * creation (local/pickup) or at claimPayment (outside-area after quote
 * acceptance). Validates the customer's available points, clamps the request
 * to the maximum redeemable, deducts points, and creates a ledger entry.
 *
 * Returns the actual points redeemed and value applied. If the customer has
 * insufficient points or the request is below the minimum, returns zeros
 * without mutating anything.
 */
export async function redeemLoyaltyInternal(
  ctx: { db: MutationCtx["db"] },
  args: {
    customerId: Id<"customers">;
    orderId: Id<"orders">;
    orderNumber: string;
    points: number;
    orderTotal: number;
  },
): Promise<{ pointsRedeemed: number; valueApplied: number }> {
  if (args.points <= 0) {
    return { pointsRedeemed: 0, valueApplied: 0 };
  }

  const settings = await ctx.db.query("loyaltySettings").first();
  if (!settings) {
    return { pointsRedeemed: 0, valueApplied: 0 };
  }

  const account = await ctx.db
    .query("loyaltyAccounts")
    .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();

  if (!account || account.pointsBalance <= 0) {
    return { pointsRedeemed: 0, valueApplied: 0 };
  }

  // Clamp to maximum redeemable
  const maxRedeemable = await getMaxRedeemableInternal(ctx, {
    customerId: args.customerId,
    orderTotal: args.orderTotal,
  });

  const effectivePoints = Math.min(args.points, maxRedeemable.maxPoints);

  if (effectivePoints < settings.minRedeemPoints) {
    return { pointsRedeemed: 0, valueApplied: 0 };
  }

  const now = Date.now();
  const newBalance = account.pointsBalance - effectivePoints;

  await ctx.db.patch(account._id, {
    pointsBalance: newBalance,
    totalRedeemed: account.totalRedeemed + effectivePoints,
    updatedAt: now,
  });

  await ctx.db.insert("loyaltyTransactions", {
    customerId: args.customerId,
    orderId: args.orderId,
    type: "redeemed",
    points: -effectivePoints,
    description: `Redeemed for order #${args.orderNumber}`,
    balanceAfter: newBalance,
    createdAt: now,
  });

  return {
    pointsRedeemed: effectivePoints,
    valueApplied: effectivePoints * settings.rupeesPerPointRedemption,
  };
}

export const getMaxRedeemable = query({
  args: {
    sessionToken: v.optional(v.string()),
    customerId: v.id("customers"),
    orderTotal: v.number(),
  },
  handler: async (ctx, args) => {
    const allowed = await canReadCustomerData(ctx, args);
    if (!allowed) return null;
    return getMaxRedeemableInternal(ctx, args);
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const ensureSettings = internalMutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("loyaltySettings").first();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("loyaltySettings", {
      pointsPerRupee: 0.1,
      rupeesPerPointRedemption: 1,
      minRedeemPoints: 50,
      maxRedeemPercentOfOrder: 0.25,
      tierThresholds: { silver: 500, gold: 2000, platinum: 5000 },
      tierMultipliers: { bronze: 1, silver: 1.25, gold: 1.5, platinum: 2 },
      pointsExpiryDays: 365,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const awardPoints = internalMutation({
  args: {
    customerId: v.id("customers"),
    orderId: v.id("orders"),
    orderTotal: v.number(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.query("loyaltySettings").first();
    if (!settings) return null;

    // Calculate base points
    const basePoints = Math.floor(args.orderTotal * settings.pointsPerRupee);

    // Get or create loyalty account
    let account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    const now = Date.now();
    const tier = account?.tier ?? "bronze";
    const multiplier = settings.tierMultipliers[tier];
    const earnedPoints = Math.floor(basePoints * multiplier);

    if (earnedPoints <= 0) return null;

    const newBalance = (account?.pointsBalance ?? 0) + earnedPoints;
    const newTotalEarned = (account?.totalEarned ?? 0) + earnedPoints;

    // Determine new tier
    let newTier = tier;
    if (newTotalEarned >= settings.tierThresholds.platinum) {
      newTier = "platinum";
    } else if (newTotalEarned >= settings.tierThresholds.gold) {
      newTier = "gold";
    } else if (newTotalEarned >= settings.tierThresholds.silver) {
      newTier = "silver";
    }

    if (account) {
      await ctx.db.patch(account._id, {
        pointsBalance: newBalance,
        totalEarned: newTotalEarned,
        tier: newTier,
        updatedAt: now,
      });
    } else {
      account = {
        _id: await ctx.db.insert("loyaltyAccounts", {
          customerId: args.customerId,
          pointsBalance: earnedPoints,
          totalEarned: earnedPoints,
          totalRedeemed: 0,
          tier: newTier,
          createdAt: now,
          updatedAt: now,
        }),
        pointsBalance: earnedPoints,
        totalEarned: earnedPoints,
        totalRedeemed: 0,
        tier: newTier,
      } as any;
    }

    // Create transaction record
    await ctx.db.insert("loyaltyTransactions", {
      customerId: args.customerId,
      orderId: args.orderId,
      type: "earned",
      points: earnedPoints,
      description: `Earned from order #${args.orderId.slice(-8)}`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { earnedPoints, newBalance, newTier };
  },
});

export const redeemPoints = mutation({
  args: {
    customerId: v.id("customers"),
    orderId: v.id("orders"),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const customer = await ctx.db.query("customers").withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject)).first();
    if (!customer || customer._id !== args.customerId) throw new Error("Unauthorized");

    if (args.points <= 0) throw new Error("Points must be positive");

    const settings = await ctx.db.query("loyaltySettings").first();
    if (!settings) throw new Error("Loyalty not configured");

    if (args.points < settings.minRedeemPoints) {
      throw new Error(`Minimum ${settings.minRedeemPoints} points to redeem`);
    }

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!account || account.pointsBalance < args.points) {
      throw new Error("Insufficient points");
    }

    const now = Date.now();
    const newBalance = account.pointsBalance - args.points;
    const newTotalRedeemed = account.totalRedeemed + args.points;

    await ctx.db.patch(account._id, {
      pointsBalance: newBalance,
      totalRedeemed: newTotalRedeemed,
      updatedAt: now,
    });

    await ctx.db.insert("loyaltyTransactions", {
      customerId: args.customerId,
      orderId: args.orderId,
      type: "redeemed",
      points: -args.points,
      description: `Redeemed for order #${args.orderId.slice(-8)}`,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { newBalance, redeemedValue: args.points * settings.rupeesPerPointRedemption };
  },
});
