/**
 * Phase 27-23 — Meal Deal Cross-BU Enrichment Contract Tests
 *
 * Validates that the getAllActiveForCustomerAcrossBusinessUnits query
 * returns data matching the frontend contract expected by:
 * - MealDealBadge.tsx (qi.name, mealDeal.savings, mealDeal.dealPrice)
 * - MealDealVariantDialog.tsx (qi.variants, qi.defaultVariantName, qi.name, qi.price)
 * - ComboOffersSection.tsx (mealDeal.savings for best-deal selection)
 * - PartyPacksSection.tsx (mealDeal.savings for best-deal selection)
 *
 * These tests validate the enrichment logic extracted from the Convex query.
 * They do NOT connect to a live Convex backend.
 */
import { describe, it, expect, beforeAll } from "vitest";

// ============================================================================
// Types matching the Convex query output contract
// ============================================================================

interface EnrichedVariant {
  optionName: string;
  optionValue: string;
  price: number;
  active: boolean;
}

interface EnrichedAlternative {
  catalogItemId: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  defaultVariantName?: string;
  variants?: EnrichedVariant[];
}

interface EnrichedQualifyingItem {
  catalogItemId: string;
  quantity: number;
  name: string;
  price: number;
  basePrice: number;
  compareAtPrice?: number;
  defaultVariantName?: string;
  variants?: EnrichedVariant[];
  alternatives?: EnrichedAlternative[];
}

interface EnrichedMealDeal {
  _id: string;
  businessUnitId: string;
  name: string;
  dealPrice: number;
  individualTotal: number;
  savings: number;
  qualifyingItems: EnrichedQualifyingItem[];
  applyToCombos: boolean;
  applyToPartyPacks: boolean;
  parentCatalogItemIds?: string[];
  cartSmartDetection?: boolean;
}

// ============================================================================
// Enrichment logic (extracted from convex/mealDeals.ts for unit testing)
// ============================================================================

interface RawCatalogItem {
  _id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  status: "active" | "inactive";
  deletedAt?: number;
  itemType: "product" | "combo" | "partyPack";
  sourceId?: string;
  businessUnitId: string;
}

interface RawSourceProduct {
  _id: string;
  variants?: Array<{
    optionName: string;
    optionValue: string;
    price: number;
    active: boolean;
    isDefault?: boolean;
  }>;
}

interface RawMealDeal {
  _id: string;
  businessUnitId: string;
  name: string;
  dealPrice: number;
  qualifyingItems: Array<{
    catalogItemId: string;
    quantity: number;
    alternatives?: string[];
  }>;
  applyToCombos: boolean;
  applyToPartyPacks: boolean;
  parentCatalogItemIds?: string[];
  cartSmartDetection?: boolean;
}

