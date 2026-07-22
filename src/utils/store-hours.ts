// ============================================================================
// Store Hours — compute open/closed status and next opening time
// ============================================================================

import type { BusinessUnitSettings } from "@/types";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_LABELS_FULL: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Check if the store is currently open based on `isOpen` flag + `openingHours` schedule.
 *
 * Logic:
 * 1. If `isOpen` is false → store is closed (admin master switch).
 * 2. If `openingHours` is not set → fall back to `isOpen` flag only.
 * 3. If `openingHours` is set → check today's hours against current time.
 *    - If no hours for today → closed.
 *    - If current time is between open and close → open.
 *    - Otherwise → closed.
 */
export function isStoreCurrentlyOpen(
  settings: Pick<BusinessUnitSettings, "isOpen" | "openingHours">
): boolean {
  if (!settings.isOpen) return false;

  if (!settings.openingHours) return true;

  const todayKey = DAY_NAMES[new Date().getDay()];
  const todayHours = settings.openingHours[todayKey];

  if (!todayHours) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTime(todayHours.open);
  const closeMinutes = parseTime(todayHours.close);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export interface NextOpenTime {
  day: string;
  dayLabel: string;
  time: string;
  timeFormatted: string;
}

/**
 * Calculate when the store next opens.
 *
 * Walks forward through the week starting from today. For each day:
 * - If the day has hours and we haven't passed the open time today → that's the next open.
 * - If the day has hours but we've passed it → continue to the next day.
 *
 * Returns null if no opening hours are configured at all.
 */
export function getNextOpenTime(
  settings: Pick<BusinessUnitSettings, "isOpen" | "openingHours">
): NextOpenTime | null {
  if (!settings.openingHours) return null;

  const now = new Date();
  const currentDayIndex = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Check up to 8 days (full week + 1 to wrap)
  for (let offset = 0; offset < 8; offset++) {
    const dayIndex = (currentDayIndex + offset) % 7;
    const dayKey = DAY_NAMES[dayIndex];
    const dayHours = settings.openingHours[dayKey];

    if (!dayHours) continue;

    const openMinutes = parseTime(dayHours.open);

    // If it's today, only return if we haven't passed the open time
    if (offset === 0 && currentMinutes >= openMinutes) {
      continue;
    }

    return {
      day: dayKey,
      dayLabel: DAY_LABELS_FULL[dayKey],
      time: dayHours.open,
      timeFormatted: formatTime12(dayHours.open),
    };
  }

  return null;
}

/**
 * Get today's hours formatted for display.
 */
export function getTodayHours(
  openingHours?: BusinessUnitSettings["openingHours"]
): string | null {
  if (!openingHours) return null;

  const todayKey = DAY_NAMES[new Date().getDay()];
  const todayHours = openingHours[todayKey];

  if (!todayHours) return null;

  return `${formatTime12(todayHours.open)} – ${formatTime12(todayHours.close)}`;
}
