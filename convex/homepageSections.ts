// ============================================================================
// MB CRUNCHY - Homepage Sections (Layout Builder)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// Default homepage layout sections
const DEFAULT_SECTIONS = [
  { sectionType: "hero", displayOrder: 0, visible: true, title: "Hero" },
  { sectionType: "businessUnits", displayOrder: 1, visible: true, title: "Our Business Units" },
  { sectionType: "featuredProducts", displayOrder: 2, visible: true, title: "Featured Products" },
  { sectionType: "combos", displayOrder: 3, visible: true, title: "Combos" },
  { sectionType: "partyPacks", displayOrder: 4, visible: true, title: "Party Packs" },
  { sectionType: "offers", displayOrder: 5, visible: true, title: "Offers" },
  { sectionType: "testimonials", displayOrder: 6, visible: false, title: "Testimonials" },
  { sectionType: "footer", displayOrder: 7, visible: true, title: "Footer" },
] as const;

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const sections = await ctx.db
      .query("homepageSections")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();

    return sections;
  },
});

export const getVisible = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const sections = await ctx.db
      .query("homepageSections")
      .withIndex("by_visible", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("visible", true)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();

    return sections;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const initializeDefaults = mutation({
  args: { sessionToken: v.string(), businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();

    // Check if sections already exist
    const existing = await ctx.db
      .query("homepageSections")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .first();

    if (existing) return; // Already initialized

    // Create default sections
    for (const section of DEFAULT_SECTIONS) {
      await ctx.db.insert("homepageSections", {
        businessUnitId: args.businessUnitId,
        sectionType: section.sectionType as any,
        title: section.title,
        displayOrder: section.displayOrder,
        visible: section.visible,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
    sectionType: v.union(
      v.literal("hero"),
      v.literal("businessUnits"),
      v.literal("featuredProducts"),
      v.literal("combos"),
      v.literal("partyPacks"),
      v.literal("offers"),
      v.literal("content"),
      v.literal("testimonials"),
      v.literal("footer")
    ),
    title: v.optional(v.string()),
    displayOrder: v.number(),
    visible: v.boolean(),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    return await ctx.db.insert("homepageSections", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("homepageSections"),
    title: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    visible: v.optional(v.boolean()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { sessionToken: _, id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    sessionToken: v.string(),
    items: v.array(
      v.object({
        id: v.id("homepageSections"),
        displayOrder: v.number(),
        visible: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    for (const item of args.items) {
      await ctx.db.patch(item.id, {
        displayOrder: item.displayOrder,
        visible: item.visible,
        updatedAt: now,
      });
    }
  },
});

export const softDelete = mutation({
  args: { sessionToken: v.string(), id: v.id("homepageSections") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
