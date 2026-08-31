import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import type { EnrichedMealDeal, CartItem, CartAppliedMealDeal } from "@/types";

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

// ============================================================================
// Fetch active meal deals for a business unit
// ============================================================================

export function useMealDeals(businessUnitId: string | null | undefined) {
  const deals = useQuery(
    api.mealDeals.getActiveForCustomer,
    businessUnitId
      ? { businessUnitId: businessUnitId as Id<"businessUnits"> }
      : "skip",
  ) as EnrichedMealDeal[] | undefined;

  return deals;
}

// ============================================================================
// Get the applicable meal deal for a Combo or Party Pack
//
// For a Combo, only deals where applyToCombos === true are eligible.
// For a Party Pack, only deals where applyToPartyPacks === true are eligible.
// Note: parentCatalogItemIds is not checked here because this hook does not
// receive a specific parent ID. Parent-specific filtering is applied in the
// section components (ComboOffersSection / PartyPacksSection) and in cart
// eligibility logic (useCartMealDealDetection, reconcileCartState).
// Returns the best deal (highest savings) or null if none applies.
// ============================================================================

export function useMealDealForItem(
  businessUnitId: string | null | undefined,
  itemType: "combo" | "partyPack" | null,
) {
  const deals = useMealDeals(businessUnitId);

  const applicableDeal = useMemo(() => {
    if (!deals || deals.length === 0 || !itemType) return null;

    const filtered = deals.filter((deal) => {
      if (itemType === "combo") return deal.applyToCombos;
      if (itemType === "partyPack") return deal.applyToPartyPacks;
      return false;
    });

    if (filtered.length === 0) return null;

    // Return the deal with the highest savings
    return filtered.reduce((best, deal) =>
      deal.savings > best.savings ? deal : best
    );
  }, [deals, itemType]);

  return applicableDeal;
}

// ============================================================================
// Cart Smart Detection
//
// A Meal Deal is a MEAL UPGRADE associated with an eligible Combo or Party Pack.
// Smart Detection therefore REQUIRES an eligible parent combo/partyPack to
// exist in the cart.  Qualifying solo products alone are NOT sufficient.
//
// Returns an array of eligible deals, each with the quantity of deals
// that can be applied based on the formula:
//   eligibleDeals = MIN(floor(cartQty(itemA) / requiredQty(itemA)), ...)
// ============================================================================

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

export function useCartMealDealDetection(
  cartItems: CartItem[],
  businessUnitId: string | null | undefined,
  appliedMealDeals: CartAppliedMealDeal[] | undefined,
) {
  const deals = useMealDeals(businessUnitId);

  // Build a map of already-consumed quantities from applied meal deals
  const consumedQuantities = useMemo<Record<string, number>>(() => {
    const consumed: Record<string, number> = {};
    if (appliedMealDeals) {
      for (const deal of appliedMealDeals) {
        if (deal.consumedQuantities) {
          for (const [itemId, qty] of Object.entries(deal.consumedQuantities)) {
            consumed[itemId] = (consumed[itemId] ?? 0) + (qty as number);
          }
        }
      }
    }
    return consumed;
  }, [appliedMealDeals]);

  const matches = useMemo(() => {
    if (!deals || deals.length === 0 || cartItems.length === 0) return [];

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
  }, [deals, cartItems, consumedQuantities, businessUnitId]);

  return matches;
}

// ============================================================================
// Shared Selection Detection
//
// Every Meal Deal entry point should call this to determine whether the
// customer must make a product/variant selection before the deal can be applied.
// ============================================================================

export function needsMealDealSelection(deal: EnrichedMealDeal): boolean {
  for (const qi of deal.qualifyingItems) {
    if (qi.alternatives && qi.alternatives.length > 0) return true;
    if (qi.variants && qi.variants.length > 1) return true;
  }
  return false;
}
