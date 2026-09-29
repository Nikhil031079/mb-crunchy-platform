// ============================================================================
// MB CRUNCHY - Shipping Rates CRUD (Static weight-slab pricing)
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdminRole } from "./utils/adminAuth";

// ============================================================================
// Queries
// ============================================================================

export const getByZone = query({
  args: {
    shippingZoneId: v.id("shippingZones"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingRates")
      .withIndex("by_zone", (q) =>
        q.eq("shippingZoneId", args.shippingZoneId).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

export const getByBusinessUnit = query({
  args: {
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingRates")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("asc")
      .collect();
  },
});

// ============================================================================
// Coverage Reporting (12D — read-only admin visibility)
// ----------------------------------------------------------------------------
// Pure slab analysis using the SAME inclusive semantics as the shipping
// engine (minWeightGrams <= weight <= maxWeightGrams). Inactive or deleted
// rates never count toward coverage. Overlaps/gaps are admin warnings only.
// ============================================================================

export interface SlabOverlap {
  rateA: string;
  rateB: string;
  overlapFrom: number;
  overlapTo: number;
}

export interface SlabGap {
  /** Highest contiguously covered weight below the gap. */
  coveredUpTo: number;
  /** Lowest covered weight above the gap. */
  resumesAt: number;
}

export interface SlabCoverage {
  activeRates: number;
  lowestActiveMin: number | null;
  highestActiveMax: number | null;
  overlaps: SlabOverlap[];
  gaps: SlabGap[];
}

export function analyzeSlabs(
  rates: Array<{
    _id: string;
    minWeightGrams: number;
    maxWeightGrams: number;
    status: string;
    deletedAt?: number;
  }>,
): SlabCoverage {
  const active = rates
    .filter((r) => r.status === "active" && r.deletedAt === undefined)
    .map((r) => ({ id: r._id, min: r.minWeightGrams, max: r.maxWeightGrams }))
    .filter((r) => r.min <= r.max)
    .sort((a, b) => a.min - b.min || a.max - b.max);

  const overlaps: SlabOverlap[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (b.min > a.max) break;
      overlaps.push({
        rateA: a.id,
        rateB: b.id,
        overlapFrom: Math.max(a.min, b.min),
        overlapTo: Math.min(a.max, b.max),
      });
    }
  }

  const gaps: SlabGap[] = [];
  let coveredUpTo: number | null = null;
  for (const slab of active) {
    if (coveredUpTo === null) {
      coveredUpTo = slab.max;
    } else if (slab.min > coveredUpTo + 1) {
      gaps.push({ coveredUpTo, resumesAt: slab.min });
      coveredUpTo = slab.max;
    } else if (slab.max > coveredUpTo) {
      coveredUpTo = slab.max;
    }
  }

  return {
    activeRates: active.length,
    lowestActiveMin: active.length > 0 ? active[0].min : null,
    highestActiveMax: coveredUpTo,
    overlaps,
    gaps,
  };
}

export interface RateCoverageZone {
  shippingZoneId: string;
  activeRates: number;
  ceiling: number | null;
  overlaps: SlabOverlap[];
  gaps: SlabGap[];
}

export interface RateCoverage {
  total: number;
  active: number;
  inactive: number;
  lowestActiveMin: number | null;
  highestActiveMax: number | null;
  overlaps: SlabOverlap[];
  gaps: SlabGap[];
  zones: RateCoverageZone[];
}

/**
 * Read-only coverage summary for one business unit (12D). Single indexed
 * read; no writes; superadmin/admin only.
 */
export const getCoverage = query({
  args: {
    sessionToken: v.string(),
    businessUnitId: v.id("businessUnits"),
  },
  handler: async (ctx, args): Promise<RateCoverage> => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);
    const rates = await ctx.db
      .query("shippingRates")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const overall = analyzeSlabs(rates);
    const byZone = new Map<string, typeof rates>();
    for (const r of rates) {
      const list = byZone.get(r.shippingZoneId as string) ?? [];
      list.push(r);
      byZone.set(r.shippingZoneId as string, list);
    }
    // Overlaps/gaps are only meaningful WITHIN a zone (the engine matches
    // slabs per zone), so top-level lists flatten the per-zone findings.
    const zones: RateCoverageZone[] = [...byZone.entries()].map(
      ([shippingZoneId, zoneRates]) => {
        const z = analyzeSlabs(zoneRates);
        return {
          shippingZoneId,
          activeRates: z.activeRates,
          ceiling: z.highestActiveMax,
          overlaps: z.overlaps,
          gaps: z.gaps,
        };
      },
    );

    return {
      total: rates.length,
      active: rates.filter(
        (r) => r.status === "active" && r.deletedAt === undefined
      ).length,
      inactive: rates.filter(
        (r) => !(r.status === "active" && r.deletedAt === undefined)
      ).length,
      lowestActiveMin: overall.lowestActiveMin,
      highestActiveMax: overall.highestActiveMax,
      overlaps: zones.flatMap((z) => z.overlaps),
      gaps: zones.flatMap((z) => z.gaps),
      zones,
    };
  },
});

// ============================================================================
// Canonical Mart Shipping Quote
// ============================================================================

export type ShippingQuote = {
  serviceable: boolean;
  error?: string;
  shippingCharge?: number;
  shippingZoneId?: Id<"shippingZones">;
  shippingZoneName?: string;
  shippingRateId?: Id<"shippingRates">;
  shippingRateName?: string;
  actualWeightGrams?: number;
  billableWeightGrams?: number;
};

/**
 * Canonical Mart pincode-region shipping calculation.
 * Single implementation used by both quoteForCart (query) and orders.create (mutation).
 * The client must never implement this algorithm.
 */
export async function resolveMartShippingQuote(
  ctx: QueryCtx | MutationCtx,
  args: {
    businessUnitId: Id<"businessUnits">;
    items: Array<{
      catalogItemId: Id<"catalogItems">;
      variantName: string;
      quantity: number;
    }>;
    destinationPincode: string;
  },
): Promise<ShippingQuote> {
  // 1. Validate pincode format
  const pincode = args.destinationPincode.trim();
  if (!/^\d{6}$/.test(pincode)) {
    return { serviceable: false, error: "Invalid pincode format." };
  }

  // 2. Resolve business unit
  const bu = await ctx.db.get(args.businessUnitId);
  if (!bu || bu.deletedAt !== undefined) {
    return { serviceable: false, error: "Business unit not found." };
  }
  if (!bu.enableDelivery) {
    return { serviceable: false, error: "Delivery is not enabled for this business unit." };
  }

  // 3. Verify serviceabilityMode is pincode_region
  const mode = bu.serviceabilityMode ?? "coordinate_radius";
  if (mode !== "pincode_region") {
    return { serviceable: false, error: "This business unit does not use courier-based delivery." };
  }

  // 4. Look up pincode record
  const pincodeRecord = await ctx.db
    .query("martPincodeServiceability")
    .withIndex("by_bu_pincode", (q) =>
      q.eq("businessUnitId", args.businessUnitId).eq("pincode", pincode),
    )
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();

  if (!pincodeRecord || pincodeRecord.status !== "active") {
    return { serviceable: false, error: "Delivery is not available for this pincode." };
  }

  // 5. Require shippingZoneId on pincode
  if (!pincodeRecord.shippingZoneId) {
    return { serviceable: false, error: "Shipping zone is not configured for this pincode." };
  }

  // 6. Fetch and validate shipping zone
  const shippingZone = await ctx.db.get(pincodeRecord.shippingZoneId);
  if (!shippingZone || shippingZone.deletedAt !== undefined || shippingZone.status !== "active") {
    return { serviceable: false, error: "Shipping zone is not available for this area." };
  }
  if (shippingZone.businessUnitId !== args.businessUnitId) {
    return { serviceable: false, error: "Shipping zone configuration error." };
  }

  // 7. Fetch active shippingConfig (minimum billable weight)
  const config = await ctx.db
    .query("shippingConfig")
    .withIndex("by_business_unit", (q) =>
      q.eq("businessUnitId", args.businessUnitId),
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();

  if (!config) {
    return { serviceable: false, error: "Shipping is not configured for this business unit." };
  }

  // 8. Resolve authoritative weight for each cart item
  let totalActualWeightGrams = 0;

  for (const item of args.items) {
    const catalogItem = await ctx.db.get(item.catalogItemId);
    if (!catalogItem || catalogItem.deletedAt !== undefined) {
      return { serviceable: false, error: `"${catalogItem?.name ?? "Item"}" is no longer available.` };
    }

    // Only products have shipping weight
    if (catalogItem.itemType === "product") {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug_in_business_unit", (q) =>
          q.eq("businessUnitId", args.businessUnitId).eq("slug", catalogItem.slug),
        )
        .first();

      if (product && product.shippable === false) {
        return { serviceable: false, error: `"${catalogItem.name}" cannot be shipped via courier.` };
      }

      if (product) {
        const variant = (product.variants ?? []).find(
          (vr) => vr.active && vr.optionValue === item.variantName,
        );
        const weightGrams = variant?.netWeightGrams ?? product.weightGrams;
        if (weightGrams === undefined || weightGrams === null) {
          return { serviceable: false, error: `Shipping weight is not configured for "${catalogItem.name}".` };
        }
        if (weightGrams <= 0) {
          return { serviceable: false, error: `Invalid shipping weight for "${catalogItem.name}".` };
        }
        totalActualWeightGrams += weightGrams * item.quantity;
      }
    }
  }

  // 9. Calculate billable weight
  const billableWeightGrams = Math.max(
    totalActualWeightGrams,
    config.minimumBillableWeightGrams,
  );

  // 10. Find matching active rate
  const matchingRates = await ctx.db
    .query("shippingRates")
    .withIndex("by_zone", (q) =>
      q.eq("shippingZoneId", shippingZone._id).eq("status", "active"),
    )
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();

  const matchedRate = matchingRates.find(
    (r) => billableWeightGrams >= r.minWeightGrams && billableWeightGrams <= r.maxWeightGrams,
  );

  if (!matchedRate) {
    return { serviceable: false, error: `No shipping rate is available for ${billableWeightGrams}g weight.` };
  }

  // 11. Reject multiple matching slabs (configuration error)
  const overlappingCount = matchingRates.filter(
    (r) => billableWeightGrams >= r.minWeightGrams && billableWeightGrams <= r.maxWeightGrams,
  ).length;
  if (overlappingCount > 1) {
    return { serviceable: false, error: "Shipping configuration error: multiple matching rates." };
  }

  return {
    serviceable: true,
    shippingCharge: matchedRate.charge,
    shippingZoneId: shippingZone._id,
    shippingZoneName: shippingZone.name,
    shippingRateId: matchedRate._id,
    shippingRateName: matchedRate.name,
    actualWeightGrams: totalActualWeightGrams,
    billableWeightGrams,
  };
}

// ============================================================================
// quoteForCart — Customer-facing shipping preview (read-only query)
// ============================================================================

export const quoteForCart = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalogItems"),
        variantName: v.string(),
        quantity: v.number(),
      }),
    ),
    destinationPincode: v.string(),
  },
  handler: async (ctx, args) => {
    return await resolveMartShippingQuote(ctx, args);
  },
});

