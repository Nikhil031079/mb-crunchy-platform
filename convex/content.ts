// ============================================================================
// MB CRUNCHY - Content Management (Hero, Promotion, Announcement, etc.)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getActive = query({
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("content")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("startDate"), undefined),
          q.lte(q.field("startDate"), now),
          q.neq(q.field("endDate"), undefined),
          q.gte(q.field("endDate"), now)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("content")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getByType = query({
  args: {
    businessUnitId: v.optional(v.id("businessUnits")),
    contentType: v.union(
      v.literal("hero"),
      v.literal("promotion"),
      v.literal("offer"),
      v.literal("homepageCard"),
      v.literal("announcement"),
      v.literal("popup"),
      v.literal("seasonal")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let query = ctx.db
      .query("content")
      .withIndex("by_content_type", (q) => q.eq("contentType", args.contentType))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("status"), "active")
        )
      );

    if (args.businessUnitId) {
      query = query.filter((q) =>
        q.eq(q.field("businessUnitId"), args.businessUnitId)
      );
    }

    return await query.order("asc").collect();
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("content")
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
    sessionToken: v.string(),
    businessUnitId: v.optional(v.id("businessUnits")),
    contentType: v.union(
      v.literal("hero"),
      v.literal("promotion"),
      v.literal("offer"),
      v.literal("homepageCard"),
      v.literal("announcement"),
      v.literal("popup"),
      v.literal("seasonal")
    ),
    title: v.string(),
    subtitle: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.array(v.string()),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    buttonLink: v.optional(v.string()),
    displayOrder: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    await assertHeroExclusive(ctx, {
      excludeId: undefined,
      contentType: args.contentType,
      status: args.status,
      startDate: args.startDate,
      endDate: args.endDate,
      settings: args.settings,
    });

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    return await ctx.db.insert("content", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("content"),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    body: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    coverImage: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    buttonLink: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Content not found");

    await assertHeroExclusive(ctx, {
      excludeId: args.id,
      contentType: existing.contentType,
      status: args.status ?? existing.status,
      startDate: args.startDate ?? existing.startDate,
      endDate: args.endDate ?? existing.endDate,
      settings: args.settings ?? existing.settings,
    });

    const { sessionToken: _, id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("content") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Helpers
// ============================================================================

function isHeroExclusive(settings: Record<string, unknown> | undefined): boolean {
  return settings?.exclusive === true;
}

function rangesOverlap(
  aStart: number | undefined,
  aEnd: number | undefined,
  bStart: number | undefined,
  bEnd: number | undefined
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Prevent two exclusive hero banners from being active in the same time window.
 * Only enforced when a hero banner is marked `exclusive` in settings.
 */
async function assertHeroExclusive(
  ctx: QueryCtx,
  candidate: {
    excludeId: string | undefined;
    contentType: string;
    status: string;
    startDate?: number;
    endDate?: number;
    settings?: Record<string, unknown>;
  }
): Promise<void> {
  if (candidate.contentType !== "hero") return;
  if (!isHeroExclusive(candidate.settings)) return;
  if (candidate.status !== "active") return;

  const heroes = await ctx.db
    .query("content")
    .withIndex("by_content_type", (q) => q.eq("contentType", "hero"))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();

  for (const hero of heroes) {
    if (candidate.excludeId && hero._id === candidate.excludeId) continue;
    if (hero.status !== "active") continue;
    if (!isHeroExclusive(hero.settings)) continue;
    if (
      rangesOverlap(
        candidate.startDate,
        candidate.endDate,
        hero.startDate,
        hero.endDate
      )
    ) {
      throw new Error(
        `This exclusive hero banner overlaps with "${hero.title}" (${new Date(
          hero.startDate!
        ).toLocaleDateString()} – ${new Date(hero.endDate!).toLocaleDateString()}). Choose a different schedule.`
      );
    }
  }
}
