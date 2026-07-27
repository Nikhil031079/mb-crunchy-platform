// ============================================================================
// MB CRUNCHY - Customer Addresses
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const getDefault = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_default", (q) =>
        q.eq("customerId", args.customerId).eq("isDefault", true)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    label: v.string(),
    address: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    landmark: v.optional(v.string()),
    deliveryInstructions: v.optional(v.string()),
    deliveryZone: v.optional(v.string()),
    isDefault: v.boolean(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const now = Date.now();

    // Verify customer ownership
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found");
    if (customer.authUserId !== identity.subject) throw new Error("Unauthorized");

    // If this is the default address, unset other defaults
    if (args.isDefault) {
      const existing = await ctx.db
        .query("addresses")
        .withIndex("by_default", (q) =>
          q.eq("customerId", args.customerId).eq("isDefault", true)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { isDefault: false, updatedAt: now });
      }
    }

    return await ctx.db.insert("addresses", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("addresses"),
    label: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    landmark: v.optional(v.string()),
    deliveryInstructions: v.optional(v.string()),
    deliveryZone: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const now = Date.now();
    const { id, ...fields } = args;

    // Verify ownership
    const address = await ctx.db.get(id);
    if (address) {
      const customer = await ctx.db.get(address.customerId);
      if (customer && customer.authUserId !== identity.subject) throw new Error("Unauthorized");
    }

    // If setting as default, unset other defaults
    if (fields.isDefault) {
      const address = await ctx.db.get(id);
      if (address) {
        const existing = await ctx.db
          .query("addresses")
          .withIndex("by_default", (q) =>
            q.eq("customerId", address.customerId).eq("isDefault", true)
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .first();

        if (existing && existing._id !== id) {
          await ctx.db.patch(existing._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    await ctx.db.patch(id, { ...fields, updatedAt: now });
  },
});

export const setDefault = mutation({
  args: { id: v.id("addresses") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const address = await ctx.db.get(args.id);
    if (!address) throw new Error("Address not found");

    // Unset current default
    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_default", (q) =>
        q.eq("customerId", address.customerId).eq("isDefault", true)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { isDefault: false, updatedAt: now });
    }

    await ctx.db.patch(args.id, { isDefault: true, updatedAt: now });
  },
});

export const softDelete = mutation({
  args: { id: v.id("addresses") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
