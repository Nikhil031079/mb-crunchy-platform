// ============================================================================
// MB CRUNCHY - Meal Deals Queries & Mutations
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminSession } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getByBusinessUnit = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("mealDeals")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("asc")
      .collect();
  },
});

export const getActiveForCustomer = query({
  args: { businessUnitId: v.id("businessUnits") },
  handler: async (ctx, args) => {
    const deals = await ctx.db
      .query("mealDeals")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .order("asc")
      .collect();

    const enriched = await Promise.all(
      deals.map(async (deal) => {
        const qualifyingItems = await Promise.all(
          deal.qualifyingItems.map(async (qi) => {
            const catalogItem = await ctx.db.get(qi.catalogItemId);
            if (!catalogItem || catalogItem.status !== "active" || catalogItem.deletedAt) {
              return null;
            }
            return {
              catalogItemId: qi.catalogItemId,
              quantity: qi.quantity,
              name: catalogItem.name,
              price: catalogItem.price,
              compareAtPrice: catalogItem.compareAtPrice,
            };
          })
        );

        const validItems = qualifyingItems.filter(Boolean);
        if (validItems.length !== deal.qualifyingItems.length) {
          return null;
        }

        const individualTotal = validItems.reduce(
          (sum, item) => sum + (item!.price * item!.quantity),
          0
        );

        return {
          _id: deal._id,
          businessUnitId: deal.businessUnitId,
          name: deal.name,
          dealPrice: deal.dealPrice,
          individualTotal,
          savings: individualTotal - deal.dealPrice,
          qualifyingItems: validItems,
          applyToCombos: deal.applyToCombos,
          applyToPartyPacks: deal.applyToPartyPacks,
          ...(deal.parentCatalogItemIds
            ? { parentCatalogItemIds: deal.parentCatalogItemIds }
            : {}),
          cartSmartDetection: deal.cartSmartDetection,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("mealDeals")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("mealDeals")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.ids.map(async (id) => {
        const doc = await ctx.db.get(id);
        if (!doc || doc.deletedAt) return null;
        return doc;
      })
    );
    return results.filter(Boolean);
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    businessUnitId: v.id("businessUnits"),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    dealPrice: v.number(),
    qualifyingItems: v.array(
      v.object({
        catalogItemId: v.id("catalogItems"),
        quantity: v.number(),
      })
    ),
    applyToCombos: v.boolean(),
    applyToPartyPacks: v.boolean(),
    parentCatalogItemIds: v.optional(v.array(v.id("catalogItems"))),
    cartSmartDetection: v.boolean(),
    displayOrder: v.number(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    for (const item of args.qualifyingItems) {
      const catalogItem = await ctx.db.get(item.catalogItemId);
      if (!catalogItem) {
        throw new Error(`Catalog item ${item.catalogItemId} not found`);
      }
      if (catalogItem.businessUnitId !== args.businessUnitId) {
        throw new Error(
          `Catalog item "${catalogItem.name}" belongs to a different business unit`
        );
      }
      if (item.quantity < 1) {
        throw new Error("Qualifying item quantity must be at least 1");
      }
    }

    if (args.qualifyingItems.length === 0) {
      throw new Error("Meal deal must have at least one qualifying item");
    }

    // Validate parentCatalogItemIds: each ID must be a valid parent type
    // (combo when applyToCombos, partyPack when applyToPartyPacks) in the
    // same business unit. Empty array is treated as undefined (all eligible).
    if (args.parentCatalogItemIds && args.parentCatalogItemIds.length > 0) {
      const seen = new Set<string>();
      for (const parentId of args.parentCatalogItemIds) {
        if (seen.has(parentId)) {
          throw new Error(`Duplicate parent catalog item ID: ${parentId}`);
        }
        seen.add(parentId);

        const parentItem = await ctx.db.get(parentId);
        if (!parentItem) {
          throw new Error(`Parent catalog item ${parentId} not found`);
        }
        if (parentItem.businessUnitId !== args.businessUnitId) {
          throw new Error(
            `Parent catalog item "${parentItem.name}" belongs to a different business unit`
          );
        }
        if (parentItem.itemType === "combo" && !args.applyToCombos) {
          throw new Error(
            `Parent catalog item "${parentItem.name}" is a combo but applyToCombos is false`
          );
        }
        if (parentItem.itemType === "partyPack" && !args.applyToPartyPacks) {
          throw new Error(
            `Parent catalog item "${parentItem.name}" is a party pack but applyToPartyPacks is false`
          );
        }
        if (parentItem.itemType === "product") {
          throw new Error(
            `Parent catalog item "${parentItem.name}" is not a combo or party pack`
          );
        }
      }
    }

    const { sessionToken: _, ...insertArgs } = args;
    const now = Date.now();

    return await ctx.db.insert("mealDeals", {
      ...insertArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("mealDeals"),
    name: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"))
    ),
    dealPrice: v.optional(v.number()),
    qualifyingItems: v.optional(
      v.array(
        v.object({
          catalogItemId: v.id("catalogItems"),
          quantity: v.number(),
        })
      )
    ),
    applyToCombos: v.optional(v.boolean()),
    applyToPartyPacks: v.optional(v.boolean()),
    parentCatalogItemIds: v.optional(v.array(v.id("catalogItems"))),
    cartSmartDetection: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const { id, sessionToken: _, ...fields } = args;

    // Resolve effective applyToCombos / applyToPartyPacks for validation
    const existingDoc = await ctx.db.get(id);
    if (!existingDoc) throw new Error("Meal deal not found");
    const businessUnitId = existingDoc.businessUnitId;
    const effectiveApplyToCombos =
      fields.applyToCombos ?? existingDoc.applyToCombos;
    const effectiveApplyToPartyPacks =
      fields.applyToPartyPacks ?? existingDoc.applyToPartyPacks;

    if (fields.qualifyingItems) {
      for (const item of fields.qualifyingItems) {
        const catalogItem = await ctx.db.get(item.catalogItemId);
        if (!catalogItem) {
          throw new Error(`Catalog item ${item.catalogItemId} not found`);
        }
        if (catalogItem.businessUnitId !== businessUnitId) {
          throw new Error(
            `Catalog item "${catalogItem.name}" belongs to a different business unit`
          );
        }
        if (item.quantity < 1) {
          throw new Error("Qualifying item quantity must be at least 1");
        }
      }

      if (fields.qualifyingItems.length === 0) {
        throw new Error("Meal deal must have at least one qualifying item");
      }
    }

    // Validate parentCatalogItemIds when explicitly provided.
    // An explicit empty array is accepted (same semantics as undefined = all eligible).
    if (fields.parentCatalogItemIds !== undefined) {
      if (fields.parentCatalogItemIds.length > 0) {
        const seen = new Set<string>();
        for (const parentId of fields.parentCatalogItemIds) {
          if (seen.has(parentId)) {
            throw new Error(`Duplicate parent catalog item ID: ${parentId}`);
          }
          seen.add(parentId);

          const parentItem = await ctx.db.get(parentId);
          if (!parentItem) {
            throw new Error(`Parent catalog item ${parentId} not found`);
          }
          if (parentItem.businessUnitId !== businessUnitId) {
            throw new Error(
              `Parent catalog item "${parentItem.name}" belongs to a different business unit`
            );
          }
          if (parentItem.itemType === "combo" && !effectiveApplyToCombos) {
            throw new Error(
              `Parent catalog item "${parentItem.name}" is a combo but applyToCombos is false`
            );
          }
          if (parentItem.itemType === "partyPack" && !effectiveApplyToPartyPacks) {
            throw new Error(
              `Parent catalog item "${parentItem.name}" is a party pack but applyToPartyPacks is false`
            );
          }
          if (parentItem.itemType === "product") {
            throw new Error(
              `Parent catalog item "${parentItem.name}" is not a combo or party pack`
            );
          }
        }
      }
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const softDelete = mutation({
  args: { id: v.id("mealDeals"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "inactive",
      deletedAt: now,
      updatedAt: now,
    });
  },
});

export const restore = mutation({
  args: { id: v.id("mealDeals"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Server-side meal deal validation for order creation
// ============================================================================

export const validateMealDealForOrder = query({
  args: {
    mealDealId: v.id("mealDeals"),
    cartItems: v.array(
      v.object({
        catalogItemId: v.id("catalogItems"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.mealDealId);
    if (!deal || deal.status !== "active" || deal.deletedAt) {
      return { valid: false, error: "Meal deal is no longer active" };
    }

    for (const qi of deal.qualifyingItems) {
      const cartItem = args.cartItems.find(
        (ci) => ci.catalogItemId === qi.catalogItemId
      );
      if (!cartItem || cartItem.quantity < qi.quantity) {
        return { valid: false, error: "Insufficient qualifying items" };
      }
    }

    const individualTotal = deal.qualifyingItems.reduce(
      (sum, qi) => {
        const cartItem = args.cartItems.find(
          (ci) => ci.catalogItemId === qi.catalogItemId
        );
        return sum + (cartItem?.quantity ?? 0) * qi.quantity;
      },
      0
    );

    return {
      valid: true,
      dealPrice: deal.dealPrice,
      individualTotal,
    };
  },
});
