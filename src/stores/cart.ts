import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import type { CartItem, CartState, CartAppliedMealDeal, EnrichedMealDeal } from "@/types";
import { STORAGE_KEYS } from "@/constants";
import { isCatalogItemId, safeJsonParse } from "@/utils";
import { convexClient } from "@/lib/convex";

// ============================================================================
// Cart Store — module-level singleton shared by every consumer of `useCart`.
//
// Each call to `useCart` subscribes to the SAME store, so adding, updating or
// clearing the cart in one component immediately re-renders the header badge,
// the cart page and every other subscribed consumer — no refresh required.
// ============================================================================

const CART_STORAGE_KEY = STORAGE_KEYS.CART;

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

let cartLineCounter = 0;
function generateCartItemId(): string {
  return `cl_${Date.now().toString(36)}_${(++cartLineCounter).toString(36)}`;
}

const defaultCartState: CartState = {
  items: [],
  businessUnitIds: [],
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  tax: 0,
  total: 0,
  note: undefined,
  mealDealSavings: 0,
};

function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.totalPrice, 0);
}

function computeTotal(
  subtotal: number,
  discount: number,
  deliveryFee: number,
  tax: number,
  mealDealSavings: number = 0,
): number {
  return Math.max(0, subtotal - discount - mealDealSavings + deliveryFee + tax);
}

function computeMealDealSavings(appliedMealDeals: CartAppliedMealDeal[] | undefined): number {
  if (!appliedMealDeals || appliedMealDeals.length === 0) return 0;
  return appliedMealDeals.reduce((sum, d) => sum + d.savings * d.quantity, 0);
}

/**
 * Enforce the core invariant: every appliedMealDeal must have qualifying items
 * with sufficient quantities AND (for legacy deals without parentCatalogItemIds)
 * the parent item must still be in the cart.  For Rule 17 multi-parent deals
 * (non-empty parentCatalogItemIds), parent existence is validated via
 * eligibleParentQty instead of sourceParentCatalogItemId, so removing the source
 * parent does NOT invalidate the deal if another targeted parent remains.
 * When the invariant is violated the deal is removed and affected items are
 * stripped of their meal-deal markers so they become normal solo products.
 *
 * Additionally, if the deal quantity exceeds the eligible parent quantity
 * (Rule 8), the deal is reconciled DOWN: deal.quantity is reduced,
 * consumedQuantities is recalculated, and excess items are stripped of their
 * deal markers.
 */
