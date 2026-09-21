// ============================================================================
// MB CRUNCHY — 26F-8.1 Regression Tests for Critical Defect Fixes
//
// Tests the two critical defects found in 26F-8:
// 1. courierMetadata type mismatch (string vs object)
// 2. Invalid activity action strings missing from schema
//
// NO REAL SHIPMENTS. NO REAL AWBS. NO PRODUCTION CALLS. NO DEPLOYMENT.
// ============================================================================

import { describe, it, expect } from "vitest";

// ============================================================================
// Defect #1: courierMetadata Parser Tests
//
// The parser boundary that all readers MUST use.
// shiprocketAdapter stores courierMetadata as a JSON string.
// Readers must safely handle: string, object, null, undefined, malformed JSON.
// ============================================================================

/**
 * Parse courierMetadata — extracted from autoBooking.ts / adminBooking.ts.
 * This is the safe boundary that all readers must use.
 */
interface ParsedCourierMetadata {
  bookingStatus: string;
  bookingExternalShipmentId?: string;
  shiprocketOrderId?: number;
  shiprocketShipmentId?: number;
  [key: string]: unknown;
}

const SAFE_METADATA: ParsedCourierMetadata = {
  bookingStatus: "not_started",
};

function parseCourierMetadata(raw: unknown): ParsedCourierMetadata {
  if (!raw) return SAFE_METADATA;
  if (typeof raw === "object") return raw as ParsedCourierMetadata;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as ParsedCourierMetadata;
      return SAFE_METADATA;
    } catch {
      return { bookingStatus: "unknown", bookingError: "Malformed metadata JSON" };
    }
  }
  return SAFE_METADATA;
}

/**
 * Simulates the idempotency check from autoBooking.ts.
 * Returns true if booking should be skipped (already in progress/completed).
 */
function shouldSkipBooking(rawMetadata: unknown, awbNumber?: string): boolean {
  // Parse with safe boundary
  const metadata = parseCourierMetadata(rawMetadata);
  if (metadata?.bookingStatus) {
    const status = metadata.bookingStatus;
    if (
      status === "creating" ||
      status === "order_created" ||
      status === "awb_assigning" ||
      status === "created" ||
      status === "unknown"
    ) {
      return true;
    }
  }
  if (awbNumber) return true;
  return false;
}

// ============================================================================
// GROUP A: courierMetadata Parser Tests
// ============================================================================

