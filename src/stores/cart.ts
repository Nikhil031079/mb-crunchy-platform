import { useCallback, useSyncExternalStore } from "react";

import type { CartItem, CartState } from "@/types";
import { STORAGE_KEYS } from "@/constants";
import { safeJsonParse } from "@/utils";

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
  businessUnitId: null,
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
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable - silently fail
  }
}

function loadPersistedCart(): CartState | undefined {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return undefined;

    const parsed = safeJsonParse<CartState | undefined>(stored, undefined);
    if (!parsed) return undefined;

    return parsed;
  } catch {
    return undefined;
  }
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

  const addItem = useCallback((item: Omit<CartItem, "totalPrice">) => {
    setState((prev) => {
      // If adding from a different business unit, clear cart first
      if (prev.businessUnitId && prev.businessUnitId !== item.businessUnitId) {
        const newItems = [{ ...item, totalPrice: item.unitPrice * item.quantity }];
        const subtotal = calculateSubtotal(newItems);
        return {
          ...defaultCartState,
          items: newItems,
          businessUnitId: item.businessUnitId,
          subtotal,
          total: subtotal,
        };
      }

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
        businessUnitId: item.businessUnitId,
        subtotal,
        total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax),
      };
    });
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

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
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

  if (newItems.length === 0) {
    return defaultCartState;
  }

  const subtotal = calculateSubtotal(newItems);

  return { ...prev, items: newItems, subtotal, total: computeTotal(subtotal, prev.discount, prev.deliveryFee, prev.tax) };
}
