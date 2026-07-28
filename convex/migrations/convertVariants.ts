import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * One-time migration: converts old-style variants ({name, price, compareAtPrice?})
 * to the new generic variant model ({optionName, optionValue, price, ...}).
 *
 * Idempotent — skips products already migrated.
 */
export const convertVariants = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await import("../utils/adminAuth").then((m) =>
      m.requireAdminSession(ctx, args.sessionToken)
    );

    const products = await ctx.db.query("products").collect();
    let migrated = 0;
    let skipped = 0;

    for (const product of products) {
      const variants = product.variants as any[];
      if (!variants || variants.length === 0) continue;

      // Already migrated?
      if (variants[0] && "optionName" in variants[0]) {
        skipped++;
        continue;
      }

      const newVariants = variants.map((v: any, i: number) => ({
        optionName: "",
        optionValue: v.name ?? "Default",
        price: v.price ?? 0,
        compareAtPrice: v.compareAtPrice,
        sku: undefined,
        barcode: undefined,
        stock: undefined,
        costPrice: undefined,
        taxPercentage: undefined,
        image: undefined,
        minOrderQty: undefined,
        isDefault: i === 0,
        sortOrder: i,
        active: true,
      }));

      await ctx.db.patch(product._id, {
        variants: newVariants,
        updatedAt: Date.now(),
      });

      migrated++;
    }

    return { total: products.length, migrated, skipped };
  },
});
