// ============================================================================
// MB CRUNCHY — Meal-deal match evaluation (pure, no React/Convex)
//
// Splits cart smart-detection into two testable pieces:
//
//   evaluateMealDealMatchesForBu — the per-business-unit matching core:
//     eligible parents gate capacity, applied deals consume capacity, and
//     each qualifying slot is measured against cart lines OF THAT BU ONLY,
//     so Mart lines can never satisfy Kitchen components (or vice versa).
//     Moved verbatim from useCartMealDealDetection; deal rules, pricing and
//     savings math are unchanged.
//
//   combineMealDealMatches — concatenates per-BU results in cart first-seen
//     BU order and dedupes by stable deal id (first occurrence wins), so one
//     deal is never offered twice in a mixed cart.
//
// No runtime dependencies (type-only imports): safe to unit-test in plain
// Node alongside the React hook, which remains the sole query owner.
// ============================================================================

import type {
  CartAppliedMealDeal,
  CartItem,
  EnrichedMealDeal,
} from "@/types";

export interface CartMealDealMatch {
  deal: EnrichedMealDeal;
  eligibleQuantity: number;
  totalDiscount: number;
  /** Qualifying items the customer still needs to add for the NEXT meal. Empty = complete opportunity. */
  missingItems: Array<{
    catalogItemId: string;
    name: string;
    quantity: number;
  }>;
  /** The parent combo/partyPack catalogItemId that triggered this match, needed for Path A/B. */
  sourceParentCatalogItemId?: string;
}

/**
 * Rule 17: Check whether a parent catalog item is eligible for a meal deal.
 * - undefined or empty parentCatalogItemIds → all eligible parents allowed
 * - non-empty parentCatalogItemIds → only listed IDs allowed
 */
function isParentAllowed(
  parentCatalogItemId: string,
  parentCatalogItemIds?: string[],
): boolean {
  if (!parentCatalogItemIds || parentCatalogItemIds.length === 0) return true;
  return parentCatalogItemIds.includes(parentCatalogItemId);
}

export interface EvaluateMatchesForBuInput {
  cartItems: CartItem[];
  businessUnitId: string;
  deals: EnrichedMealDeal[];
  appliedMealDeals: CartAppliedMealDeal[] | undefined;
}

/**
 * Evaluate every deal of ONE business unit against that BU's cart lines.
 * Returns matches in deal order; empty when nothing is eligible.
 */
