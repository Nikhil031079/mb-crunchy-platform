"use node";

// ============================================================================
// MB CRUNCHY - Server-Side Geocoding (Google Maps)
//
// All Google Geocoding API calls happen here (Convex actions). The API key
// never leaves the server. The browser receives only validated coordinates
// and normalized address data.
// ============================================================================

import { v } from "convex/values";
import { action } from "./_generated/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  zipCode?: string;
  city?: string;
  state?: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) {
    throw new Error("Geocoding service not configured.");
  }
  return key;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function extractComponent(
  components: GoogleGeocodeResponse["results"][0]["address_components"],
  type: string,
): string | undefined {
  const comp = components.find((c) => c.types.includes(type));
  return comp?.long_name;
}

function parseResults(
  raw: GoogleGeocodeResponse,
): GeocodeResult[] {
  if (!raw.results || raw.results.length === 0) return [];

  return raw.results
    .filter((r) => isValidCoord(r.geometry?.location?.lat, r.geometry?.location?.lng))
    .map((r) => ({
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
      formattedAddress: r.formatted_address ?? "",
      zipCode: extractComponent(r.address_components, "postal_code"),
      city:
        extractComponent(r.address_components, "locality") ??
        extractComponent(r.address_components, "sublocality") ??
        extractComponent(r.address_components, "administrative_area_level_2"),
      state: extractComponent(r.address_components, "administrative_area_level_1"),
    }));
}

async function callGoogleGeocoding(
  params: Record<string, string>,
): Promise<GoogleGeocodeResponse> {
  const apiKey = getApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Geocoding service temporarily unavailable.");
  }

  const data = (await response.json()) as GoogleGeocodeResponse;

  if (data.status === "REQUEST_DENIED") {
    throw new Error("Geocoding service not configured.");
  }
  if (data.status === "OVER_QUERY_LIMIT") {
    throw new Error("Geocoding service limit reached. Please try again later.");
  }
  if (data.status === "INVALID_REQUEST") {
    throw new Error("Invalid location input.");
  }

  return data;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Geocode a 6-digit Indian PIN code to approximate coordinates. */
export const pincode = action({
  args: { pincode: v.string() },
  handler: async (
    _ctx,
    args,
  ): Promise<GeocodeResult> => {
    const trimmed = args.pincode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      throw new Error("Please enter a valid 6-digit PIN code.");
    }

    const raw = await callGoogleGeocoding({
      address: `${trimmed}, India`,
      region: "in",
      components: "country:IN",
    });

    const results = parseResults(raw);
    if (results.length === 0) {
      throw new Error("PIN not found. Please try another PIN or use GPS.");
    }

    return results[0];
  },
});

/** Geocode a free-text address to coordinates. Returns all candidate results. */
export const address = action({
  args: { address: v.string() },
  handler: async (
    _ctx,
    args,
  ): Promise<GeocodeResult[]> => {
    const trimmed = args.address.trim();
    if (trimmed.length < 5) {
      throw new Error("Please enter a more complete address (at least 5 characters).");
    }

    const raw = await callGoogleGeocoding({
      address: `${trimmed}, India`,
      region: "in",
      components: "country:IN",
    });

    const results = parseResults(raw);
    if (results.length === 0) {
      throw new Error(
        "Couldn't determine this location. Please use GPS or enter a more complete address.",
      );
    }

    return results;
  },
});
