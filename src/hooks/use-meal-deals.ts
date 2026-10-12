import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import type { EnrichedMealDeal, CartItem, CartAppliedMealDeal } from "@/types";
import {
  combineMealDealMatches,
  evaluateMealDealMatchesForBu,
  type CartMealDealMatch,
} from "@/utils/mealDealMatching";

// Re-exported for existing consumers (CartPage renders matches structurally).
export type { CartMealDealMatch };

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

export interface MealDealsByBusinessUnit {
  businessUnitId: string;
  /** Active deals for this BU; undefined while the query loads (contributes no matches). */
  deals: EnrichedMealDeal[] | undefined;
}

export function useCartMealDealDetection(
  cartItems: CartItem[],
  dealsByBusinessUnit: ReadonlyArray<MealDealsByBusinessUnit>,
  appliedMealDeals: CartAppliedMealDeal[] | undefined,
) {
  const matches = useMemo(() => {
    if (cartItems.length === 0) return [];
    const perBu = dealsByBusinessUnit.map(({ businessUnitId, deals }) =>
      evaluateMealDealMatchesForBu({
        cartItems,
        businessUnitId,
        deals: deals ?? [],
        appliedMealDeals,
      }),
    );
    return combineMealDealMatches(perBu);
  }, [cartItems, dealsByBusinessUnit, appliedMealDeals]);

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
