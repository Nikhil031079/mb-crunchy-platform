// ============================================================================
// Store Hours — server-side open/closed computation
//
// Mirrors src/utils/store-hours.ts so order creation is validated server-side.
// Kept inside convex/ because Convex functions can only import from within the
// convex/ directory (the client util cannot be referenced from the backend).
// ============================================================================

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface DayHours {
  open?: string;
  close?: string;
}

interface StoreHoursSettings {
  isOpen?: boolean;
  openingHours?: Record<string, DayHours> | null;
}

/**
 * Server-side twin of the client `isStoreCurrentlyOpen`. Matches its behavior:
 * 1. No settings at all → treated as open (mirrors the client default).
 * 2. `isOpen` false → closed (admin master switch).
 * 3. No `openingHours` → fall back to the `isOpen` flag only.
 * 4. Otherwise today's hours must contain the current time.
 */
export function isStoreCurrentlyOpen(
  settings: StoreHoursSettings | null | undefined,
): boolean {
  if (!settings) return true;
  if (!settings.isOpen) return false;
  if (!settings.openingHours) return true;

  const todayKey = DAY_NAMES[new Date().getDay()];
  const todayHours = settings.openingHours[todayKey];
  if (!todayHours?.open || !todayHours.close) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTime(todayHours.open);
  const closeMinutes = parseTime(todayHours.close);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}
