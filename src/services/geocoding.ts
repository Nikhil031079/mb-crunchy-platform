// ============================================================================
// MB CRUNCHY - Geocoding Service (Frontend Abstraction)
//
// Calls Convex server-side geocode actions. No direct provider calls.
// Provider-specific details are hidden behind this module.
// ============================================================================

import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  zipCode?: string;
  city?: string;
  state?: string;
}

// ---------------------------------------------------------------------------
// In-memory PIN cache (24h TTL)
// ---------------------------------------------------------------------------

const PIN_CACHE_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: GeocodeResult;
  expiry: number;
}

const pinCache = new Map<string, CacheEntry>();

function getCachedPin(pin: string): GeocodeResult | null {
  const entry = pinCache.get(pin);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    pinCache.delete(pin);
    return null;
  }
  return entry.result;
}

function setPinCache(pin: string, result: GeocodeResult): void {
  pinCache.set(pin, { result, expiry: Date.now() + PIN_CACHE_TTL });
}

// ---------------------------------------------------------------------------
// Hook-based service (for React components)
// ---------------------------------------------------------------------------

/**
 * Returns geocoding functions that call Convex server-side actions.
 * Must be used inside a ConvexProvider.
 */
export function useGeocodingService() {
  const geocodePincodeAction = useAction(api.geocode.pincode);
  const geocodeAddressAction = useAction(api.geocode.address);

  async function geocodePincode(pin: string): Promise<GeocodeResult> {
    const trimmed = pin.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      throw new Error("Please enter a valid 6-digit PIN code.");
    }

    const cached = getCachedPin(trimmed);
    if (cached) return cached;

    const result = await geocodePincodeAction({ pincode: trimmed });
    setPinCache(trimmed, result);
    return result;
  }

  async function geocodeAddress(address: string): Promise<GeocodeResult[]> {
    const trimmed = address.trim();
    if (trimmed.length < 5) {
      throw new Error("Please enter a more complete address (at least 5 characters).");
    }

    return await geocodeAddressAction({ address: trimmed });
  }

  return { geocodePincode, geocodeAddress } as const;
}
