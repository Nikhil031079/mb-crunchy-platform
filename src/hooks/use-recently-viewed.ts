import { useCallback, useEffect, useState } from "react";

import { STORAGE_KEYS } from "@/constants";
import { isCatalogItemId, safeJsonParse } from "@/utils";
import type { CatalogItemType } from "@/types";
import { convexClient } from "@/lib/convex";
import { api } from "@convex/_generated/api";

// ============================================================================
// Recently Viewed (localStorage) — guest-friendly, last 12, auto-deduped
// ============================================================================

export const MAX_RECENTLY_VIEWED = 12;

export interface RecentlyViewedEntry {
  catalogItemId: string;
  businessUnitId: string;
  itemType: CatalogItemType;
  name: string;
  slug: string;
  image?: string;
  price: number;
  viewedAt: number;
}

const STORAGE_KEY = STORAGE_KEYS.RECENTLY_VIEWED;

function loadEntries(): RecentlyViewedEntry[] {
  const parsed = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return (parsed as RecentlyViewedEntry[])
    .filter(
      (entry) =>
        entry &&
        isCatalogItemId(entry.catalogItemId) &&
        typeof entry.viewedAt === "number"
    )
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_RECENTLY_VIEWED);
}

// ----------------------------------------------------------------------------
// Stale recently-viewed sanitizer (authoritative, table-aware)
// ----------------------------------------------------------------------------

let recentlyViewedSanitized = false;

export async function sanitizeRecentlyViewed(): Promise<void> {
  if (recentlyViewedSanitized) return;
  recentlyViewedSanitized = true;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const parsed = safeJsonParse<unknown>(stored, []);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const entries = (parsed as RecentlyViewedEntry[]).filter(
      (entry) =>
        entry &&
        isCatalogItemId(entry.catalogItemId) &&
        typeof entry.viewedAt === "number"
    );

    if (entries.length === 0) return;

    // Extract unique catalogItemIds for verification
    const uniqueIds = Array.from(new Set(entries.map((e) => e.catalogItemId)));

    // Authoritative server-side table-aware validation
    let result: Record<string, boolean>;
    try {
      result = await convexClient.query(api.catalogItems.verifyCatalogItemIds, {
        ids: uniqueIds,
      });
    } catch {
      // Transient query/network failure — leave localStorage alone
      return;
    }

    // Empty result = unexpected failure — leave localStorage alone
    if (Object.keys(result).length === 0) return;

    // Filter to only valid catalogItems IDs
    const validIds = new Set(uniqueIds.filter((id) => result[id] === true));
    if (validIds.size === uniqueIds.length) return; // All valid, nothing to do

    const cleanEntries = entries.filter((e) => validIds.has(e.catalogItemId));
    if (cleanEntries.length === entries.length) return;

    // Persist cleaned entries
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanEntries));
    } catch {
      // Storage full or unavailable - silently fail
    }
  } catch {
    // Any unexpected error — leave localStorage alone
  }
}

export function useRecentlyViewed() {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>(loadEntries);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable - silently fail
    }
  }, [entries]);

  const recordView = useCallback(
    (entry: Omit<RecentlyViewedEntry, "viewedAt">) => {
      setEntries((prev) => {
        const next = [
          { ...entry, viewedAt: Date.now() },
          ...prev.filter((e) => e.catalogItemId !== entry.catalogItemId),
        ];
        return next.slice(0, MAX_RECENTLY_VIEWED);
      });
    },
    []
  );

  const clearRecentlyViewed = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, recordView, clearRecentlyViewed };
}