function reconcileCartState(prev: CartState): CartState {
  if (!prev.appliedMealDeals || prev.appliedMealDeals.length === 0) {
    // Ensure mealDealSavings is always set, even when no deals exist.
    if (prev.mealDealSavings === 0 || prev.mealDealSavings === undefined) return prev;
    return { ...prev, mealDealSavings: 0 };
  }

  let newItems = [...prev.items];
  const validDeals: CartAppliedMealDeal[] = [];
  let changed = false;

  for (const deal of prev.appliedMealDeals) {
    const dealId = deal.mealDealId;

    // 1. At least one cart item must carry this deal's marker.
    const hasDealItems = newItems.some(
      (item) => item.mealDealId === dealId,
    );

    // 2. Parent must still exist — backward-compatible check.
    //    Case A: Rule 17 multi-parent deal (parentCatalogItemIds is non-empty).
    //            Use eligibleParentQty (Constraint A below) as the parent gate.
    //            sourceParentCatalogItemId is NOT required to remain in cart.
    //    Case B: Legacy/single-parent deal (parentCatalogItemIds is undefined/empty).
    //            Use sourceParentCatalogItemId as the parent gate (existing behavior).
    const isRule17Deal =
      deal.parentCatalogItemIds !== undefined &&
      deal.parentCatalogItemIds.length > 0;
    let parentInCart: boolean;
    if (!deal.sourceParentCatalogItemId) {
      // No parent gating at all (e.g. catalogItem-based deals).
      parentInCart = true;
    } else if (isRule17Deal) {
      // Rule 17: parent existence is validated by Constraint A (eligibleParentQty).
      // Set true here; if no eligible parents exist, Constraint A will reduce
      // maxValidDeals → 0, which triggers the strip-all path below.
      parentInCart = true;
    } else {
      // Legacy: sourceParentCatalogItemId must remain in cart.
      parentInCart = newItems.some(
        (item) => item.catalogItemId === deal.sourceParentCatalogItemId,
      );
    }

    if (!hasDealItems || !parentInCart) {
      // ── Deal is completely invalid: strip ALL deal markers ──
      changed = true;
      newItems = newItems.map((item) => {
        if (item.mealDealId === dealId) {
          const { mealDealId: _m, mealDealName: _n, ...rest } = item;
          return rest;
        }
        return item;
      });
      continue;
    }

    // 3. Compute the maximum number of valid deal sets from ALL constraints.
    //    This unifies the quantity-sufficiency check and the parent-cap check
    //    into a single value, enabling partial reduction (N → M) instead of
    //    only binary invalidation.
    let maxValidDeals = deal.quantity;

    // Constraint A: Parent quantity cap (Rule 8 + Rule 17 targeted parents).
    const hasApplyToFlags =
      deal.applyToCombos !== undefined || deal.applyToPartyPacks !== undefined;
    if (hasApplyToFlags) {
      let eligibleParentQty = 0;
      if (deal.applyToCombos) {
        eligibleParentQty += newItems
          .filter(
            (i) =>
              i.itemType === "combo" &&
              i.quantity > 0 &&
              isParentAllowed(i.catalogItemId, deal.parentCatalogItemIds),
          )
          .reduce((sum, i) => sum + i.quantity, 0);
      }
      if (deal.applyToPartyPacks) {
        eligibleParentQty += newItems
          .filter(
            (i) =>
              i.itemType === "partyPack" &&
              i.quantity > 0 &&
              isParentAllowed(i.catalogItemId, deal.parentCatalogItemIds),
          )
          .reduce((sum, i) => sum + i.quantity, 0);
      }
      maxValidDeals = Math.min(maxValidDeals, eligibleParentQty);
    }

    // Constraint B: Per-product deal-tagged quantity sufficiency.
    // Count only items currently carrying this deal's marker for each product.
    for (const [itemId, totalConsumed] of Object.entries(
      deal.consumedQuantities,
    )) {
      const perDeal = totalConsumed / deal.quantity;
      if (perDeal <= 0) continue;
      const dealTaggedQty = newItems
        .filter(
          (i) => i.mealDealId === dealId && i.catalogItemId === itemId,
        )
        .reduce((sum, i) => sum + i.quantity, 0);
      maxValidDeals = Math.min(
        maxValidDeals,
        Math.floor(dealTaggedQty / perDeal),
      );
    }

    // 4. Act on maxValidDeals.
    if (maxValidDeals <= 0) {
      // ── No valid deal sets remain: strip ALL deal markers ──
      changed = true;
      newItems = newItems.map((item) => {
        if (item.mealDealId === dealId) {
          const { mealDealId: _m, mealDealName: _n, ...rest } = item;
          return rest;
        }
        return item;
      });
      // Don't push to validDeals
    } else if (maxValidDeals < deal.quantity) {
      // ── Partial reduction: deal.quantity → maxValidDeals ──
      changed = true;
      const newDealQty = maxValidDeals;

      // Recalculate consumedQuantities for the reduced deal quantity.
      const newConsumed: Record<string, number> = {};
      for (const [itemId, totalConsumed] of Object.entries(
        deal.consumedQuantities,
      )) {
        const perDeal = totalConsumed / deal.quantity;
        newConsumed[itemId] = Math.round(perDeal * newDealQty);
      }

      // Strip deal markers from excess items.
      const strippedItems: typeof newItems = [];
      const keptPerType: Record<string, number> = {};

      for (const item of newItems) {
        if (item.mealDealId !== dealId) {
          strippedItems.push(item);
          continue;
        }

        const target = newConsumed[item.catalogItemId] ?? 0;
        const alreadyKept = keptPerType[item.catalogItemId] ?? 0;
        const keepQty = Math.min(
          item.quantity,
          Math.max(0, target - alreadyKept),
        );
        const stripQty = item.quantity - keepQty;

        if (keepQty > 0) {
          strippedItems.push({
            ...item,
            quantity: keepQty,
            totalPrice: item.unitPrice * keepQty,
          });
          keptPerType[item.catalogItemId] = alreadyKept + keepQty;
        }
        if (stripQty > 0) {
          strippedItems.push({
            ...item,
            quantity: stripQty,
            totalPrice: item.unitPrice * stripQty,
            mealDealId: undefined,
            mealDealName: undefined,
          });
        }
      }
      newItems = strippedItems;

      // Merge duplicate standalone items (same catalogItemId + variantName, no dealId)
      const merged: typeof newItems = [];
      for (const item of newItems) {
        if ("mealDealId" in item && item.mealDealId) {
          merged.push(item);
          continue;
        }
        const existingIdx = merged.findIndex(
          (m) =>
            m.catalogItemId === item.catalogItemId &&
            m.variantName === item.variantName &&
            !("mealDealId" in m && m.mealDealId),
        );
        if (existingIdx >= 0) {
          merged[existingIdx] = {
            ...merged[existingIdx],
            quantity: merged[existingIdx].quantity + item.quantity,
            totalPrice:
              merged[existingIdx].unitPrice *
              (merged[existingIdx].quantity + item.quantity),
          };
        } else {
          merged.push(item);
        }
      }
      newItems = merged;

      // Rebuild consumedCartLineIds from remaining deal-tagged items.
      // cartItemId is guaranteed by the cart store's migration logic
      // (every item gets an ID on load), but TypeScript doesn't know this
      // invariant. Use filter to only include defined IDs.
      const newConsumedCartLineIds = newItems
        .filter((i) => i.mealDealId === dealId && i.cartItemId)
        .map((i) => i.cartItemId!);

      validDeals.push({
        ...deal,
        quantity: newDealQty,
        consumedQuantities: newConsumed,
        consumedCartLineIds: newConsumedCartLineIds,
      });
    } else {
      // ── maxValidDeals === deal.quantity: deal is valid, keep as-is ──
      validDeals.push(deal);
    }
  }

  if (!changed) return { ...prev, mealDealSavings: computeMealDealSavings(prev.appliedMealDeals) };

  const subtotal = calculateSubtotal(newItems);
  const businessUnitIds =
    newItems.length > 0
      ? Array.from(new Set(newItems.map((item) => item.businessUnitId)))
      : [];
  const validMealDeals = validDeals.length > 0 ? validDeals : undefined;
  const mealDealSavings = computeMealDealSavings(validMealDeals);
  return {
    ...prev,
    items: newItems,
    businessUnitIds,
    appliedMealDeals: validMealDeals,
    subtotal,
    mealDealSavings,
    total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax, mealDealSavings),
  };
}

