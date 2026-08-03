import { useCallback, useState } from "react";

import { STORAGE_KEYS } from "@/constants";

// ============================================================================
// Browsing Preference — remembers which business unit the shopper engages
// with most, used to reorder homepage sections without hiding the other BU.
// ============================================================================

const STORAGE_KEY = STORAGE_KEYS.BROWSING_PREFERENCE;

function loadPreference(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useBrowsingPreference() {
  const [preferredBusinessUnitId, setPreferredBusinessUnitId] = useState<
    string | null
  >(loadPreference);

  const setPreference = useCallback((businessUnitId: string) => {
    setPreferredBusinessUnitId(businessUnitId);
    try {
      localStorage.setItem(STORAGE_KEY, businessUnitId);
    } catch {
      // Storage unavailable - silently fail
    }
  }, []);

  return { preferredBusinessUnitId, setPreference };
}
