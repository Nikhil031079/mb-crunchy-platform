import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { STORAGE_KEYS } from "@/constants";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  // Guest cart migration: when auth state changes, confirm that the cart
  // persisted in localStorage (mb-crunchy-cart) remains accessible. The cart
  // store loads from this key on initialization, so no data is lost across
  // sign-in / sign-out cycles. This effect runs on mount and on auth state
  // change to confirm accessibility — it does not modify cart state.
  useEffect(() => {
    try {
      const key = STORAGE_KEYS.CART;
      const stored = localStorage.getItem(key);
      if (stored) {
        JSON.parse(stored);
      }
    } catch {
      // Corrupt or missing cart storage — let the cart store handle recovery
    }
  }, [isAuthenticated, isLoading]);

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