function persistCart(state: CartState): void {
  try {
    // The `notice` is a one-time, in-memory heads-up after a stale-reference
    // cleanup — it is never persisted to localStorage.
    const { notice: _notice, ...persistable } = state;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Storage full or unavailable - silently fail
  }
}

/**
 * Drop cart entries whose `catalogItemId` is not a catalogItems document ID
 * (e.g. a legacy source-table ID such as `combos_...` stored by an older
 * combo/party-pack add-to-cart path). Such references cannot be resolved and
 * crash Convex queries typed `v.id("catalogItems")`. Removed entries are
 * reported so the customer is told exactly what was removed.
 */
function sanitizeCartItems(
  items: CartItem[],
): { items: CartItem[]; dropped: string[] } {
  const valid: CartItem[] = [];
  const dropped: string[] = [];
  for (const item of items) {
    if (isCatalogItemId(item.catalogItemId)) {
      valid.push(item);
    } else {
      dropped.push(item.name || item.catalogItemId);
    }
  }
  return { items: valid, dropped };
}

function loadPersistedCart(): CartState | undefined {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return undefined;

    const parsed = safeJsonParse<CartState | undefined>(stored, undefined);
    if (!parsed) return undefined;

    const { items: cleanItems, dropped } = sanitizeCartItems(parsed.items ?? []);

    // Migrate legacy items: add cartItemId if missing
    const migratedItems = cleanItems.map((item) =>
      item.cartItemId ? item : { ...item, cartItemId: generateCartItemId() }
    );

    // Normalize businessUnitIds to always be an array — old cart data from
    // before this feature was added may not have this key, resulting in undefined.
    // This fixes the runtime crash: "Cannot read properties of undefined (reading 'length')"
    // when CartPage accesses cart.businessUnitIds.length.
    const rawBuIds = parsed.businessUnitIds;
    const businessUnitIds = Array.isArray(rawBuIds)
      ? rawBuIds
      : rawBuIds
        ? [rawBuIds]
        : [];

    // Migrate old consumedItemIds to consumedQuantities
    let appliedMealDeals = parsed.appliedMealDeals;
    if (appliedMealDeals && appliedMealDeals.length > 0) {
      appliedMealDeals = appliedMealDeals.map((deal) => {
        if (deal.consumedCartLineIds) {
          // Already in new format
          return deal;
        }
        // Initialize consumedCartLineIds from items in cart
        const consumedCartLineIds: string[] = [];
        for (const item of migratedItems) {
          if (item.mealDealId === deal.mealDealId && item.cartItemId) {
              consumedCartLineIds.push(item.cartItemId!);
          }
        }
        if (deal.consumedQuantities) {
          return { ...deal, consumedCartLineIds };
        }
        // Old format: migrate consumedItemIds to consumedQuantities
        // Build consumedQuantities from cart items carrying this deal's marker
        const consumedQuantities: Record<string, number> = {};
        for (const item of migratedItems) {
          if (item.mealDealId === deal.mealDealId) {
            const itemIndex = migratedItems.findIndex(
              (i) => i.cartItemId === item.cartItemId,
            );
            if (itemIndex >= 0) {
              consumedQuantities[item.catalogItemId] =
                (consumedQuantities[item.catalogItemId] ?? 0) + 1;
            }
          }
        }
        return { ...deal, consumedQuantities, consumedCartLineIds };
      });
    }

    if (dropped.length > 0) {
      const subtotal = calculateSubtotal(migratedItems);
      const discount = parsed.discount ?? 0;
      const deliveryFee = parsed.deliveryFee ?? 0;
      const tax = parsed.tax ?? 0;
      const mealDealSavings = computeMealDealSavings(appliedMealDeals);
      const cleaned: CartState = {
        ...parsed,
        items: migratedItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, discount, deliveryFee, tax, mealDealSavings),
        notice: { type: "items_removed", itemNames: dropped },
        mealDealSavings,
      };
      persistCart(cleaned);
      return cleaned;
    }

    // Return the parsed state with normalized businessUnitIds.
    const safeState: CartState = {
      ...parsed,
      items: migratedItems,
      businessUnitIds,
      appliedMealDeals,
      mealDealSavings: computeMealDealSavings(appliedMealDeals),
    };
    return reconcileCartState(safeState);
  } catch {
    return undefined;
  }
}

