// ============================================================================
// MB CRUNCHY — Meal-deal shortfall line builder (pure, UI cart only)
//
// When applyMealDeal cannot cover a qualifying slot from standalone cart
// lines, it creates new deal-tagged lines for the shortfall. Those lines
// MUST carry the meal deal's business-unit ID.
//
// Background: the server validates at admin-configuration time that every
// qualifying item, alternative, and parent belongs to the deal's business
// unit (convex/mealDeals.ts create/update). The enriched deal payload the
// client receives, however, carries no per-component businessUnitId, and
// the availability check returns booleans only — so the deal owner BU is
// the single correct source. Using the cart's first BU instead misroutes
// Kitchen-combo upgrades into MB Mart whenever a Mart line is present.
//
// No Convex schema, pricing, grouping, or routing change is involved: this
// helper only stamps the correct existing string field.
// ============================================================================

import type { CartItem } from "@/types";

export interface MealDealShortfallLineInput {
  cartItemId: string;
  catalogItemId: string;
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  mealDealId: string;
  mealDealName: string;
  /** Owning business unit of the meal deal definition. */
  dealBusinessUnitId: string;
}

/**
 * Build a new deal-tagged cart line for an upgrade shortfall.
 *
 * Every product/catalog/variant/quantity/price field is passed through
 * verbatim; only businessUnitId is resolved — always to the deal's BU.
 * The helper deliberately takes no cart-state BU, so callers cannot
 * reintroduce cart-order-dependent assignment.
 */
export function buildMealDealShortfallLine(
  input: MealDealShortfallLineInput,
): CartItem {
  return {
    cartItemId: input.cartItemId,
    catalogItemId: input.catalogItemId,
    itemType: "product",
    businessUnitId: input.dealBusinessUnitId,
    name: input.name,
    variantName: input.variantName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalPrice: input.unitPrice * input.quantity,
    mealDealId: input.mealDealId,
    mealDealName: input.mealDealName,
  };
}