export function evaluateMealDealMatchesForBu(
  input: EvaluateMatchesForBuInput,
): CartMealDealMatch[] {
  const { cartItems, businessUnitId, deals, appliedMealDeals } = input;
  if (!deals || deals.length === 0 || cartItems.length === 0) return [];

  // Already-consumed quantities from applied meal deals.
  const consumedQuantities: Record<string, number> = {};
  if (appliedMealDeals) {
    for (const deal of appliedMealDeals) {
      if (deal.consumedQuantities) {
        for (const [itemId, qty] of Object.entries(deal.consumedQuantities)) {
          consumedQuantities[itemId] =
            (consumedQuantities[itemId] ?? 0) + (qty as number);
        }
      }
    }
  }

  const results: CartMealDealMatch[] = [];

  // Filter cart items to the target business unit for isolation.
  const buCartItems = businessUnitId
    ? cartItems.filter((ci) => ci.businessUnitId === businessUnitId)
    : cartItems;

  for (const deal of deals) {
    if (!deal.cartSmartDetection) continue;

    // Step 1: Find eligible parent items and compute parent capacity.
    const eligibleParents = buCartItems.filter(
      (ci) =>
        ((deal.applyToCombos && ci.itemType === "combo") ||
          (deal.applyToPartyPacks && ci.itemType === "partyPack")) &&
        isParentAllowed(ci.catalogItemId, deal.parentCatalogItemIds),
    );

    const eligibleParentQty = eligibleParents.reduce(
      (sum, ci) => sum + ci.quantity,
      0,
    );

    if (eligibleParentQty <= 0) continue;

    // Step 2: How many of this deal are already applied?
    const appliedCountForThisDeal = (appliedMealDeals ?? [])
      .filter((d) => d.mealDealId === deal._id)
      .reduce((sum, d) => sum + d.quantity, 0);

    // Step 3: Remaining parent capacity.
    const remainingParentCapacity = eligibleParentQty - appliedCountForThisDeal;
    if (remainingParentCapacity <= 0) continue;

    // Step 4: For each qualifying item, compute physical qty and unconsumed available.
    const itemAnalysis: Array<{
      qi: (typeof deal.qualifyingItems)[number];
      physicalQty: number;
      consumedQty: number;
      availableUnconsumed: number;
      missing: number;
    }> = [];

    for (const qi of deal.qualifyingItems) {
      const allowedIds = [qi.catalogItemId, ...(qi.alternatives?.map((a) => a.catalogItemId) ?? [])];
      const physicalQty = buCartItems
        .filter(
          (ci) =>
            allowedIds.includes(ci.catalogItemId) &&
            ci.itemType !== "combo" &&
            ci.itemType !== "partyPack",
        )
        .reduce((sum, ci) => sum + ci.quantity, 0);

      const consumedQty = allowedIds.reduce(
        (sum, id) => sum + (consumedQuantities[id] ?? 0),
        0,
      );
      const availableUnconsumed = Math.max(0, physicalQty - consumedQty);
      const missing = Math.max(0, qi.quantity - availableUnconsumed);

      itemAnalysis.push({ qi, physicalQty, consumedQty, availableUnconsumed, missing });
    }

    // Step 5: Is the NEXT meal complete or partial?
    const allSatisfied = itemAnalysis.every((a) => a.missing === 0);

    if (allSatisfied) {
      // Step 6: Complete opportunity — how many complete sets from unconsumed?
      let completeCapacity = Infinity;
      for (const a of itemAnalysis) {
        completeCapacity = Math.min(
          completeCapacity,
          Math.floor(a.availableUnconsumed / a.qi.quantity),
        );
      }

      const eligibleQuantity = Math.min(
        remainingParentCapacity,
        completeCapacity,
      );

      if (eligibleQuantity > 0 && eligibleQuantity !== Infinity) {
        const parentRef = eligibleParents[0]?.catalogItemId;
        results.push({
          deal,
          eligibleQuantity,
          totalDiscount: deal.savings * eligibleQuantity,
          missingItems: [],
          ...(parentRef ? { sourceParentCatalogItemId: parentRef } : {}),
        });
      }
    } else {
      // Step 7: Partial opportunity — missing items for ONE next meal only.
      const missingItems: CartMealDealMatch["missingItems"] = [];
      for (const a of itemAnalysis) {
        if (a.missing > 0) {
          missingItems.push({
            catalogItemId: a.qi.catalogItemId,
            name: a.qi.name ?? "Qualifying Item",
            quantity: a.missing,
          });
        }
      }

      if (missingItems.length > 0) {
        const parentRef = eligibleParents[0]?.catalogItemId;
        results.push({
          deal,
          eligibleQuantity: 0,
          totalDiscount: 0,
          missingItems,
          ...(parentRef ? { sourceParentCatalogItemId: parentRef } : {}),
        });
      }
    }
  }

  return results;
}

/**
 * Concatenate per-BU match lists (cart first-seen BU order) and dedupe by
 * stable deal id — first occurrence wins. Guarantees one deal is never
 * offered twice in a mixed cart.
 */
export function combineMealDealMatches(
  perBuMatches: ReadonlyArray<readonly CartMealDealMatch[]>,
): CartMealDealMatch[] {
  const seen = new Set<string>();
  const combined: CartMealDealMatch[] = [];
  for (const list of perBuMatches) {
    for (const match of list ?? []) {
      const id = match.deal._id;
      if (seen.has(id)) continue;
      seen.add(id);
      combined.push(match);
    }
  }
  return combined;
}