// ----------------------------------------------------------------------------
// Authoritative catalog-items verification (server-side, table-aware)
// ----------------------------------------------------------------------------

/**
 * Ask the backend which of the given strings are real, non-deleted
 * catalogItems document IDs. Convex IDs are table-encoded, so a combos or
 * party-packs ID returns `false` regardless of ID format. On a transient
 * query/network failure we return an empty map so callers decide how to fail.
 */
async function verifyCatalogItemIds(ids: string[]): Promise<Record<string, boolean>> {
  if (ids.length === 0) return {};
  try {
    return await convexClient.query(api.catalogItems.verifyCatalogItemIds, {
      ids,
    });
  } catch {
    return {};
  }
}

/**
 * Drop cart entries whose `catalogItemId` does not resolve to a real
 * catalogItems document (e.g. legacy combo/party-pack references stored by an
 * older add-to-cart path). Such references cannot be resolved and would crash
 * Convex queries typed `v.id("catalogItems")`. Runs once after the cart is
 * hydrated and reports removed entries so the customer is told what happened.
 */
let hydrationSanitized = false;

export function sanitizeCartForStaleReferences(): void {
  if (hydrationSanitized) return;
  hydrationSanitized = true;

  const snapshotIds = Array.from(
    new Set(state.items.map((item) => item.catalogItemId)),
  );
  if (snapshotIds.length === 0) return;

  void verifyCatalogItemIds(snapshotIds).then((result) => {
    // Empty result = transient query/network failure — leave the cart alone
    // rather than risk dropping everything.
    if (Object.keys(result).length === 0) return;

    // Only IDs that were part of the hydrated snapshot and came back invalid
    // are dropped; items added after hydration are untouched.
    const invalidIds = new Set(
      snapshotIds.filter((id) => result[id] !== true),
    );
    if (invalidIds.size === 0) return;

    const dropped = state.items.filter((item) =>
      invalidIds.has(item.catalogItemId),
    );
    if (dropped.length === 0) return;

    const droppedNames = dropped.map((item) => item.name || item.catalogItemId);
    setState((prev) => {
      const cleanItems = prev.items.filter(
        (item) => !invalidIds.has(item.catalogItemId),
      );
      const businessUnitIds = Array.from(
        new Set(cleanItems.map((item) => item.businessUnitId)),
      );
      const subtotal = calculateSubtotal(cleanItems);
      return reconcileCartState({
        ...prev,
        items: cleanItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
        notice: { type: "items_removed", itemNames: droppedNames },
      });
    });
  });
}

// ----------------------------------------------------------------------------
// Module-level state + subscription registry
// ----------------------------------------------------------------------------

let state: CartState = loadPersistedCart() ?? defaultCartState;

const listeners = new Set<() => void>();

