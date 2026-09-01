import { useCallback, useSyncExternalStore } from "react";

import type { CustomerLocation } from "@/types";
import { STORAGE_KEYS } from "@/constants";
import { safeJsonParse } from "@/utils";
import { isValidCoordinate, hasValidLocationCoordinates } from "@/utils/location";

// ============================================================================
// Location Store — module-level singleton for the customer's delivery location.
//
// Follows the same `useSyncExternalStore` pattern as `src/stores/cart.ts`.
// Persisted to localStorage so it survives page refresh / route changes.
// ============================================================================

const LOCATION_STORAGE_KEY = STORAGE_KEYS.LOCATION;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistLocation(location: CustomerLocation | null): void {
  try {
    if (location) {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    } else {
      localStorage.removeItem(LOCATION_STORAGE_KEY);
    }
  } catch {
    // Storage full or unavailable — silently fail.
  }
}

function loadPersistedLocation(): CustomerLocation | null {
  try {
    const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = safeJsonParse<CustomerLocation | null>(stored, null);
    if (!parsed) return null;

    // Migrate legacy sentinel: latitude=0, longitude=0 means "no coordinates".
    // Strip them so the app treats this as "coordinates unavailable" rather than
    // a geographic point near the Gulf of Guinea.
    if (
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number" &&
      parsed.latitude === 0 &&
      parsed.longitude === 0
    ) {
      const { latitude: _lat, longitude: _lng, ...rest } = parsed;
      return rest as CustomerLocation;
    }

    // If coordinates are present, validate them. If invalid, strip them
    // but preserve the rest of the location (PIN, address, etc.).
    if (
      (parsed.latitude !== undefined || parsed.longitude !== undefined) &&
      !hasValidLocationCoordinates(parsed)
    ) {
      const { latitude: _lat, longitude: _lng, ...rest } = parsed;
      return rest as CustomerLocation;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level state + subscription registry
// ---------------------------------------------------------------------------

let state: CustomerLocation | null = loadPersistedLocation();

const listeners = new Set<() => void>();

function emit(): void {
  persistLocation(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CustomerLocation | null {
  return state;
}

function getServerSnapshot(): CustomerLocation | null {
  return null;
}

// ---------------------------------------------------------------------------
// Public setters (non-React consumers + internal)
// ---------------------------------------------------------------------------

function setLocation(location: CustomerLocation): void {
  state = location;
  emit();
}

function clearLocation(): void {
  state = null;
  emit();
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useLocationStore() {
  const location = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((loc: CustomerLocation) => {
    setLocation(loc);
  }, []);

  const clear = useCallback(() => {
    clearLocation();
  }, []);

  const hasLocation = location !== null;

  return { location, set, clear, hasLocation } as const;
}

// Expose raw setters for non-React consumers if needed in future.
export { setLocation, clearLocation };