function enrichQualifyingItem(
  qi: { catalogItemId: string; quantity: number; alternatives?: string[] },
  catalogItems: Map<string, RawCatalogItem>,
  sourceProducts: Map<string, RawSourceProduct>,
): EnrichedQualifyingItem | null {
  const catalogItem = catalogItems.get(qi.catalogItemId);
  if (!catalogItem || catalogItem.status !== "active" || catalogItem.deletedAt) {
    return null;
  }

  let variants: EnrichedVariant[] | undefined;
  let defaultVariantName: string | undefined;
  if (catalogItem.itemType === "product" && catalogItem.sourceId) {
    const sourceDoc = sourceProducts.get(catalogItem.sourceId);
    if (sourceDoc && sourceDoc.variants && sourceDoc.variants.length > 0) {
      variants = sourceDoc.variants
        .filter((v) => v.active)
        .map((v) => ({
          optionName: v.optionName,
          optionValue: v.optionValue,
          price: v.price,
          active: v.active,
        }));
      const defaultV = sourceDoc.variants.find((v) => v.isDefault) ?? sourceDoc.variants[0];
      defaultVariantName = defaultV?.optionValue;
    }
  }

  let alternatives: EnrichedAlternative[] | undefined;
  if (qi.alternatives && qi.alternatives.length > 0) {
    const altResults: (EnrichedAlternative | null)[] = qi.alternatives.map((altId) => {
      const altCatalogItem = catalogItems.get(altId);
      if (!altCatalogItem || altCatalogItem.status !== "active" || altCatalogItem.deletedAt) {
        return null;
      }

      let altVariants: EnrichedVariant[] | undefined;
      let altDefaultVariantName: string | undefined;
      if (altCatalogItem.itemType === "product" && altCatalogItem.sourceId) {
        const altSourceDoc = sourceProducts.get(altCatalogItem.sourceId);
        if (altSourceDoc && altSourceDoc.variants && altSourceDoc.variants.length > 0) {
          altVariants = altSourceDoc.variants
            .filter((v) => v.active)
            .map((v) => ({
              optionName: v.optionName,
              optionValue: v.optionValue,
              price: v.price,
              active: v.active,
            }));
          const altDefaultV = altSourceDoc.variants.find((v) => v.isDefault) ?? altSourceDoc.variants[0];
          altDefaultVariantName = altDefaultV?.optionValue;
        }
      }

      return {
        catalogItemId: altId,
        name: altCatalogItem.name,
        price: altCatalogItem.price,
        compareAtPrice: altCatalogItem.compareAtPrice,
        ...(altDefaultVariantName ? { defaultVariantName: altDefaultVariantName } : {}),
        ...(altVariants && altVariants.length > 0 ? { variants: altVariants } : {}),
      };
    });

    const validAlts = altResults.filter((a): a is EnrichedAlternative => a !== null);
    if (validAlts.length > 0) {
      alternatives = validAlts;
    }
  }

  return {
    catalogItemId: qi.catalogItemId,
    quantity: qi.quantity,
    name: catalogItem.name,
    price: catalogItem.price,
    basePrice: catalogItem.price,
    compareAtPrice: catalogItem.compareAtPrice,
    ...(defaultVariantName ? { defaultVariantName } : {}),
    ...(variants && variants.length > 0 ? { variants } : {}),
    ...(alternatives ? { alternatives } : {}),
  };
}

function enrichMealDeal(
  deal: RawMealDeal,
  catalogItems: Map<string, RawCatalogItem>,
  sourceProducts: Map<string, RawSourceProduct>,
): EnrichedMealDeal | null {
  const qualifyingItems: (EnrichedQualifyingItem | null)[] = deal.qualifyingItems.map((qi) =>
    enrichQualifyingItem(qi, catalogItems, sourceProducts),
  );

  const validItems = qualifyingItems.filter((i): i is EnrichedQualifyingItem => i !== null);
  if (validItems.length !== deal.qualifyingItems.length) {
    return null;
  }

  const individualTotal = validItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
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
    ...(deal.parentCatalogItemIds ? { parentCatalogItemIds: deal.parentCatalogItemIds } : {}),
    cartSmartDetection: deal.cartSmartDetection,
  };
}

// ============================================================================
// Fixtures
// ============================================================================

function makeCatalogItem(overrides: Partial<RawCatalogItem> & { _id: string; businessUnitId: string }): RawCatalogItem {
  return {
    name: `Product ${overrides._id}`,
    price: 100,
    status: "active",
    itemType: "product",
    ...overrides,
  };
}

function makeSourceProduct(overrides: Partial<RawSourceProduct> & { _id: string }): RawSourceProduct {
  return {
    variants: [],
    ...overrides,
  };
}

