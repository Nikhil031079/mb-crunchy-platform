// ============================================================================
// MB CRUNCHY - Business Units Queries & Mutations
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

async function slugExists(ctx: any, slug: string, excludeId?: string): Promise<boolean> {
  const existing = await ctx.db
    .query("businessUnits")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first();
  if (!existing) return false;
  if (excludeId && existing._id === excludeId) return false;
  return true;
}

// ============================================================================
// Queries
// ============================================================================

export const getActive = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("businessUnits")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.eq(q.field("homepageVisible"), true))
      .order("asc")
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businessUnits")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("businessUnits")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.string()),
    banner: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    themeColor: v.string(),
    secondaryColor: v.optional(v.string()),
    homepageVisible: v.boolean(),
    displayOrder: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    enableCombos: v.boolean(),
    enablePartyPacks: v.boolean(),
    enableOffers: v.boolean(),
    enableSearch: v.boolean(),
    enableCheckout: v.boolean(),
    enableDelivery: v.boolean(),
    enablePickup: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Enforce unique slug
    if (await slugExists(ctx, args.slug)) {
      throw new Error(`Slug "${args.slug}" is already in use`);
    }

    const now = Date.now();

    return await ctx.db.insert("businessUnits", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("businessUnits"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    logo: v.optional(v.string()),
    banner: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    themeColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    homepageVisible: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))),
    enableCombos: v.optional(v.boolean()),
    enablePartyPacks: v.optional(v.boolean()),
    enableOffers: v.optional(v.boolean()),
    enableSearch: v.optional(v.boolean()),
    enableCheckout: v.optional(v.boolean()),
    enableDelivery: v.optional(v.boolean()),
    enablePickup: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const { id, ...fields } = args;

    // Enforce unique slug on update
    if (fields.slug && (await slugExists(ctx, fields.slug, id))) {
      throw new Error(`Slug "${fields.slug}" is already in use`);
    }

    await ctx.db.patch(id, {
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Soft delete — sets status to "archived" and adds deletedAt timestamp.
 * Never permanently removes records.
 */
export const softDelete = mutation({
  args: { id: v.id("businessUnits") },
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

/**
 * Restore — clears deletedAt and reactivates the business unit.
 */
export const restore = mutation({
  args: { id: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      homepageVisible: true,
      deletedAt: undefined,
      updatedAt: now,
    });
  },
});