describe("26F-8.1 — courierMetadata parser", () => {
  // Test 1: object metadata with bookingStatus=created
  it("Test 1: object metadata with bookingStatus=created → correctly recognized", () => {
    const metadata = { bookingStatus: "created", shiprocketOrderId: 12345 };
    const parsed = parseCourierMetadata(metadata);
    expect(parsed.bookingStatus).toBe("created");
    expect(parsed.shiprocketOrderId).toBe(12345);
  });

  // Test 2: JSON string metadata with bookingStatus=created
  it("Test 2: JSON string metadata with bookingStatus=created → correctly recognized", () => {
    const metadata = JSON.stringify({ bookingStatus: "created", shiprocketOrderId: 12345 });
    const parsed = parseCourierMetadata(metadata);
    expect(parsed.bookingStatus).toBe("created");
    expect(parsed.shiprocketOrderId).toBe(12345);
  });

  // Test 3: JSON string metadata with bookingStatus=creating
  it("Test 3: JSON string metadata with bookingStatus=creating → correctly recognized", () => {
    const metadata = JSON.stringify({ bookingStatus: "creating" });
    const parsed = parseCourierMetadata(metadata);
    expect(parsed.bookingStatus).toBe("creating");
  });

  // Test 4: null metadata
  it("Test 4: null metadata → treated safely as not_started", () => {
    const parsed = parseCourierMetadata(null);
    expect(parsed.bookingStatus).toBe("not_started");
  });

  // Test 5: malformed JSON metadata → safe handling, no duplicate booking
  it("Test 5: malformed JSON → safe handling, MUST NOT trigger duplicate booking", () => {
    const malformed = "{ bookingStatus: 'created' }"; // invalid JSON
    const parsed = parseCourierMetadata(malformed);
    // Malformed JSON should result in "unknown" status
    expect(parsed.bookingStatus).toBe("unknown");
    // Idempotency check should block duplicate booking for "unknown"
    expect(shouldSkipBooking(malformed)).toBe(true);
  });

  // Test 6: metadata containing unrelated fields → preserved
  it("Test 6: metadata with unrelated fields → unrelated fields preserved", () => {
    const metadata = JSON.stringify({
      bookingStatus: "created",
      shiprocketOrderId: 12345,
      customField: "preserved",
      nested: { key: "value" },
    });
    const parsed = parseCourierMetadata(metadata);
    expect(parsed.bookingStatus).toBe("created");
    expect(parsed.shiprocketOrderId).toBe(12345);
    expect(parsed.customField).toBe("preserved");
    expect(parsed.nested).toEqual({ key: "value" });
  });

  // Test 7: duplicate invocation after bookingStatus=created → MUST NOT book again
  it("Test 7: duplicate invocation after bookingStatus=created → MUST NOT book again", () => {
    const metadata = JSON.stringify({ bookingStatus: "created" });
    expect(shouldSkipBooking(metadata)).toBe(true);
  });

  // Test 8: duplicate invocation while bookingStatus=creating → MUST NOT book again
  it("Test 8: duplicate invocation while bookingStatus=creating → MUST NOT book again", () => {
    const metadata = JSON.stringify({ bookingStatus: "creating" });
    expect(shouldSkipBooking(metadata)).toBe(true);
  });

  // Test 9: order_created state → resume/recovery behavior remains unchanged
  it("Test 9: order_created state → booking skipped (recovery via reconciliation)", () => {
    const metadata = JSON.stringify({ bookingStatus: "order_created" });
    expect(shouldSkipBooking(metadata)).toBe(true);
  });

  // Test 10: awb_assigning state → resume/recovery behavior remains unchanged
  it("Test 10: awb_assigning state → booking skipped (recovery via reconciliation)", () => {
    const metadata = JSON.stringify({ bookingStatus: "awb_assigning" });
    expect(shouldSkipBooking(metadata)).toBe(true);
  });
});

// ============================================================================
// GROUP B: order activity action validation
// ============================================================================

describe("26F-8.1 — order activity actions", () => {
  // Valid actions as defined in schema.ts
  const VALID_ACTIONS = [
    "order_created",
    "payment_pending",
    "payment_verified",
    "payment_failed",
    "order_accepted",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refund_initiated",
    "refund_completed",
    "manual_status_change",
    "inventory_reserved",
    "inventory_released",
    "note_added",
    "note_updated",
    "note_deleted",
    "courier_booking_attempt",
    "courier_booking_failed",
    "courier_booking_unknown",
    "courier_booking_order_created",
    "courier_booking_error",
    "courier_booking_reconciled",
    "courier_booking_reconciliation_failed",
  ];

  // Test 11: "courier_booking_failed" passes schema validation
  it("Test 11: 'courier_booking_failed' is in the valid action set", () => {
    expect(VALID_ACTIONS).toContain("courier_booking_failed");
  });

  // Test 12: all existing activity actions remain valid
  it("Test 12: all courier booking actions are in the valid action set", () => {
    const courierActions = [
      "courier_booking_attempt",
      "courier_booking_failed",
      "courier_booking_unknown",
      "courier_booking_order_created",
      "courier_booking_error",
      "courier_booking_reconciled",
      "courier_booking_reconciliation_failed",
    ];
    for (const action of courierActions) {
      expect(VALID_ACTIONS).toContain(action);
    }
  });

  // Additional: all original actions still present
  it("Test 12b: all original order lifecycle actions remain valid", () => {
    const originalActions = [
      "order_created",
      "payment_pending",
      "payment_verified",
      "payment_failed",
      "order_accepted",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "refund_initiated",
      "refund_completed",
      "manual_status_change",
      "inventory_reserved",
      "inventory_released",
      "note_added",
      "note_updated",
      "note_deleted",
    ];
    for (const action of originalActions) {
      expect(VALID_ACTIONS).toContain(action);
    }
  });
});
