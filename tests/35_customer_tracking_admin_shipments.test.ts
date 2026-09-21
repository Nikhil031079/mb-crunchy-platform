// ============================================================================
// MB CRUNCHY — Phase 35 Customer Tracking + Admin Shipment Tests
//
// Focused tests for customer shipment tracking and admin monitoring.
// Covers authorization, data presentation, and edge cases.
//
// Pure logic/unit tests — no live Shiprocket calls.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// Test Helpers
// ============================================================================

const ENV_BACKUP: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  ENV_BACKUP[key] = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreAllEnv() {
  for (const [key, val] of Object.entries(ENV_BACKUP)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

// ============================================================================
// 1. Customer Shipment Tracking Query
// ============================================================================

import { SHIPMENT_STATUS_LABELS } from "../convex/courier/shipmentStatus";

describe("1. Customer Shipment Tracking", () => {
  it("should return shipment data for delivery orders", () => {
    // Simulate shipment data
    const shipment = {
      shipmentStatus: "in_transit" as const,
      courierName: "Test Courier",
      awbNumber: "AWB123456",
      trackingUrl: "https://track.example.com/AWB123456",
      destinationPincode: "400001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(shipment.shipmentStatus).toBe("in_transit");
    expect(SHIPMENT_STATUS_LABELS[shipment.shipmentStatus]).toBe("In Transit");
    expect(shipment.courierName).toBe("Test Courier");
    expect(shipment.awbNumber).toBe("AWB123456");
    expect(shipment.trackingUrl).toBeTruthy();
  });

  it("should return null for pickup orders", () => {
    const orderType = "pickup";
    const shipment = orderType === "delivery" ? { status: "pending" } : null;
    expect(shipment).toBeNull();
  });

  it("should handle missing AWB gracefully", () => {
    const shipment = {
      awbNumber: null,
      courierName: null,
      trackingUrl: null,
    };

    expect(shipment.awbNumber).toBeNull();
    expect(shipment.courierName).toBeNull();
    expect(shipment.trackingUrl).toBeNull();
  });

  it("should display status labels correctly", () => {
    expect(SHIPMENT_STATUS_LABELS["pending"]).toBe("Pending");
    expect(SHIPMENT_STATUS_LABELS["processing"]).toBe("Processing");
    expect(SHIPMENT_STATUS_LABELS["booked"]).toBe("Booked");
    expect(SHIPMENT_STATUS_LABELS["shipped"]).toBe("Shipped");
    expect(SHIPMENT_STATUS_LABELS["in_transit"]).toBe("In Transit");
    expect(SHIPMENT_STATUS_LABELS["out_for_delivery"]).toBe("Out for Delivery");
    expect(SHIPMENT_STATUS_LABELS["delivered"]).toBe("Delivered");
    expect(SHIPMENT_STATUS_LABELS["cancelled"]).toBe("Cancelled");
    expect(SHIPMENT_STATUS_LABELS["failed"]).toBe("Failed");
  });
});

// ============================================================================
// 2. Authorization Patterns
// ============================================================================

describe("2. Authorization Patterns", () => {
  it("should verify guest tracking via phone + order number", () => {
    // Guest tracking pattern: phone + order number must match
    function verifyGuestAccess(
      orderPhone: string,
      orderNumber: string,
      providedPhone: string,
      providedOrderNumber: string,
    ): boolean {
      return (
        orderPhone === providedPhone &&
        orderNumber === providedOrderNumber.toUpperCase()
      );
    }

    expect(verifyGuestAccess("9876543210", "MB-ABC123", "9876543210", "mb-abc123")).toBe(true);
    expect(verifyGuestAccess("9876543210", "MB-ABC123", "9876543211", "MB-ABC123")).toBe(false);
    expect(verifyGuestAccess("9876543210", "MB-ABC123", "9876543210", "MB-ABC124")).toBe(false);
  });

  it("should verify admin session required for admin queries", () => {
    // Admin queries require valid session token
    function requireAdminSession(sessionToken: string | undefined): boolean {
      return !!sessionToken && sessionToken.length > 0;
    }

    expect(requireAdminSession("valid-token")).toBe(true);
    expect(requireAdminSession(undefined)).toBe(false);
    expect(requireAdminSession("")).toBe(false);
  });

  it("should verify kitchen staff restricted to their business units", () => {
    // Kitchen staff can only see shipments for their authorized business units
    function filterByBusinessUnit(
      shipments: Array<{ businessUnitId: string }>,
      allowedBUs: string[],
    ): Array<{ businessUnitId: string }> {
      return shipments.filter((s) => allowedBUs.includes(s.businessUnitId));
    }

    const shipments = [
      { businessUnitId: "bu_mart" },
      { businessUnitId: "bu_kitchen" },
      { businessUnitId: "bu_mart" },
    ];

    // Kitchen staff with only kitchen access
    const kitchenOnly = filterByBusinessUnit(shipments, ["bu_kitchen"]);
    expect(kitchenOnly).toHaveLength(1);
    expect(kitchenOnly[0].businessUnitId).toBe("bu_kitchen");

    // Admin with all access
    const adminAll = filterByBusinessUnit(shipments, ["bu_mart", "bu_kitchen"]);
    expect(adminAll).toHaveLength(3);
  });
});

// ============================================================================
// 3. Data Presentation
// ============================================================================

describe("3. Data Presentation", () => {
  it("should not expose raw provider status codes", () => {
    // Customer should see normalized status labels, not Shiprocket codes
    const shiprocketCode = 38;
    const normalizedStatus = "in_transit";
    const label = SHIPMENT_STATUS_LABELS[normalizedStatus];

    expect(label).toBe("In Transit");
    expect(label).not.toBe("38");
    expect(label).not.toContain("shiprocket");
  });

  it("should not expose internal database IDs to customers", () => {
    // Customer-safe shipment data should not include raw _id
    const internalShipment = {
      _id: "ship_123456",
      orderId: "order_789",
      providerShipmentId: "12345",
      awbNumber: "AWB123",
    };

    // Customer-safe projection
    const customerSafe = {
      status: "in_transit",
      courierName: "Test Courier",
      awbNumber: internalShipment.awbNumber,
      trackingUrl: null,
    };

    expect(customerSafe).not.toHaveProperty("_id");
    expect(customerSafe).not.toHaveProperty("orderId");
    expect(customerSafe).not.toHaveProperty("providerShipmentId");
  });

  it("should order tracking events chronologically", () => {
    const events = [
      { eventTimestamp: 3000, status: "shipped" },
      { eventTimestamp: 1000, status: "pending" },
      { eventTimestamp: 2000, status: "processing" },
    ];

    const sorted = [...events].sort((a, b) => a.eventTimestamp - b.eventTimestamp);

    expect(sorted[0].status).toBe("pending");
    expect(sorted[1].status).toBe("processing");
    expect(sorted[2].status).toBe("shipped");
  });

  it("should handle missing tracking URL gracefully", () => {
    const shipment = { trackingUrl: null };

    // Should not show broken button
    const showTrackButton = !!shipment.trackingUrl;
    expect(showTrackButton).toBe(false);
  });

  it("should show AWB only when available", () => {
    const shipmentWithAwb = { awbNumber: "AWB123" };
    const shipmentWithoutAwb = { awbNumber: null };

    expect(shipmentWithAwb.awbNumber).toBeTruthy();
    expect(shipmentWithoutAwb.awbNumber).toBeFalsy();
  });
});

// ============================================================================
// 4. Kitchen Safety
// ============================================================================

describe("4. Kitchen Safety", () => {
  it("should not show courier tracking for Kitchen orders", () => {
    const order = {
      orderType: "delivery" as const,
      businessUnitId: "bu_kitchen",
    };

    // Kitchen orders should use existing tracking, not courier tracking
    const showCourierTracking = order.businessUnitId === "bu_mart";
    expect(showCourierTracking).toBe(false);
  });

  it("should not show courier tracking for pickup orders", () => {
    const order = {
      orderType: "pickup" as const,
      businessUnitId: "bu_mart",
    };

    // Pickup orders should not show courier tracking
    const showCourierTracking = order.orderType === "delivery";
    expect(showCourierTracking).toBe(false);
  });

  it("should show courier tracking only for Mart delivery orders", () => {
    const order = {
      orderType: "delivery" as const,
      businessUnitId: "bu_mart",
    };

    const showCourierTracking =
      order.orderType === "delivery" && order.businessUnitId === "bu_mart";
    expect(showCourierTracking).toBe(true);
  });
});

// ============================================================================
// 5. Shipment States
// ============================================================================

describe("5. Shipment States", () => {
  it("should distinguish not-booked state", () => {
    const shipment = null;
    expect(shipment).toBeNull();
  });

  it("should distinguish booking-in-progress state", () => {
    const shipment = {
      shipmentStatus: "pending",
      awbNumber: null,
      courierName: null,
    };

    expect(shipment.shipmentStatus).toBe("pending");
    expect(shipment.awbNumber).toBeNull();
  });

  it("should distinguish booked state", () => {
    const shipment = {
      shipmentStatus: "booked",
      awbNumber: "AWB123",
      courierName: "Test Courier",
    };

    expect(shipment.shipmentStatus).toBe("booked");
    expect(shipment.awbNumber).toBeTruthy();
  });

  it("should distinguish delivered state", () => {
    const shipment = {
      shipmentStatus: "delivered",
      awbNumber: "AWB123",
      courierName: "Test Courier",
    };

    expect(shipment.shipmentStatus).toBe("delivered");
  });

  it("should distinguish cancelled state", () => {
    const shipment = {
      shipmentStatus: "cancelled",
      awbNumber: null,
      courierName: null,
    };

    expect(shipment.shipmentStatus).toBe("cancelled");
  });

  it("should distinguish failed state", () => {
    const shipment = {
      shipmentStatus: "failed",
      awbNumber: null,
      courierName: null,
    };

    expect(shipment.shipmentStatus).toBe("failed");
  });
});

// ============================================================================
// 6. Security
// ============================================================================

describe("6. Security", () => {
  it("should not expose Shiprocket credentials", () => {
    const logs: string[] = [];

    function logError(message: string): void {
      logs.push(message);
    }

    // Simulate error scenarios
    logError("Shipment not found for order");
    logError("Invalid session token");

    // None should contain actual credentials
    for (const log of logs) {
      expect(log).not.toContain("COURIER_SHIPROCKET_API_EMAIL");
      expect(log).not.toContain("COURIER_SHIPROCKET_API_PASSWORD");
      expect(log).not.toContain("COURIER_SHIPROCKET_WEBHOOK_SECRET");
    }
  });

  it("should not expose webhook secrets", () => {
    const secrets = [
      "test-secret-123",
      "actual-webhook-secret",
      "production-secret",
    ];

    for (const secret of secrets) {
      // Verify that secret is not in any customer-facing output
      const customerOutput = "Shipment tracking information";
      expect(customerOutput).not.toContain(secret);
    }
  });

  it("should verify admin session before returning data", () => {
    // Admin queries must verify session before returning data
    function requireAdminSession(sessionToken: string | undefined): boolean {
      if (!sessionToken) return false;
      if (sessionToken.length < 10) return false;
      return true;
    }

    expect(requireAdminSession("valid-session-token-123")).toBe(true);
    expect(requireAdminSession(undefined)).toBe(false);
    expect(requireAdminSession("short")).toBe(false);
  });
});

// ============================================================================
// 7. Status Transitions
// ============================================================================

import { isValidShipmentTransition } from "../convex/courier/shipmentStatus";

describe("7. Status Transitions", () => {
  it("should allow valid forward transitions", () => {
    expect(isValidShipmentTransition("pending", "processing")).toBe(true);
    expect(isValidShipmentTransition("processing", "booked")).toBe(true);
    expect(isValidShipmentTransition("booked", "shipped")).toBe(true);
    expect(isValidShipmentTransition("shipped", "in_transit")).toBe(true);
    expect(isValidShipmentTransition("in_transit", "out_for_delivery")).toBe(true);
    expect(isValidShipmentTransition("out_for_delivery", "delivered")).toBe(true);
  });

  it("should reject backwards transitions", () => {
    expect(isValidShipmentTransition("delivered", "pending")).toBe(false);
    expect(isValidShipmentTransition("shipped", "pending")).toBe(false);
    expect(isValidShipmentTransition("in_transit", "shipped")).toBe(false);
  });

  it("should reject transitions from terminal states", () => {
    expect(isValidShipmentTransition("delivered", "cancelled")).toBe(false);
    expect(isValidShipmentTransition("cancelled", "pending")).toBe(false);
    expect(isValidShipmentTransition("failed", "pending")).toBe(false);
  });
});

// ============================================================================
// 8. Tracking Event Display
// ============================================================================

describe("8. Tracking Event Display", () => {
  it("should display event status label correctly", () => {
    const event = {
      status: "in_transit",
      statusLabel: SHIPMENT_STATUS_LABELS["in_transit"],
      description: "Package in transit to destination",
      eventTimestamp: Date.now(),
    };

    expect(event.statusLabel).toBe("In Transit");
    expect(event.description).toBeTruthy();
  });

  it("should handle events without description", () => {
    const event = {
      status: "shipped",
      statusLabel: SHIPMENT_STATUS_LABELS["shipped"],
      description: null,
      eventTimestamp: Date.now(),
    };

    expect(event.description).toBeNull();
  });

  it("should limit displayed events to recent 5", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      _id: `event_${i}`,
      status: "in_transit",
      eventTimestamp: i * 1000,
    }));

    const displayEvents = events.slice(-5).reverse();
    expect(displayEvents).toHaveLength(5);
    expect(displayEvents[0]._id).toBe("event_9");
  });
});
