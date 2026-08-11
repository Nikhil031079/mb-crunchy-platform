import { ConvexReactClient } from "convex/react";

// ============================================================================
// Shared Convex client — single instance used by the React provider (main.tsx)
// and by non-React consumers such as the cart store.
// ============================================================================

export const convexClient = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
);
