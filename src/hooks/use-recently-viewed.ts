import { useCallback, useEffect, useState } from "react";

import { STORAGE_KEYS } from "@/constants";
import { safeJsonParse } from "@/utils";
import type { CatalogItemType } from "@/types";

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
        typeof entry.catalogItemId === "string" &&
        typeof entry.viewedAt === "number"
    )
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_RECENTLY_VIEWED);
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
