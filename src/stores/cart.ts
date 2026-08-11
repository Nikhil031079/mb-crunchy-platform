import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import type { CartItem, CartState } from "@/types";
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

const defaultCartState: CartState = {
  items: [],
  businessUnitIds: [],
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  tax: 0,
  total: 0,
  note: undefined,
};

function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.totalPrice, 0);
}

function computeTotal(subtotal: number, discount: number, deliveryFee: number, tax: number): number {
  return Math.max(0, subtotal - discount + deliveryFee + tax);
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
    if (dropped.length > 0) {
      const businessUnitIds = Array.from(
        new Set(cleanItems.map((item) => item.businessUnitId)),
      );
      const subtotal = calculateSubtotal(cleanItems);
      const discount = parsed.discount ?? 0;
      const deliveryFee = parsed.deliveryFee ?? 0;
      const tax = parsed.tax ?? 0;
      const cleaned: CartState = {
        ...parsed,
        items: cleanItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, discount, deliveryFee, tax),
        notice: { type: "items_removed", itemNames: dropped },
      };
      persistCart(cleaned);
      return cleaned;
    }

    return parsed;
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
      return {
        ...prev,
        items: cleanItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
        notice: { type: "items_removed", itemNames: droppedNames },
      };
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
    async (item: Omit<CartItem, "totalPrice">): Promise<boolean> => {
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
          { ...item, totalPrice: item.unitPrice * item.quantity },
        ];
      }

      const subtotal = calculateSubtotal(newItems);

      return {
        ...prev,
        items: newItems,
        businessUnitIds,
        subtotal,
        total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
      };
    });

    return true;
  }, []);

  const updateQuantity = useCallback(
    (catalogItemId: string, variantName: string, quantity: number) => {
      setState((prev) => {
        if (quantity <= 0) {
          return removeItemInternal(prev, catalogItemId, variantName);
        }

        const newItems = prev.items.map((item) => {
          if (item.catalogItemId !== catalogItemId || item.variantName !== variantName)
            return item;
          return {
            ...item,
            quantity,
            totalPrice: item.unitPrice * quantity,
          };
        });

        const subtotal = calculateSubtotal(newItems);

        return { ...prev, items: newItems, subtotal, total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax) };
      });
    },
    []
  );

  const removeItem = useCallback((catalogItemId: string, variantName: string) => {
    setState((prev) => removeItemInternal(prev, catalogItemId, variantName));
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

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    dismissNotice,
    itemCount,
  };
}

// Internal helper to avoid recreating the logic
function removeItemInternal(
  prev: CartState,
  catalogItemId: string,
  variantName: string
): CartState {
  const newItems = prev.items.filter(
    (item) => !(item.catalogItemId === catalogItemId && item.variantName === variantName)
  );

  // If no items left, clear businessUnitIds as well
  const businessUnitIds = newItems.length > 0 ? prev.businessUnitIds : [];

  const subtotal = calculateSubtotal(newItems);

  return { ...prev, items: newItems, businessUnitIds, subtotal, total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax) };
}