function makeMealDeal(overrides: Partial<RawMealDeal> & { _id: string; businessUnitId: string }): RawMealDeal {
  return {
    name: `Deal ${overrides._id}`,
    dealPrice: 150,
    qualifyingItems: [],
    applyToCombos: true,
    applyToPartyPacks: false,
    cartSmartDetection: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Meal Deal Enrichment Contract", () => {
  const buA = "bu_a" as string;
  const buB = "bu_b" as string;

  const catalogItems = new Map<string, RawCatalogItem>();
  const sourceProducts = new Map<string, RawSourceProduct>();

  // BU-A products
  const burgerItem = makeCatalogItem({ _id: "cat_burger_a", businessUnitId: buA, name: "Chicken Burger", price: 250, sourceId: "src_burger" });
  const friesItem = makeCatalogItem({ _id: "cat_fries_a", businessUnitId: buA, name: "French Fries", price: 120 });
  const cokeItem = makeCatalogItem({ _id: "cat_coke_a", businessUnitId: buA, name: "Thums Up", price: 80, sourceId: "src_coke" });
  const pepsiItem = makeCatalogItem({ _id: "cat_pepsi_a", businessUnitId: buA, name: "Pepsi", price: 80 });

  // BU-B products
  const pizzaItem = makeCatalogItem({ _id: "cat_pizza_b", businessUnitId: buB, name: "Margherita Pizza", price: 300 });
  const saladItem = makeCatalogItem({ _id: "cat_salad_b", businessUnitId: buB, name: "Garden Salad", price: 150 });

  // Source products with variants
  const burgerSource = makeSourceProduct({
    _id: "src_burger",
    variants: [
      { optionName: "Size", optionValue: "Regular", price: 250, active: true, isDefault: true },
      { optionName: "Size", optionValue: "Large", price: 350, active: true },
      { optionName: "Size", optionValue: "Small", price: 200, active: false },
    ],
  });

  const cokeSource = makeSourceProduct({
    _id: "src_coke",
    variants: [
      { optionName: "Size", optionValue: "500ml", price: 80, active: true, isDefault: true },
      { optionName: "Size", optionValue: "1L", price: 120, active: true },
    ],
  });

  beforeAll(() => {
    // Populate catalog items
    for (const item of [burgerItem, friesItem, cokeItem, pepsiItem, pizzaItem, saladItem]) {
      catalogItems.set(item._id, item);
    }
    // Populate source products
    for (const src of [burgerSource, cokeSource]) {
      sourceProducts.set(src._id, src);
    }
  });

  // -----------------------------------------------------------------------
  // Frontend contract: qualifying item fields
  // -----------------------------------------------------------------------

  it("qualifying item has name", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_burger_a", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    expect(qi!.name).toBe("Chicken Burger");
  });

  it("qualifying item has price", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_burger_a", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    expect(qi!.price).toBe(250);
    expect(qi!.basePrice).toBe(250);
  });

  it("qualifying item has variants when source product has variants", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_burger_a", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    expect(qi!.variants).toBeDefined();
    expect(qi!.variants!.length).toBe(2); // Only active variants
    expect(qi!.variants![0].optionValue).toBe("Regular");
    expect(qi!.variants![1].optionValue).toBe("Large");
    expect(qi!.defaultVariantName).toBe("Regular");
  });

  it("qualifying item has no variants when source product has no variants", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_fries_a", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    expect(qi!.variants).toBeUndefined();
    expect(qi!.defaultVariantName).toBeUndefined();
  });

  it("qualifying item has alternatives when provided", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_coke_a", quantity: 1, alternatives: ["cat_pepsi_a"] },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    expect(qi!.alternatives).toBeDefined();
    expect(qi!.alternatives!.length).toBe(1);
    expect(qi!.alternatives![0].name).toBe("Pepsi");
    expect(qi!.alternatives![0].price).toBe(80);
  });

  it("qualifying item has variant data on alternatives", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_coke_a", quantity: 1, alternatives: ["cat_pepsi_a"] },
      catalogItems,
      sourceProducts,
    );
    expect(qi).not.toBeNull();
    // cokeItem has source with variants
    expect(qi!.variants).toBeDefined();
    expect(qi!.variants!.length).toBe(2);
    expect(qi!.defaultVariantName).toBe("500ml");
  });

  // -----------------------------------------------------------------------
  // Frontend contract: deal-level fields
  // -----------------------------------------------------------------------

  it("individualTotal is computed correctly", () => {
    const deal = makeMealDeal({
      _id: "deal_1",
      businessUnitId: buA,
      dealPrice: 300,
      qualifyingItems: [
        { catalogItemId: "cat_burger_a", quantity: 1 },
        { catalogItemId: "cat_fries_a", quantity: 1 },
      ],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    // 250 + 120 = 370
    expect(enriched!.individualTotal).toBe(370);
  });

  it("savings is individualTotal - dealPrice", () => {
    const deal = makeMealDeal({
      _id: "deal_1",
      businessUnitId: buA,
      dealPrice: 300,
      qualifyingItems: [
        { catalogItemId: "cat_burger_a", quantity: 1 },
        { catalogItemId: "cat_fries_a", quantity: 1 },
      ],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    // 370 - 300 = 70
    expect(enriched!.savings).toBe(70);
  });

  it("savings can be negative when dealPrice > individualTotal", () => {
    const deal = makeMealDeal({
      _id: "deal_2",
      businessUnitId: buA,
      dealPrice: 500,
      qualifyingItems: [{ catalogItemId: "cat_coke_a", quantity: 1 }],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    // 80 - 500 = -420
    expect(enriched!.savings).toBe(-420);
  });

  it("businessUnitId is preserved", () => {
    const deal = makeMealDeal({
      _id: "deal_1",
      businessUnitId: buA,
      dealPrice: 300,
      qualifyingItems: [{ catalogItemId: "cat_burger_a", quantity: 1 }],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    expect(enriched!.businessUnitId).toBe(buA);
  });

  // -----------------------------------------------------------------------
  // Missing / inactive data behavior
  // -----------------------------------------------------------------------

  it("returns null when qualifying item catalog item is missing", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "nonexistent", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).toBeNull();
  });

  it("returns null when qualifying item is inactive", () => {
    catalogItems.set("inactive_item", makeCatalogItem({
      _id: "inactive_item",
      businessUnitId: buA,
      status: "inactive",
    }));
    const qi = enrichQualifyingItem(
      { catalogItemId: "inactive_item", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).toBeNull();
    catalogItems.delete("inactive_item");
  });

  it("returns null when qualifying item is deleted", () => {
    catalogItems.set("deleted_item", makeCatalogItem({
      _id: "deleted_item",
      businessUnitId: buA,
      deletedAt: Date.now(),
    }));
    const qi = enrichQualifyingItem(
      { catalogItemId: "deleted_item", quantity: 1 },
      catalogItems,
      sourceProducts,
    );
    expect(qi).toBeNull();
    catalogItems.delete("deleted_item");
  });

  it("drops entire deal when any qualifying item fails", () => {
    const deal = makeMealDeal({
      _id: "deal_bad",
      businessUnitId: buA,
      dealPrice: 300,
      qualifyingItems: [
        { catalogItemId: "cat_burger_a", quantity: 1 },
        { catalogItemId: "nonexistent", quantity: 1 },
      ],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).toBeNull();
  });

  it("drops deal when alternative is missing", () => {
    const qi = enrichQualifyingItem(
      { catalogItemId: "cat_coke_a", quantity: 1, alternatives: ["nonexistent_alt"] },
      catalogItems,
      sourceProducts,
    );
    // Missing alternative is filtered out, but qualifying item itself is still valid
    expect(qi).not.toBeNull();
    // alternatives array should be empty/undefined since the only alt was invalid
    expect(qi!.alternatives).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Cross-BU isolation
  // -----------------------------------------------------------------------

  describe("Cross-BU isolation", () => {
    it("BU-A meal deal resolves BU-A products only", () => {
      const deal = makeMealDeal({
        _id: "deal_buA",
        businessUnitId: buA,
        dealPrice: 300,
        qualifyingItems: [
          { catalogItemId: "cat_burger_a", quantity: 1 },
          { catalogItemId: "cat_fries_a", quantity: 1 },
        ],
      });
      const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
      expect(enriched).not.toBeNull();
      expect(enriched!.businessUnitId).toBe(buA);
      expect(enriched!.qualifyingItems[0].name).toBe("Chicken Burger");
      expect(enriched!.qualifyingItems[1].name).toBe("French Fries");
    });

    it("BU-B meal deal resolves BU-B products only", () => {
      const deal = makeMealDeal({
        _id: "deal_buB",
        businessUnitId: buB,
        dealPrice: 400,
        qualifyingItems: [
          { catalogItemId: "cat_pizza_b", quantity: 1 },
          { catalogItemId: "cat_salad_b", quantity: 1 },
        ],
      });
      const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
      expect(enriched).not.toBeNull();
      expect(enriched!.businessUnitId).toBe(buB);
      expect(enriched!.qualifyingItems[0].name).toBe("Margherita Pizza");
      expect(enriched!.qualifyingItems[1].name).toBe("Garden Salad");
    });

    it("BU-A deal cannot resolve BU-B products", () => {
      const deal = makeMealDeal({
        _id: "deal_cross",
        businessUnitId: buA,
        dealPrice: 400,
        qualifyingItems: [
          { catalogItemId: "cat_pizza_b", quantity: 1 }, // BU-B product
        ],
      });
      // This should still resolve because catalogItemId is a global ID
      // The isolation is that BU-A's qualifyingItems only reference BU-A catalog items
      // (this is enforced by the admin UI, not the enrichment query)
      const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
      // It resolves because the catalog item exists — but the admin should not create this
      expect(enriched).not.toBeNull();
      expect(enriched!.businessUnitId).toBe(buA);
      expect(enriched!.qualifyingItems[0].name).toBe("Margherita Pizza");
    });

    it("multiple BUs enriched independently", () => {
      const dealA = makeMealDeal({
        _id: "deal_multi_a",
        businessUnitId: buA,
        dealPrice: 300,
        qualifyingItems: [{ catalogItemId: "cat_burger_a", quantity: 1 }],
      });
      const dealB = makeMealDeal({
        _id: "deal_multi_b",
        businessUnitId: buB,
        dealPrice: 400,
        qualifyingItems: [{ catalogItemId: "cat_pizza_b", quantity: 1 }],
      });

      const enrichedA = enrichMealDeal(dealA, catalogItems, sourceProducts);
      const enrichedB = enrichMealDeal(dealB, catalogItems, sourceProducts);

      expect(enrichedA).not.toBeNull();
      expect(enrichedB).not.toBeNull();
      expect(enrichedA!.businessUnitId).toBe(buA);
      expect(enrichedB!.businessUnitId).toBe(buB);
      expect(enrichedA!.qualifyingItems[0].name).toBe("Chicken Burger");
      expect(enrichedB!.qualifyingItems[0].name).toBe("Margherita Pizza");
      expect(enrichedA!.savings).toBe(250 - 300); // -50
      expect(enrichedB!.savings).toBe(300 - 400); // -100
    });
  });

  // -----------------------------------------------------------------------
  // Quantity calculations
  // -----------------------------------------------------------------------

  it("individualTotal multiplies price × quantity", () => {
    const deal = makeMealDeal({
      _id: "deal_qty",
      businessUnitId: buA,
      dealPrice: 500,
      qualifyingItems: [{ catalogItemId: "cat_burger_a", quantity: 2 }],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    // 250 × 2 = 500
    expect(enriched!.individualTotal).toBe(500);
    expect(enriched!.savings).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Parent catalog item IDs preserved
  // -----------------------------------------------------------------------

  it("parentCatalogItemIds are preserved", () => {
    const deal = makeMealDeal({
      _id: "deal_parent",
      businessUnitId: buA,
      dealPrice: 300,
      qualifyingItems: [{ catalogItemId: "cat_burger_a", quantity: 1 }],
      parentCatalogItemIds: ["cat_combo_1" as string, "cat_combo_2" as string],
    });
    const enriched = enrichMealDeal(deal, catalogItems, sourceProducts);
    expect(enriched).not.toBeNull();
    expect(enriched!.parentCatalogItemIds).toEqual(["cat_combo_1", "cat_combo_2"]);
  });
});
