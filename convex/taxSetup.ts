// ============================================================================
// MB CRUNCHY - GST Setup (HSN code + GST rate per sellable item)
//
// Every order line points at a catalogItems record (product, combo or party
// pack), so tax data lives there. The product/combo sync never overwrites it.
// ============================================================================

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminRole } from "./utils/adminAuth";
import { validateGstRate, validateHsn } from "./utils/businessProfile";

const MAX_UPDATES_PER_CALL = 200;

export const listItems = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const items = await ctx.db
      .query("catalogItems")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return items
      .filter((item) => item.status !== "archived")
      .map((item) => ({
        _id: item._id,
        name: item.name,
        itemType: item.itemType,
        businessUnitId: item.businessUnitId,
        price: item.price,
        status: item.status,
        hsnCode: item.hsnCode,
        gstRatePercent: item.gstRatePercent,
      }));
  },
});

export const setTaxInfo = mutation({
  args: {
    sessionToken: v.string(),
    updates: v.array(
      v.object({
        id: v.id("catalogItems"),
        // null clears the value; undefined leaves it unchanged
        hsnCode: v.optional(v.union(v.string(), v.null())),
        gstRatePercent: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    if (args.updates.length > MAX_UPDATES_PER_CALL) {
      throw new Error(`Too many changes at once (max ${MAX_UPDATES_PER_CALL})`);
    }

    // Validate everything first so a bad row never leaves a partial save.
    const patches: Array<{ id: (typeof args.updates)[number]["id"]; patch: Record<string, unknown> }> = [];
    for (const update of args.updates) {
      const item = await ctx.db.get(update.id);
      if (!item || item.deletedAt) throw new Error("Item not found");

      const patch: Record<string, unknown> = {};
      if (update.hsnCode !== undefined) {
        if (update.hsnCode === null || update.hsnCode.trim() === "") {
          patch.hsnCode = undefined;
        } else {
          const result = validateHsn(update.hsnCode);
          if (!result.ok) throw new Error(`${item.name}: ${result.error}`);
          patch.hsnCode = result.value;
        }
      }
      if (update.gstRatePercent !== undefined) {
        if (update.gstRatePercent === null) {
          patch.gstRatePercent = undefined;
        } else {
          const result = validateGstRate(update.gstRatePercent);
          if (!result.ok) throw new Error(`${item.name}: ${result.error}`);
          patch.gstRatePercent = result.value;
        }
      }
      patches.push({ id: update.id, patch });
    }

    const now = Date.now();
    for (const { id, patch } of patches) {
      await ctx.db.patch(id, { ...patch, updatedAt: now });
    }
    return { updated: patches.length };
  },
});