// ============================================================================
// Mart Delivery Result — Canonical single-source delivery state
// ============================================================================

export type MartDeliveryResult = {
  serviceable: boolean;
  available: boolean;
  reason?: string;
  shippingCharge?: number;
  shippingZoneName?: string;
  shippingRateName?: string;
  actualWeightGrams?: number;
  billableWeightGrams?: number;
};

/**
 * Canonical single-source delivery resolution for Mart pincode-region orders.
 * Combines pincode serviceability check AND shipping quote into one atomic query.
 * This eliminates the contradiction where checkServiceability returns true but
 * quoteForCart returns false.
 *
 * The client must call this ONCE instead of calling checkServiceability + quoteForCart separately.
 */
export const resolveMartDelivery = query({
  args: {
    businessUnitId: v.id("businessUnits"),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalogItems"),
        variantName: v.string(),
        quantity: v.number(),
      }),
    ),
    destinationPincode: v.string(),
  },
  handler: async (ctx, args): Promise<MartDeliveryResult> => {
    // 1. Validate pincode format
    const pincode = args.destinationPincode.trim();
    if (!/^\d{6}$/.test(pincode)) {
      return {
        serviceable: false,
        available: false,
        reason: "INVALID_PINCODE",
      };
    }

    // 2. Resolve business unit
    const bu = await ctx.db.get(args.businessUnitId);
    if (!bu || bu.deletedAt !== undefined) {
      return {
        serviceable: false,
        available: false,
        reason: "BUSINESS_UNIT_NOT_FOUND",
      };
    }
    if (!bu.enableDelivery) {
      return {
        serviceable: false,
        available: false,
        reason: "MART_DELIVERY_DISABLED",
      };
    }

    // 3. Verify serviceabilityMode is pincode_region
    const mode = bu.serviceabilityMode ?? "coordinate_radius";
    if (mode !== "pincode_region") {
      return {
        serviceable: false,
        available: false,
        reason: "MART_SERVICEABILITY_NOT_CONFIGURED",
      };
    }

    // 4. Look up pincode record — combined serviceability check
    const pincodeRecord = await ctx.db
      .query("martPincodeServiceability")
      .withIndex("by_bu_pincode", (q) =>
        q.eq("businessUnitId", args.businessUnitId).eq("pincode", pincode),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (!pincodeRecord || pincodeRecord.status !== "active") {
      return {
        serviceable: false,
        available: false,
        reason: "PINCODE_NOT_SERVICEABLE",
      };
    }

    // 5. Require shippingZoneId on pincode
    if (!pincodeRecord.shippingZoneId) {
      return {
        serviceable: false,
        available: false,
        reason: "MISSING_SHIPPING_ZONE",
      };
    }

    // 6. Fetch and validate shipping zone
    const shippingZone = await ctx.db.get(pincodeRecord.shippingZoneId);
    if (!shippingZone || shippingZone.deletedAt !== undefined || shippingZone.status !== "active") {
      return {
        serviceable: false,
        available: false,
        reason: "SHIPPING_ZONE_UNAVAILABLE",
      };
    }
    if (shippingZone.businessUnitId !== args.businessUnitId) {
      return {
        serviceable: false,
        available: false,
        reason: "SHIPPING_ZONE_MISMATCH",
      };
    }

    // 7. Fetch active shippingConfig (minimum billable weight)
    const config = await ctx.db
      .query("shippingConfig")
      .withIndex("by_business_unit", (q) =>
        q.eq("businessUnitId", args.businessUnitId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!config) {
      return {
        serviceable: false,
        available: false,
        reason: "SHIPPING_NOT_CONFIGURED",
      };
    }

    // 8. Resolve authoritative weight for each cart item
    let totalActualWeightGrams = 0;

    for (const item of args.items) {
      const catalogItem = await ctx.db.get(item.catalogItemId);
      if (!catalogItem || catalogItem.deletedAt !== undefined) {
        return {
          serviceable: false,
          available: false,
          reason: "ITEM_UNAVAILABLE",
        };
      }

      // Only products have shipping weight
      if (catalogItem.itemType === "product") {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug_in_business_unit", (q) =>
            q.eq("businessUnitId", args.businessUnitId).eq("slug", catalogItem.slug),
          )
          .first();

        if (product && product.shippable === false) {
          return {
            serviceable: false,
            available: false,
            reason: "ITEM_NOT_SHIPPABLE",
          };
        }

        if (product) {
          const variant = (product.variants ?? []).find(
            (vr) => vr.active && vr.optionValue === item.variantName,
          );
          const weightGrams = variant?.netWeightGrams ?? product.weightGrams;
          if (weightGrams === undefined || weightGrams === null) {
            return {
              serviceable: false,
              available: false,
              reason: "MISSING_WEIGHT",
            };
          }
          if (weightGrams <= 0) {
            return {
              serviceable: false,
              available: false,
              reason: "INVALID_WEIGHT",
            };
          }
          totalActualWeightGrams += weightGrams * item.quantity;
        }
      }
    }

    // 9. Calculate billable weight
    const billableWeightGrams = Math.max(
      totalActualWeightGrams,
      config.minimumBillableWeightGrams,
    );

    // 10. Find matching active rate
    const matchingRates = await ctx.db
      .query("shippingRates")
      .withIndex("by_zone", (q) =>
        q.eq("shippingZoneId", shippingZone._id).eq("status", "active"),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const matchedRate = matchingRates.find(
      (r) => billableWeightGrams >= r.minWeightGrams && billableWeightGrams <= r.maxWeightGrams,
    );

    if (!matchedRate) {
      return {
        serviceable: false,
        available: false,
        reason: "NO_MATCHING_RATE",
      };
    }

    // 11. Reject multiple matching slabs (configuration error)
    const overlappingCount = matchingRates.filter(
      (r) => billableWeightGrams >= r.minWeightGrams && billableWeightGrams <= r.maxWeightGrams,
    ).length;
    if (overlappingCount > 1) {
      return {
        serviceable: false,
        available: false,
        reason: "OVERLAPPING_RATES",
      };
    }

    return {
      serviceable: true,
      available: true,
      shippingCharge: matchedRate.charge,
      shippingZoneName: shippingZone.name,
      shippingRateName: matchedRate.name,
      actualWeightGrams: totalActualWeightGrams,
      billableWeightGrams,
    };
  },
});