function emit(): void {
  persistCart(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return defaultCartState;
}

function setState(updater: (prev: CartState) => CartState): void {
  const next = updater(state);
  if (next === state) return;
  state = next;
  emit();
}

// ============================================================================
// Cart Hook
// ============================================================================

export function useCart() {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addItem = useCallback(
    async (item: Omit<CartItem, "totalPrice" | "cartItemId">): Promise<boolean> => {
      // Guard: never store a non-catalogItems reference in the cart. Combos,
      // party packs and products are synced into catalogItems — their source
      // table IDs are invalid cart references and would break checkout + the
      // homepage catalog queries. The authoritative, table-aware check runs
      // server-side via `catalogItems:verifyCatalogItemIds`.
      if (!isCatalogItemId(item.catalogItemId)) {
        toast.error("Item unavailable", {
          description: `${item.name || "This item"} is no longer available.`,
        });
        return false;
      }

      const result = await verifyCatalogItemIds([item.catalogItemId]);
      // An explicit `false` means the ID is definitively not a catalogItems
      // reference. An `undefined` entry means the verification query itself
      // failed (network / transient error) — fail open rather than block valid
      // adds; the persisted cart is still sanitized on load and stock is
      // re-validated at checkout.
      if (result[item.catalogItemId] === false) {
        toast.error("Item unavailable", {
          description: `${item.name || "This item"} is no longer available.`,
        });
        return false;
      }

      setState((prev) => {
      // Support multiple business units in cart - don't clear when adding from different BU
      const businessUnitIds = prev.businessUnitIds.includes(item.businessUnitId)
        ? prev.businessUnitIds
        : [...prev.businessUnitIds, item.businessUnitId];

      // Check if item already exists (same catalogItemId + variant)
      const existingIndex = prev.items.findIndex(
        (i) => i.catalogItemId === item.catalogItemId && i.variantName === item.variantName
      );

      let newItems: CartItem[];

      if (existingIndex >= 0) {
        newItems = prev.items.map((existing, index) => {
          if (index !== existingIndex) return existing;
          const newQty = existing.quantity + item.quantity;
          return {
            ...existing,
            quantity: newQty,
            totalPrice: existing.unitPrice * newQty,
          };
        });
      } else {
        newItems = [
          ...prev.items,
          { ...item, cartItemId: generateCartItemId(), totalPrice: item.unitPrice * item.quantity },
        ];
      }

      const subtotal = calculateSubtotal(newItems);

      return {
        ...prev,
        items: newItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax, prev.mealDealSavings),
        mealDealSavings: computeMealDealSavings(prev.appliedMealDeals),
      };
    });

    return true;
  }, []);

  const updateQuantity = useCallback(
    (cartItemId: string, quantity: number) => {
      setState((prev) => {
        if (quantity <= 0) {
          return removeItemInternal(prev, cartItemId);
        }

        const targetItem = prev.items.find((i) => i.cartItemId === cartItemId);
        if (!targetItem) return prev;

        let newItems: CartItem[];

        if (targetItem.mealDealId && quantity > targetItem.quantity) {
          // CASE A — Increasing a deal-tagged line.
          // Keep the deal line at its current quantity (the amount allocated
          // to the meal deal). The additional quantity becomes a standalone line
          // so it remains available for future meal deal allocation.
          const extra = quantity - targetItem.quantity;

          newItems = prev.items.map((item) => {
            if (item.cartItemId !== cartItemId) return item;
            return { ...item }; // unchanged — deal allocation preserved
          });

          // Add the extra as a new standalone line.
          const extraCartItemId = generateCartItemId();
          newItems.push({
            ...targetItem,
            cartItemId: extraCartItemId,
            quantity: extra,
            totalPrice: targetItem.unitPrice * extra,
            mealDealId: undefined,
            mealDealName: undefined,
          });
        } else {
          // CASE B — Decreasing OR non-deal increase: simple quantity update.
          newItems = prev.items.map((item) => {
            if (item.cartItemId !== cartItemId) return item;
            return {
              ...item,
              quantity,
              totalPrice: item.unitPrice * quantity,
            };
          });
        }

        // Merge duplicate standalone lines (same catalogItemId + variantName, no dealId).
        const merged: CartItem[] = [];
        for (const item of newItems) {
          if (item.mealDealId) {
            merged.push(item);
            continue;
          }
          const existingIdx = merged.findIndex(
            (m) =>
              m.catalogItemId === item.catalogItemId &&
              m.variantName === item.variantName &&
              !m.mealDealId,
          );
          if (existingIdx >= 0) {
            merged[existingIdx] = {
              ...merged[existingIdx],
              quantity: merged[existingIdx].quantity + item.quantity,
              totalPrice:
                merged[existingIdx].unitPrice *
                (merged[existingIdx].quantity + item.quantity),
            };
          } else {
            merged.push(item);
          }
        }

        const subtotal = calculateSubtotal(merged);

        const reconciled = reconcileCartState({
          ...prev,
          items: merged,
          subtotal,
          total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
        });
        return reconciled;
      });
    },
    []
  );

  const removeItem = useCallback((cartItemId: string) => {
    setState((prev) => removeItemInternal(prev, cartItemId));
  }, []);

  const clearCart = useCallback(() => {
    setState(() => defaultCartState);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Silently fail
    }
  }, []);

  const dismissNotice = useCallback(() => {
    setState((prev) =>
      prev.notice ? { ...prev, notice: undefined } : prev,
    );
  }, []);

  const applyMealDeal = useCallback(
    async (
      deal: EnrichedMealDeal,
      quantity: number = 1,
      sourceParentCatalogItemId?: string,
      variantSelections?: Record<string, string>,
    ): Promise<boolean> => {
      // Rule 17: Validate source parent is allowed by parentCatalogItemIds.
      if (
        sourceParentCatalogItemId &&
        !isParentAllowed(sourceParentCatalogItemId, deal.parentCatalogItemIds)
      ) {
        return false;
      }

      // Verify all qualifying items are available
      for (const qi of deal.qualifyingItems) {
        const result = await verifyCatalogItemIds([qi.catalogItemId]);
        if (result[qi.catalogItemId] === false) {
          toast.error("Meal deal unavailable", {
            description: `${qi.name} is no longer available.`,
          });
          return false;
        }
      }

      setState((prev) => {
        const newItems = [...prev.items];
        const consumedQuantities: Record<string, number> = {};
        const consumedCartLineIds: string[] = [];
        const consumedVariants: Record<string, string> = {};

        // Allocate existing standalone qualifying items first; only add
        // the shortfall so Path A never inflates quantities.
        for (const qi of deal.qualifyingItems) {
          const needed = qi.quantity * quantity;
          let remaining = needed;

          // Resolve the selected variant for this qualifying item.
          const selectedVariant =
            variantSelections?.[qi.catalogItemId] ??
            qi.defaultVariantName ??
            "Default";
          consumedVariants[qi.catalogItemId] = selectedVariant;

          // Find the price for the selected variant.
          const variantInfo = qi.variants?.find(
            (v) => v.optionValue === selectedVariant,
          );
          const variantUnitPrice = variantInfo?.price ?? qi.price ?? 0;

          // Find all standalone (non-deal) items matching this qualifying product
          for (let i = 0; i < newItems.length && remaining > 0; i++) {
            const ci = newItems[i];
            if (
              ci.catalogItemId === qi.catalogItemId &&
              ci.variantName === selectedVariant &&
              !ci.mealDealId
            ) {
              const take = Math.min(ci.quantity, remaining);
              if (take === ci.quantity) {
                // Tag entire item as deal
                newItems[i] = {
                  ...ci,
                  mealDealId: deal._id,
                  mealDealName: deal.name,
                };
                consumedCartLineIds.push(ci.cartItemId ?? generateCartItemId());
              } else {
                // Split: reduce standalone, add deal-tagged portion
                const dealCartItemId = generateCartItemId();
                newItems[i] = {
                  ...ci,
                  quantity: ci.quantity - take,
                  totalPrice: ci.unitPrice * (ci.quantity - take),
                };
                newItems.push({
                  ...ci,
                  cartItemId: dealCartItemId,
                  quantity: take,
                  totalPrice: ci.unitPrice * take,
                  mealDealId: deal._id,
                  mealDealName: deal.name,
                });
                consumedCartLineIds.push(dealCartItemId);
              }
              remaining -= take;
            }
          }

          // Add any remaining shortfall as new deal-tagged items
          if (remaining > 0) {
            const dealCartItemId = generateCartItemId();
            newItems.push({
              cartItemId: dealCartItemId,
              catalogItemId: qi.catalogItemId,
              itemType: "product",
              businessUnitId: prev.businessUnitIds[0] ?? "",
              name: qi.name ?? "Qualifying Item",
              variantName: selectedVariant,
              quantity: remaining,
              unitPrice: variantUnitPrice,
              totalPrice: variantUnitPrice * remaining,
              mealDealId: deal._id,
              mealDealName: deal.name,
            });
            consumedCartLineIds.push(dealCartItemId);
          }

          consumedQuantities[qi.catalogItemId] =
            (consumedQuantities[qi.catalogItemId] ?? 0) + needed;
        }

        // Track the applied meal deal with per-item consumed quantities
        const appliedDeal: CartAppliedMealDeal = {
          mealDealId: deal._id,
          name: deal.name,
          dealPrice: deal.dealPrice,
          savings: deal.savings,
          quantity,
          consumedQuantities,
          consumedCartLineIds,
          ...(Object.keys(consumedVariants).length > 0
            ? { consumedVariants }
            : {}),
          applyToCombos: deal.applyToCombos,
          applyToPartyPacks: deal.applyToPartyPacks,
          ...(deal.parentCatalogItemIds
            ? { parentCatalogItemIds: deal.parentCatalogItemIds }
            : {}),
          ...(sourceParentCatalogItemId
            ? { sourceParentCatalogItemId }
            : {}),
        };

        const prevApplied = prev.appliedMealDeals ?? [];
        // Check if this deal is already applied (increment quantity and merge consumed quantities)
        const existingDealIndex = prevApplied.findIndex(
          (d) => d.mealDealId === deal._id
        );
        let newApplied: CartAppliedMealDeal[];
        if (existingDealIndex >= 0) {
          const existing = prevApplied[existingDealIndex];
          const mergedConsumed: Record<string, number> = {
            ...existing.consumedQuantities,
          };
          for (const [key, val] of Object.entries(consumedQuantities)) {
            mergedConsumed[key] = (mergedConsumed[key] ?? 0) + val;
          }
          newApplied = prevApplied.map((d, i) =>
            i === existingDealIndex
              ? {
                  ...d,
                  quantity: d.quantity + quantity,
                  consumedQuantities: mergedConsumed,
                  consumedCartLineIds: [...(d.consumedCartLineIds ?? []), ...consumedCartLineIds],
                  consumedVariants: {
                    ...(d.consumedVariants ?? {}),
                    ...consumedVariants,
                  },
                }
              : d
          );
        } else {
          newApplied = [...prevApplied, appliedDeal];
        }

        const subtotal = calculateSubtotal(newItems);
        const businessUnitIds = prev.businessUnitIds.includes(Object.keys(consumedQuantities ?? {})[0] ?? "")
          ? prev.businessUnitIds
          : prev.businessUnitIds;
        const mealDealSavings = computeMealDealSavings(newApplied);

        return {
          ...prev,
          items: newItems,
          businessUnitIds,
          appliedMealDeals: newApplied,
          subtotal,
          total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax, mealDealSavings),
          mealDealSavings,
        };
      });

      toast.success(`${deal.name} applied!`, {
        description: `You're saving ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(deal.savings * quantity)}`,
      });

      return true;
    },
    [],
  );

  const allocateExistingMealDeal = useCallback(
    async (deal: EnrichedMealDeal, sourceParentCatalogItemId?: string): Promise<boolean> => {
      // Rule 17: Validate source parent is allowed by parentCatalogItemIds.
      if (
        sourceParentCatalogItemId &&
        !isParentAllowed(sourceParentCatalogItemId, deal.parentCatalogItemIds)
      ) {
        return false;
      }

      for (const qi of deal.qualifyingItems) {
        const result = await verifyCatalogItemIds([qi.catalogItemId]);
        if (result[qi.catalogItemId] === false) {
          toast.error("Meal deal unavailable", {
            description: `${qi.name} is no longer available.`,
          });
          return false;
        }
      }

      setState((prev) => {
        // Find existing qualifying items (not already part of a deal).
        const availableByQi: Array<{
          qi: (typeof deal.qualifyingItems)[number];
          indices: number[];
        }> = [];

        for (const qi of deal.qualifyingItems) {
          const indices: number[] = [];
          for (let i = 0; i < prev.items.length; i++) {
            const ci = prev.items[i];
            if (
              ci.catalogItemId === qi.catalogItemId &&
              !ci.mealDealId
            ) {
              indices.push(i);
            }
          }
          availableByQi.push({ qi, indices });
        }

        // How many complete sets can we form?
        let setsAvailable = Infinity;
        for (const { qi, indices } of availableByQi) {
          const totalAvailable = indices.reduce(
            (sum, idx) => sum + prev.items[idx].quantity,
            0,
          );
          setsAvailable = Math.min(
            setsAvailable,
            Math.floor(totalAvailable / qi.quantity),
          );
        }

        if (setsAvailable <= 0 || setsAvailable === Infinity) {
          return prev; // nothing to allocate
        }

        // Allocate exactly 1 set per Apply click (Rule 3: existing quantities only).
        const setsToAllocate = 1;
        const newItems = [...prev.items];
        const consumedQuantities: Record<string, number> = {};
        const consumedCartLineIds: string[] = [];

        for (const { qi, indices } of availableByQi) {
          let remaining = qi.quantity * setsToAllocate;
          for (const idx of indices) {
            if (remaining <= 0) break;
            const item = newItems[idx];
            const take = Math.min(item.quantity, remaining);
            if (take === item.quantity) {
              // Tag the entire item
              newItems[idx] = {
                ...item,
                mealDealId: deal._id,
                mealDealName: deal.name,
              };
              consumedCartLineIds.push(item.cartItemId ?? generateCartItemId());
            } else {
              // Split: part for deal, part remains standalone
              const dealCartItemId = generateCartItemId();
              newItems[idx] = {
                ...item,
                quantity: item.quantity - take,
                totalPrice: item.unitPrice * (item.quantity - take),
              };
              newItems.push({
                ...item,
                cartItemId: dealCartItemId,
                quantity: take,
                totalPrice: item.unitPrice * take,
                mealDealId: deal._id,
                mealDealName: deal.name,
              });
              consumedCartLineIds.push(dealCartItemId);
            }
            remaining -= take;
          }
          consumedQuantities[qi.catalogItemId] =
            (consumedQuantities[qi.catalogItemId] ?? 0) +
            qi.quantity * setsToAllocate;
        }

        // Build consumed variants from the allocated items.
        const consumedVariants: Record<string, string> = {};
        for (const { qi } of availableByQi) {
          // Use the variant from the first allocated item for this qualifying item.
          const matchingIdx = availableByQi.find((a) => a.qi.catalogItemId === qi.catalogItemId)?.indices[0];
          if (matchingIdx !== undefined && newItems[matchingIdx]) {
            consumedVariants[qi.catalogItemId] = newItems[matchingIdx].variantName;
          }
        }

        const appliedDeal: CartAppliedMealDeal = {
          mealDealId: deal._id,
          name: deal.name,
          dealPrice: deal.dealPrice,
          savings: deal.savings,
          quantity: setsToAllocate,
          consumedQuantities,
          consumedCartLineIds,
          ...(Object.keys(consumedVariants).length > 0
            ? { consumedVariants }
            : {}),
          applyToCombos: deal.applyToCombos,
          applyToPartyPacks: deal.applyToPartyPacks,
          ...(deal.parentCatalogItemIds
            ? { parentCatalogItemIds: deal.parentCatalogItemIds }
            : {}),
          ...(sourceParentCatalogItemId
            ? { sourceParentCatalogItemId }
            : {}),
        };

        const prevApplied = prev.appliedMealDeals ?? [];
        const existingDealIndex = prevApplied.findIndex(
          (d) => d.mealDealId === deal._id,
        );
        let newApplied: CartAppliedMealDeal[];
        if (existingDealIndex >= 0) {
          const existing = prevApplied[existingDealIndex];
          const mergedConsumed: Record<string, number> = {
            ...existing.consumedQuantities,
          };
          for (const [key, val] of Object.entries(consumedQuantities)) {
            mergedConsumed[key] = (mergedConsumed[key] ?? 0) + val;
          }
          newApplied = prevApplied.map((d, i) =>
            i === existingDealIndex
              ? {
                  ...d,
                  quantity: d.quantity + setsToAllocate,
                  consumedQuantities: mergedConsumed,
                  consumedCartLineIds: [...(d.consumedCartLineIds ?? []), ...consumedCartLineIds],
                  consumedVariants: {
                    ...(d.consumedVariants ?? {}),
                    ...consumedVariants,
                  },
                }
              : d,
          );
        } else {
          newApplied = [...prevApplied, appliedDeal];
        }

        const subtotal = calculateSubtotal(newItems);
        const mealDealSavings = computeMealDealSavings(newApplied);
        return {
          ...prev,
          items: newItems,
          appliedMealDeals: newApplied,
          subtotal,
          total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax, mealDealSavings),
          mealDealSavings,
        };
      });

      toast.success(`${deal.name} applied!`, {
        description: `You're saving ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(deal.savings)}`,
      });

      return true;
    },
    [],
  );

  const removeMealDeal = useCallback(
    (mealDealId: string) => {
      setState((prev) => {
        // Strip mealDealId/mealDealName from allocated items (keep them as
        // normal solo products). Items that were added by Path A and have no
        // standalone presence should be removed — but allocated items
        // (Smart Detection) were pre-existing and must be preserved.
        const newItems = prev.items
          .map((item) => {
            if (item.mealDealId === mealDealId) {
              const { mealDealId: _m, mealDealName: _n, ...rest } = item;
              return rest;
            }
            return item;
          })
          .filter((item) => {
            // After stripping, if an item would be a duplicate (same
            // catalogItemId + variantName, both without mealDealId), merge
            // quantities into the first occurrence.
            return true;
          });

        // Merge duplicates that resulted from stripping deal markers
        const merged: CartItem[] = [];
        for (const item of newItems) {
          const existingIdx = merged.findIndex(
            (m) =>
              m.catalogItemId === item.catalogItemId &&
              m.variantName === item.variantName &&
              !("mealDealId" in m && m.mealDealId),
          );
          if (existingIdx >= 0 && !("mealDealId" in item && item.mealDealId)) {
            merged[existingIdx] = {
              ...merged[existingIdx],
              quantity: merged[existingIdx].quantity + item.quantity,
              totalPrice:
                merged[existingIdx].unitPrice *
                (merged[existingIdx].quantity + item.quantity),
            };
          } else {
            merged.push(item);
          }
        }

        const newApplied = (prev.appliedMealDeals ?? []).filter(
          (d) => d.mealDealId !== mealDealId,
        );

        const businessUnitIds =
          merged.length > 0
            ? Array.from(new Set(merged.map((item) => item.businessUnitId)))
            : [];

        const subtotal = calculateSubtotal(merged);
        const validApplied = newApplied.length > 0 ? newApplied : undefined;
        const mealDealSavings = computeMealDealSavings(validApplied);
        return {
          ...prev,
          items: merged,
          businessUnitIds,
          appliedMealDeals: validApplied,
          subtotal,
          total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax, mealDealSavings),
          mealDealSavings,
        };
      });
    },
    [],
  );

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    dismissNotice,
    applyMealDeal,
    allocateExistingMealDeal,
    removeMealDeal,
    itemCount,
  };
}

