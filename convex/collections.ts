// ============================================================================
// MB CRUNCHY - Customer Collections (Generic)
// Supports: favorites, wishlist, recentlyViewed, savedForLater
// Uses soft delete (deletedAt) for all removals
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getByCustomer = query({
  args: {
    customerId: v.id("customers"),
    collectionType: v.optional(
      v.union(
        v.literal("favorites"),
        v.literal("wishlist"),
        v.literal("recentlyViewed"),
        v.literal("savedForLater"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) => q.eq("customerId", args.customerId));

    if (args.collectionType) {
      q = q.filter((q) => q.eq(q.field("collectionType"), args.collectionType));
    }

    return await q
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const getByCustomerAndType = query({
  args: {
    customerId: v.id("customers"),
    collectionType: v.union(
      v.literal("favorites"),
      v.literal("wishlist"),
      v.literal("recentlyViewed"),
      v.literal("savedForLater"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q.eq("customerId", args.customerId).eq("collectionType", args.collectionType),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const bulkCheck = query({
  args: {
    customerId: v.id("customers"),
    collectionType: v.union(
      v.literal("favorites"),
      v.literal("wishlist"),
      v.literal("recentlyViewed"),
      v.literal("savedForLater"),
    ),
    items: v.array(
      v.object({
        itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
        itemId: v.id("catalogItems"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) return [];

    const results: { itemType: string; itemId: string; inCollection: boolean }[] = [];

    for (const item of args.items) {
      const existing = await ctx.db
        .query("customerCollections")
        .withIndex("by_customer_type", (q) =>
          q
            .eq("customerId", args.customerId)
            .eq("collectionType", args.collectionType),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("itemType"), item.itemType),
            q.eq(q.field("itemId"), item.itemId),
            q.eq(q.field("deletedAt"), undefined),
          ),
        )
        .first();

      results.push({
        itemType: item.itemType,
        itemId: item.itemId,
        inCollection: !!existing,
      });
    }

    return results;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const toggle = mutation({
  args: {
    customerId: v.id("customers"),
    collectionType: v.union(
      v.literal("favorites"),
      v.literal("wishlist"),
      v.literal("recentlyViewed"),
      v.literal("savedForLater"),
    ),
    itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
    itemId: v.id("catalogItems"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if record exists (active or soft-deleted)
    const existing = await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q
          .eq("customerId", args.customerId)
          .eq("collectionType", args.collectionType),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("itemType"), args.itemType),
          q.eq(q.field("itemId"), args.itemId),
        ),
      )
      .first();

    if (existing) {
      if (existing.deletedAt) {
        // Reactivate soft-deleted record
        await ctx.db.patch(existing._id, { deletedAt: undefined, updatedAt: now });
        return { added: true };
      } else {
        // Soft-delete active record
        await ctx.db.patch(existing._id, { deletedAt: now, updatedAt: now });
        return { added: false };
      }
    }

    // Insert new record
    await ctx.db.insert("customerCollections", {
      customerId: args.customerId,
      collectionType: args.collectionType,
      itemType: args.itemType,
      itemId: args.itemId,
      createdAt: now,
      updatedAt: now,
    });
    return { added: true };
  },
});

export const add = mutation({
  args: {
    customerId: v.id("customers"),
    collectionType: v.union(
      v.literal("favorites"),
      v.literal("wishlist"),
      v.literal("recentlyViewed"),
      v.literal("savedForLater"),
    ),
    itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
    itemId: v.id("catalogItems"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if record exists
    const existing = await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q
          .eq("customerId", args.customerId)
          .eq("collectionType", args.collectionType),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("itemType"), args.itemType),
          q.eq(q.field("itemId"), args.itemId),
        ),
      )
      .first();

    if (existing) {
      if (existing.deletedAt) {
        // Reactivate soft-deleted
        await ctx.db.patch(existing._id, { deletedAt: undefined, updatedAt: now });
        return { added: true };
      }
      // Already active
      return { added: false };
    }

    await ctx.db.insert("customerCollections", {
      customerId: args.customerId,
      collectionType: args.collectionType,
      itemType: args.itemType,
      itemId: args.itemId,
      createdAt: now,
      updatedAt: now,
    });
    return { added: true };
  },
});

export const remove = mutation({
  args: {
    customerId: v.id("customers"),
    collectionType: v.union(
      v.literal("favorites"),
      v.literal("wishlist"),
      v.literal("recentlyViewed"),
      v.literal("savedForLater"),
    ),
    itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
    itemId: v.id("catalogItems"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q
          .eq("customerId", args.customerId)
          .eq("collectionType", args.collectionType),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("itemType"), args.itemType),
          q.eq(q.field("itemId"), args.itemId),
          q.eq(q.field("deletedAt"), undefined),
        ),
      )
      .first();

    if (!existing) return { removed: false };

    await ctx.db.patch(existing._id, { deletedAt: now, updatedAt: now });
    return { removed: true };
  },
});

export const recordRecentlyViewed = mutation({
  args: {
    customerId: v.id("customers"),
    itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
    itemId: v.id("catalogItems"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Upsert: reactivate if soft-deleted, or update timestamp if active, or insert new
    const existing = await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q
          .eq("customerId", args.customerId)
          .eq("collectionType", "recentlyViewed"),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("itemType"), args.itemType),
          q.eq(q.field("itemId"), args.itemId),
        ),
      )
      .first();

    if (existing) {
      // Update timestamp (move to top)
      await ctx.db.patch(existing._id, {
        deletedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("customerCollections", {
        customerId: args.customerId,
        collectionType: "recentlyViewed",
        itemType: args.itemType,
        itemId: args.itemId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Prune: keep max 50 recently viewed items per customer
    const allRecent = await ctx.db
      .query("customerCollections")
      .withIndex("by_customer_type", (q) =>
        q.eq("customerId", args.customerId).eq("collectionType", "recentlyViewed"),
      )
      .order("desc")
      .collect();

    if (allRecent.length > 50) {
      const toPrune = allRecent.slice(50);
      for (const item of toPrune) {
        await ctx.db.patch(item._id, { deletedAt: now, updatedAt: now });
      }
    }
  },
});