// ============================================================================
// Helpers
// ============================================================================

async function checkOverlappingSlabs(
  ctx: any,
  zoneId: string,
  minWeightGrams: number,
  maxWeightGrams: number,
  excludeId?: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("shippingRates")
    .withIndex("by_zone", (q: any) =>
      q.eq("shippingZoneId", zoneId).eq("status", "active")
    )
    .filter((q: any) => q.eq(q.field("deletedAt"), undefined))
    .collect();

  for (const rate of existing) {
    if (excludeId && rate._id === excludeId) continue;
    // Overlap rule: minB <= maxA AND maxB >= minA
    if (minWeightGrams <= rate.maxWeightGrams && maxWeightGrams >= rate.minWeightGrams) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    shippingZoneId: v.id("shippingZones"),
    businessUnitId: v.id("businessUnits"),
    name: v.string(),
    minWeightGrams: v.number(),
    maxWeightGrams: v.number(),
    charge: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const name = args.name.trim();
    if (!name) throw new Error("Rate name is required.");

    if (args.minWeightGrams < 0) {
      throw new Error("Minimum weight must be >= 0.");
    }
    if (args.maxWeightGrams <= args.minWeightGrams) {
      throw new Error("Maximum weight must be greater than minimum weight.");
    }
    if (args.charge < 0) {
      throw new Error("Charge must be >= 0.");
    }

    // Zone must exist
    const zone = await ctx.db.get(args.shippingZoneId);
    if (!zone || zone.deletedAt !== undefined) {
      throw new Error("Shipping zone not found.");
    }

    // Zone BU must match rate BU
    if (zone.businessUnitId !== args.businessUnitId) {
      throw new Error("Shipping zone does not belong to this business unit.");
    }

    // Zone must be active for creating an active rate
    if (args.status === "active" && zone.status !== "active") {
      throw new Error("Cannot create an active rate for an inactive zone.");
    }

    // Check overlapping slabs
    if (args.status === "active") {
      const overlaps = await checkOverlappingSlabs(
        ctx,
        args.shippingZoneId,
        args.minWeightGrams,
        args.maxWeightGrams,
      );
      if (overlaps) {
        throw new Error("This weight range overlaps with an existing active rate in this zone.");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("shippingRates", {
      shippingZoneId: args.shippingZoneId,
      businessUnitId: args.businessUnitId,
      name,
      minWeightGrams: args.minWeightGrams,
      maxWeightGrams: args.maxWeightGrams,
      charge: args.charge,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingRates"),
    name: v.optional(v.string()),
    minWeightGrams: v.optional(v.number()),
    maxWeightGrams: v.optional(v.number()),
    charge: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping rate not found.");
    }

    const fields: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Rate name is required.");
      fields.name = name;
    }
    if (args.minWeightGrams !== undefined) {
      if (args.minWeightGrams < 0) throw new Error("Minimum weight must be >= 0.");
      fields.minWeightGrams = args.minWeightGrams;
    }
    if (args.maxWeightGrams !== undefined) {
      fields.maxWeightGrams = args.maxWeightGrams;
    }
    if (args.charge !== undefined) {
      if (args.charge < 0) throw new Error("Charge must be >= 0.");
      fields.charge = args.charge;
    }
    if (args.status !== undefined) {
      fields.status = args.status;
    }

    // Validate combined values
    const finalMin = (fields.minWeightGrams as number) ?? existing.minWeightGrams;
    const finalMax = (fields.maxWeightGrams as number) ?? existing.maxWeightGrams;
    const finalStatus = (fields.status as string) ?? existing.status;

    if (finalMax <= finalMin) {
      throw new Error("Maximum weight must be greater than minimum weight.");
    }

    // Zone must be active for an active rate
    if (finalStatus === "active") {
      const zone = await ctx.db.get(existing.shippingZoneId);
      if (zone && zone.status !== "active") {
        throw new Error("Cannot activate rate: zone is inactive.");
      }
    }

    // Check overlapping slabs (excluding self)
    if (finalStatus === "active") {
      const overlaps = await checkOverlappingSlabs(
        ctx,
        existing.shippingZoneId,
        finalMin,
        finalMax,
        args.id,
      );
      if (overlaps) {
        throw new Error("This weight range overlaps with an existing active rate in this zone.");
      }
    }

    await ctx.db.patch(args.id, fields);
  },
});

export const softDelete = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("shippingRates"),
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.sessionToken, ["superadmin", "admin"]);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.deletedAt !== undefined) {
      throw new Error("Shipping rate not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
});
