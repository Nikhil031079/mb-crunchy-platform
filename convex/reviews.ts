// ============================================================================
// MB CRUNCHY — Reviews & Ratings
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getByCatalogItem = query({
  args: {
    catalogItemId: v.id("catalogItems"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("reviews")
      .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", args.catalogItemId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined),
        )
      )
      .order("desc")
      .take(limit);
  },
});

export const getStats = query({
  args: { catalogItemId: v.id("catalogItems") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", args.catalogItemId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined),
        )
      )
      .collect();

    if (reviews.length === 0) {
      return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    }

    let sum = 0;
    const distribution = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      sum += r.rating;
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating - 1]++;
      }
    }

    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
      distribution,
    };
  },
});

export const getCustomerReview = query({
  args: {
    catalogItemId: v.id("catalogItems"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) =>
        q.and(
          q.eq(q.field("catalogItemId"), args.catalogItemId),
          q.eq(q.field("deletedAt"), undefined),
        )
      )
      .collect();

    return reviews[0] ?? null;
  },
});

export const getAverageByCatalogItemIds = query({
  args: { ids: v.array(v.id("catalogItems")) },
  handler: async (ctx, args) => {
    const results: Record<string, { average: number; count: number }> = {};
    for (const id of args.ids) {
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_catalog_item", (q) => q.eq("catalogItemId", id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("deletedAt"), undefined),
          )
        )
        .collect();
      if (reviews.length > 0) {
        const sum = reviews.reduce((s, r) => s + r.rating, 0);
        results[id as string] = {
          average: Math.round((sum / reviews.length) * 10) / 10,
          count: reviews.length,
        };
      } else {
        results[id as string] = { average: 0, count: 0 };
      }
    }
    return results;
  },
});

export const getAll = query({
  args: { businessUnitId: v.optional(v.id("businessUnits")) },
  handler: async (ctx, args) => {
    let q = args.businessUnitId
      ? ctx.db
          .query("reviews")
          .withIndex("by_business_unit", (r) =>
            r.eq("businessUnitId", args.businessUnitId!)
          )
      : ctx.db.query("reviews");
    return await q
      .filter((r) =>
        r.and(
          r.eq(r.field("status"), "active"),
          r.eq(r.field("deletedAt"), undefined),
        )
      )
      .order("desc")
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    catalogItemId: v.id("catalogItems"),
    customerId: v.id("customers"),
    orderId: v.optional(v.id("orders")),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const customer = await ctx.db.query("customers").withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject)).first();
    if (!customer || customer._id !== args.customerId) throw new Error("Unauthorized");

    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const now = Date.now();

    // Check for duplicate review (one review per customer per product)
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("catalogItemId"), args.catalogItemId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (existing) {
      throw new Error("You have already reviewed this product");
    }

    // Verify purchase if orderId provided
    let verifiedPurchase = false;
    if (args.orderId) {
      const order = await ctx.db.get(args.orderId);
      if (order && order.customerId === args.customerId) {
        verifiedPurchase = true;
      }
    }

    return await ctx.db.insert("reviews", {
      businessUnitId: args.businessUnitId,
      catalogItemId: args.catalogItemId,
      customerId: args.customerId,
      orderId: args.orderId,
      rating: args.rating,
      title: args.title,
      body: args.body,
      images: args.images,
      verifiedPurchase,
      helpfulCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("reviews"),
    customerId: v.id("customers"),
    rating: v.optional(v.number()),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const customer = await ctx.db.query("customers").withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject)).first();
    if (!customer || customer._id !== args.customerId) throw new Error("Unauthorized");

    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Review not found");
    if (review.customerId !== args.customerId) throw new Error("Not authorized");
    if (review.deletedAt) throw new Error("Review has been deleted");

    if (args.rating !== undefined && (args.rating < 1 || args.rating > 5)) {
      throw new Error("Rating must be between 1 and 5");
    }

    await ctx.db.patch(args.reviewId, {
      ...(args.rating !== undefined && { rating: args.rating }),
      ...(args.title !== undefined && { title: args.title }),
      ...(args.body !== undefined && { body: args.body }),
      ...(args.images !== undefined && { images: args.images }),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    reviewId: v.id("reviews"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const customer = await ctx.db.query("customers").withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject)).first();
    if (!customer || customer._id !== args.customerId) throw new Error("Unauthorized");

    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Review not found");
    if (review.customerId !== args.customerId) throw new Error("Not authorized");

    await ctx.db.patch(args.reviewId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markHelpful = mutation({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Review not found");

    await ctx.db.patch(args.reviewId, {
      helpfulCount: review.helpfulCount + 1,
      updatedAt: Date.now(),
    });
  },
});
