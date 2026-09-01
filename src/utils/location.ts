// ============================================================================
// Location Utilities — geolocation validation + Haversine distance + serviceability
// ============================================================================

import type { CustomerLocation } from "@/types";

const EARTH_RADIUS_KM = 6371;

// ---------------------------------------------------------------------------
// Coordinate validation
// ---------------------------------------------------------------------------

/** Validates that a value is a finite number within the given range. */
function inRange(value: unknown, min: number, max: number): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return value >= min && value <= max;
}

/** Returns true if the given coordinates are valid geographic coordinates. */
export function isValidCoordinate(
  latitude: unknown,
  longitude: unknown,
): boolean {
  return inRange(latitude, -90, 90) && inRange(longitude, -180, 180);
}

/**
 * Returns true if a CustomerLocation has usable geographic coordinates.
 *
 * Absent latitude/longitude means "location known, coordinates not yet resolved"
 * (e.g. PIN/address-only). This is distinct from (0,0) which is a legitimate
 * geographic coordinate near the Gulf of Guinea.
 */
export function hasValidLocationCoordinates(
  location: Pick<CustomerLocation, "latitude" | "longitude"> | null | undefined,
): boolean {
  if (!location) return false;
  return isValidCoordinate(location.latitude, location.longitude);
}

/** Validates an Indian PIN code (exactly 6 digits). */
export function isValidIndianPin(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate geodesic distance between two points using the Haversine formula.
 *
 * @returns distance in kilometres (rounded to 2 decimal places)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}

// ---------------------------------------------------------------------------
// Kitchen Serviceability
// ---------------------------------------------------------------------------

export type ServiceabilityReason =
  | "OUTSIDE_RADIUS"
  | "NO_CUSTOMER_COORDINATES"
  | "NO_KITCHEN_ORIGIN"
  | "BU_DELIVERY_DISABLED"
  | "NO_RADIUS_CONFIGURED";

export interface KitchenServiceability {
  serviceable: boolean;
  /** Distance in km, or null when cannot be computed. */
  distanceKm: number | null;
  /** Configured delivery radius in km, or null if not set. */
  radiusKm: number | null;
  reason?: ServiceabilityReason;
}

/** Minimal BU shape needed for serviceability check. */
export interface ServiceabilityBU {
  enableDelivery: boolean;
  originLatitude?: number;
  originLongitude?: number;
  deliveryRadiusKm?: number;
}

/**
 * Check whether a customer location is within a Business Unit's delivery radius.
 *
 * This is a pure utility — no network calls. The backend MUST independently
 * revalidate serviceability before accepting an order.
 */
export function checkKitchenServiceability(
  customerLocation: CustomerLocation | null,
  bu: ServiceabilityBU,
): KitchenServiceability {
  // 1. BU delivery disabled
  if (!bu.enableDelivery) {
    return { serviceable: false, distanceKm: null, radiusKm: null, reason: "BU_DELIVERY_DISABLED" };
  }

  // 2. BU origin not configured
  if (
    bu.originLatitude === undefined ||
    bu.originLongitude === undefined ||
    !isValidCoordinate(bu.originLatitude, bu.originLongitude)
  ) {
    return { serviceable: false, distanceKm: null, radiusKm: null, reason: "NO_KITCHEN_ORIGIN" };
  }

  // 3. Radius not configured
  if (bu.deliveryRadiusKm === undefined || bu.deliveryRadiusKm <= 0) {
    return { serviceable: false, distanceKm: null, radiusKm: null, reason: "NO_RADIUS_CONFIGURED" };
  }

  // 4. No customer coordinates
  if (!customerLocation) {
    return { serviceable: false, distanceKm: null, radiusKm: bu.deliveryRadiusKm, reason: "NO_CUSTOMER_COORDINATES" };
  }

  // Coordinate availability: absent latitude/longitude means "not yet resolved"
  // (PIN/address-only awaiting geocoding). Distinct from legitimate (0,0).
  if (!hasValidLocationCoordinates(customerLocation)) {
    return { serviceable: false, distanceKm: null, radiusKm: bu.deliveryRadiusKm, reason: "NO_CUSTOMER_COORDINATES" };
  }

  // 5. Compute distance (coordinates are guaranteed present + valid here)
  const distanceKm = haversineDistance(
    bu.originLatitude,
    bu.originLongitude,
    customerLocation.latitude!,
    customerLocation.longitude!,
  );

  const serviceable = distanceKm <= bu.deliveryRadiusKm;

  return {
    serviceable,
    distanceKm,
    radiusKm: bu.deliveryRadiusKm,
    reason: serviceable ? undefined : "OUTSIDE_RADIUS",
  };
}
