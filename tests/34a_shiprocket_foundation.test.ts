// ============================================================================
// MB CRUNCHY — Phase 34A Shiprocket Foundation Tests
//
// Focused tests for the Shiprocket integration foundation:
//   1. Shipment status model validation
//   2. Status transition rules
//   3. Shiprocket status mapping
//   4. Unknown status behavior
//   5. Dry-run adapter behavior
//   6. Missing configuration behavior
//   7. Adapter error handling
//   8. Webhook parsing
//   9. Credential non-exposure
//  10. Configuration loading
//
// Pure logic/unit tests — no live backend, no real Shiprocket calls.
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ============================================================================
// 1. Shipment Status Model
// ============================================================================

import {
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_TRANSITIONS,
  isTerminalShipmentStatus,
  isValidShipmentTransition,
  type ShipmentStatus,
} from "../convex/courier/shipmentStatus";

describe("1. Shipment Status Model", () => {
  it("should define exactly 9 statuses", () => {
    expect(SHIPMENT_STATUSES).toHaveLength(9);
  });

  it("should include all required statuses", () => {
    expect(SHIPMENT_STATUSES).toContain("pending");
    expect(SHIPMENT_STATUSES).toContain("processing");
    expect(SHIPMENT_STATUSES).toContain("booked");
    expect(SHIPMENT_STATUSES).toContain("shipped");
    expect(SHIPMENT_STATUSES).toContain("in_transit");
    expect(SHIPMENT_STATUSES).toContain("out_for_delivery");
    expect(SHIPMENT_STATUSES).toContain("delivered");
    expect(SHIPMENT_STATUSES).toContain("cancelled");
    expect(SHIPMENT_STATUSES).toContain("failed");
  });

  it("should have labels for every status", () => {
    for (const status of SHIPMENT_STATUSES) {
      expect(SHIPMENT_STATUS_LABELS[status]).toBeDefined();
      expect(typeof SHIPMENT_STATUS_LABELS[status]).toBe("string");
      expect(SHIPMENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("should have transitions defined for every status", () => {
    for (const status of SHIPMENT_STATUSES) {
      expect(SHIPMENT_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(SHIPMENT_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});

// ============================================================================
// 2. Terminal Status Detection
// ============================================================================

describe("2. Terminal Status Detection", () => {
  it("should identify delivered as terminal", () => {
    expect(isTerminalShipmentStatus("delivered")).toBe(true);
  });

  it("should identify cancelled as terminal", () => {
    expect(isTerminalShipmentStatus("cancelled")).toBe(true);
  });

  it("should identify failed as terminal", () => {
    expect(isTerminalShipmentStatus("failed")).toBe(true);
  });

  it("should identify pending as non-terminal", () => {
    expect(isTerminalShipmentStatus("pending")).toBe(false);
  });

  it("should identify in_transit as non-terminal", () => {
    expect(isTerminalShipmentStatus("in_transit")).toBe(false);
  });

  it("should identify out_for_delivery as non-terminal", () => {
    expect(isTerminalShipmentStatus("out_for_delivery")).toBe(false);
  });
});

// ============================================================================
// 3. Status Transition Rules
// ============================================================================

describe("3. Status Transition Rules", () => {
  it("should allow pending -> processing", () => {
    expect(isValidShipmentTransition("pending", "processing")).toBe(true);
  });

  it("should allow pending -> cancelled", () => {
    expect(isValidShipmentTransition("pending", "cancelled")).toBe(true);
  });

  it("should allow processing -> booked", () => {
    expect(isValidShipmentTransition("processing", "booked")).toBe(true);
  });

  it("should allow booked -> shipped", () => {
    expect(isValidShipmentTransition("booked", "shipped")).toBe(true);
  });

  it("should allow shipped -> in_transit", () => {
    expect(isValidShipmentTransition("shipped", "in_transit")).toBe(true);
  });

  it("should allow in_transit -> out_for_delivery", () => {
    expect(isValidShipmentTransition("in_transit", "out_for_delivery")).toBe(true);
  });

  it("should allow in_transit -> delivered", () => {
    expect(isValidShipmentTransition("in_transit", "delivered")).toBe(true);
  });

  it("should allow out_for_delivery -> delivered", () => {
    expect(isValidShipmentTransition("out_for_delivery", "delivered")).toBe(true);
  });

  it("should NOT allow delivered -> pending (terminal)", () => {
    expect(isValidShipmentTransition("delivered", "pending")).toBe(false);
  });

  it("should NOT allow cancelled -> pending (terminal)", () => {
    expect(isValidShipmentTransition("cancelled", "pending")).toBe(false);
  });

  it("should NOT allow failed -> pending (terminal)", () => {
    expect(isValidShipmentTransition("failed", "pending")).toBe(false);
  });

  it("should NOT allow pending -> delivered (skip steps)", () => {
    expect(isValidShipmentTransition("pending", "delivered")).toBe(false);
  });

  it("should NOT allow pending -> in_transit (skip steps)", () => {
    expect(isValidShipmentTransition("pending", "in_transit")).toBe(false);
  });
});

// ============================================================================
// 4. Shiprocket Status Mapping
// ============================================================================

import {
  SHIPROCKET_STATUS_MAP,
  normalizeShiprocketStatus,
} from "../convex/courier/shiprocketStatusMap";

describe("4. Shiprocket Status Mapping", () => {
  it("should map numeric status 6 to pending", () => {
    expect(normalizeShiprocketStatus("6")).toBe("pending");
  });

  it("should map numeric status 18 to shipped", () => {
    expect(normalizeShiprocketStatus("18")).toBe("shipped");
  });

  it("should map numeric status 38 to in_transit", () => {
    expect(normalizeShiprocketStatus("38")).toBe("in_transit");
  });

  it("should map numeric status 39 to out_for_delivery", () => {
    expect(normalizeShiprocketStatus("39")).toBe("out_for_delivery");
  });

  it("should map numeric status 7 to delivered", () => {
    expect(normalizeShiprocketStatus("7")).toBe("delivered");
  });

  it("should map numeric status 29 to cancelled", () => {
    expect(normalizeShiprocketStatus("29")).toBe("cancelled");
  });

  it("should map numeric status 100 to failed (RTO)", () => {
    expect(normalizeShiprocketStatus("100")).toBe("failed");
  });

  it("should map numeric status 70 to failed (failed attempt)", () => {
    expect(normalizeShiprocketStatus("70")).toBe("failed");
  });

  it("should accept number input", () => {
    expect(normalizeShiprocketStatus(6)).toBe("pending");
    expect(normalizeShiprocketStatus(38)).toBe("in_transit");
  });

  it("should return undefined for unknown status", () => {
    expect(normalizeShiprocketStatus("999")).toBeUndefined();
    expect(normalizeShiprocketStatus("unknown")).toBeUndefined();
  });

  it("should handle empty string gracefully", () => {
    expect(normalizeShiprocketStatus("")).toBeUndefined();
  });
});

// ============================================================================
// 5. Unknown Provider Status Behavior
// ============================================================================

describe("5. Unknown Provider Status Behavior", () => {
  it("should not map fabricated status codes", () => {
    expect(normalizeShiprocketStatus("99999")).toBeUndefined();
    expect(normalizeShiprocketStatus("abc")).toBeUndefined();
  });

  it("should not map negative status codes", () => {
    expect(normalizeShiprocketStatus("-1")).toBeUndefined();
  });
});

// ============================================================================
// 6. Dry-Run Adapter Behavior
// ============================================================================

import {
  loadShiprocketConfig,
  authenticate,
  createShiprocketOrder,
  assignAwb,
  trackShipment,
  verifyWebhookSignature,
  parseWebhookEvent,
  type ShiprocketConfig,
} from "../convex/courier/shiprocketAdapter";

// Save and restore env
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

function makeDryRunConfig(): ShiprocketConfig {
  return {
    apiEmail: "test@example.com",
    apiPassword: "test-password",
    webhookSecret: "test-webhook-secret",
    dryRun: true,
    baseUrl: "https://apiv2.shiprocket.in/v1/external",
  };
}

describe("6. Dry-Run Adapter Behavior", () => {
  beforeEach(() => {
    setEnv("COURIER_SHIPROCKET_API_EMAIL", "test@example.com");
    setEnv("COURIER_SHIPROCKET_API_PASSWORD", "test-password");
    setEnv("COURIER_DRY_RUN", "true");
  });

  afterEach(() => {
    restoreAllEnv();
  });

  it("should return mock token in dry-run mode", async () => {
    const config = makeDryRunConfig();
    const auth = await authenticate(config);
    expect(auth.token).toBe("dry-run-token");
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
  });

  it("should return mock order in dry-run mode", async () => {
    const config = makeDryRunConfig();
    const result = await createShiprocketOrder(config, "dry-run-token", {
      order_id: "TEST-001",
      order_date: "2026-09-19",
      pickup_location: "Primary",
      billing_customer_name: "Test User",
      billing_address: "123 Test St",
      billing_city: "Mumbai",
      billing_pincode: "400001",
      billing_state: "Maharashtra",
      billing_country: "India",
      billing_phone: "9876543210",
      shipping_customer_name: "Test User",
      shipping_address: "123 Test St",
      shipping_city: "Mumbai",
      shipping_pincode: "400001",
      shipping_state: "Maharashtra",
      shipping_country: "India",
      shipping_phone: "9876543210",
      order_items: [],
      payment_method: "prepaid",
      sub_total: 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.order_id).toBeGreaterThan(0);
      expect(result.data.shipment_id).toBeGreaterThan(0);
    }
  });

  it("should return mock AWB in dry-run mode", async () => {
    const config = makeDryRunConfig();
    const result = await assignAwb(config, "dry-run-token", {
      shipment_id: [12345],
      courier_id: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.response[0].awb_code).toMatch(/^DRY/);
      expect(result.data.response[0].courier_name).toBe("dry-run-courier");
    }
  });

  it("should return mock tracking in dry-run mode", async () => {
    const config = makeDryRunConfig();
    const result = await trackShipment(config, "dry-run-token", "DRY123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tracking_data?.awb).toBe("DRY123");
      expect(result.data.tracking_data?.current_status).toBe("pending");
    }
  });
});

// ============================================================================
// 7. Missing Configuration Behavior
// ============================================================================

describe("7. Missing Configuration Behavior", () => {
  beforeEach(() => {
    // Clear all relevant env vars
    delete process.env.COURIER_SHIPROCKET_API_EMAIL;
    delete process.env.COURIER_SHIPROCKET_API_PASSWORD;
    delete process.env.COURIER_DRY_RUN;
  });

  afterEach(() => {
    restoreAllEnv();
  });

  it("should throw when API email is missing", () => {
    process.env.COURIER_SHIPROCKET_API_PASSWORD = "test";
    expect(() => loadShiprocketConfig()).toThrow(/COURIER_SHIPROCKET_API_EMAIL/);
  });

  it("should throw when API password is missing", () => {
    process.env.COURIER_SHIPROCKET_API_EMAIL = "test@example.com";
    expect(() => loadShiprocketConfig()).toThrow(/COURIER_SHIPROCKET_API_PASSWORD/);
  });

  it("should throw when both are missing", () => {
    expect(() => loadShiprocketConfig()).toThrow(/COURIER_SHIPROCKET_API_EMAIL.*COURIER_SHIPROCKET_API_PASSWORD/);
  });
});

// ============================================================================
// 8. Webhook Signature Verification
// ============================================================================

describe("8. Webhook Signature Verification", () => {
  it("should verify valid signature", () => {
    const config = makeDryRunConfig();
    expect(verifyWebhookSignature(config, "{}", "test-webhook-secret")).toBe(true);
  });

  it("should reject invalid signature", () => {
    const config = makeDryRunConfig();
    expect(verifyWebhookSignature(config, "{}", "wrong-secret")).toBe(false);
  });

  it("should reject null signature", () => {
    const config = makeDryRunConfig();
    expect(verifyWebhookSignature(config, "{}", null)).toBe(false);
  });

  it("should reject when webhook secret is empty", () => {
    const config = { ...makeDryRunConfig(), webhookSecret: "" };
    expect(verifyWebhookSignature(config, "{}", "anything")).toBe(false);
  });
});

// ============================================================================
// 9. Webhook Event Parsing
// ============================================================================

describe("9. Webhook Event Parsing", () => {
  it("should parse valid Shiprocket webhook payload", () => {
    const payload = JSON.stringify({
      shipment_id: 12345,
      order_id: 67890,
      awb: "SR123456789",
      status_id: 38,
      status: "In Transit",
    });
    const result = parseWebhookEvent(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("in_transit");
      expect(result.data.awb).toBe("SR123456789");
      expect(result.data.shipmentId).toBe(12345);
      expect(result.data.orderId).toBe(67890);
      expect(result.data.statusId).toBe(38);
    }
  });

  it("should reject invalid JSON", () => {
    const result = parseWebhookEvent("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid JSON payload");
    }
  });

  it("should return error for unknown status", () => {
    const payload = JSON.stringify({
      status_id: 99999,
      status: "Unknown Status",
    });
    const result = parseWebhookEvent(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNKNOWN_STATUS");
    }
  });

  it("should handle payload with string status", () => {
    const payload = JSON.stringify({
      status: "delivered",
    });
    const result = parseWebhookEvent(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("delivered");
    }
  });
});

// ============================================================================
// 10. Credential Non-Exposure
// ============================================================================

describe("10. Credential Non-Exposure", () => {
  it("loadShiprocketConfig should not log credentials", () => {
    // Spy on console methods
    const consoleSpy = vi.spyOn(console, "log");
    const errorSpy = vi.spyOn(console, "error");

    setEnv("COURIER_SHIPROCKET_API_EMAIL", "secret@email.com");
    setEnv("COURIER_SHIPROCKET_API_PASSWORD", "super-secret-password");

    try {
      const config = loadShiprocketConfig();
      // Verify credentials are not in any console output
      const allLogs = [
        ...consoleSpy.mock.calls.map((c) => JSON.stringify(c)),
        ...errorSpy.mock.calls.map((c) => JSON.stringify(c)),
      ].join(" ");
      expect(allLogs).not.toContain("super-secret-password");
      expect(allLogs).not.toContain("secret@email.com");
      // Verify config contains the values (for use by adapter)
      expect(config.apiEmail).toBe("secret@email.com");
      expect(config.apiPassword).toBe("super-secret-password");
    } finally {
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
      restoreAllEnv();
    }
  });

  it("authenticate should not throw credentials in error messages", async () => {
    const config: ShiprocketConfig = {
      apiEmail: "test@example.com",
      apiPassword: "secret-password-123",
      webhookSecret: "",
      dryRun: false,
      baseUrl: "https://httpstat.us/401",
    };

    try {
      await authenticate(config);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).not.toContain("secret-password-123");
      expect(message).not.toContain("test@example.com");
    }
  });
});