// Internal helper to avoid recreating the logic
function removeItemInternal(
  prev: CartState,
  cartItemId: string,
): CartState {
  const newItems = prev.items.filter(
    (item) => item.cartItemId !== cartItemId,
  );

  // Merge duplicate standalone items (same catalogItemId + variantName, no dealId)
  // that may result from stripping deal markers.
  const merged: CartItem[] = [];
  for (const item of newItems) {
    if (item.mealDealId) {
      merged.push(item);
      continue;
    }
    const existingIdx = merged.findIndex(
      (m) =>
        m.catalogItemId === item.catalogItemId &&
        m.variantName === item.variantName &&
        !m.mealDealId,
    );
    if (existingIdx >= 0) {
      merged[existingIdx] = {
        ...merged[existingIdx],
        quantity: merged[existingIdx].quantity + item.quantity,
        totalPrice:
          merged[existingIdx].unitPrice *
          (merged[existingIdx].quantity + item.quantity),
      };
    } else {
      merged.push(item);
    }
  }

  const businessUnitIds =
    merged.length > 0
      ? Array.from(new Set(merged.map((item) => item.businessUnitId)))
      : [];
  const subtotal = calculateSubtotal(merged);

  // reconcileCartState handles all deal invalidation: parent removal,
  // qualifying item removal, quantity sufficiency, parent quantity cap,
  // deal marker stripping, consumedCartLineIds rebuild, and
  // mealDealSavings computation.
  return reconcileCartState({
    ...prev,
    items: merged,
    businessUnitIds,
    subtotal,
    total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
  });
}