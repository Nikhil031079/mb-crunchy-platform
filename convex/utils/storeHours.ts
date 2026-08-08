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

// Store hours are configured in the store's local timezone (Asia/Kolkata,
// UTC+05:30). Convex functions run on UTC clocks, so the current weekday and
// time-of-day must be derived from UTC shifted by the store's offset — never
// from `new Date().getDay()/getHours()` directly, or orders get rejected
// (and accepted) at the wrong local times. India has no DST, so a fixed
// offset is safe.
const STORE_TIMEZONE_OFFSET_MINUTES = 5 * 60 + 30;

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Current weekday index + minutes-of-day in the store's timezone.
 * Handles day rollover when shifting UTC forward by the offset.
 */
function getStoreNow(date = new Date()): { day: number; minutes: number } {
  const shifted =
    date.getUTCHours() * 60 + date.getUTCMinutes() + STORE_TIMEZONE_OFFSET_MINUTES;
  const minutes = ((shifted % 1440) + 1440) % 1440;
  const dayShift = Math.floor(shifted / 1440);
  const day = (((date.getUTCDay() + dayShift) % 7) + 7) % 7;
  return { day, minutes };
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

  const { day, minutes: currentMinutes } = getStoreNow();
  const todayKey = DAY_NAMES[day];
  const todayHours = settings.openingHours[todayKey];
  if (!todayHours?.open || !todayHours.close) return false;

  const openMinutes = parseTime(todayHours.open);
  const closeMinutes = parseTime(todayHours.close);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}
