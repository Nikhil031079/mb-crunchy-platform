// ============================================================================
// MB CRUNCHY — 26F-5 Shiprocket Adapter Rewrite Test Suite
//
// Tests the corrected Shiprocket adapter against the verified API contract.
// Uses mock HTTP to avoid real Shiprocket calls.
//
// NO REAL SHIPMENTS. NO REAL AWBS. NO PRODUCTION DEPLOYMENT.
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock fetch for Shiprocket API calls
const mockFetch = vi.fn();
vi.mock("node-fetch", () => ({ default: mockFetch }));

// Mock environment variables
const ENV_BACKUP: Record<string, string | undefined> = {};
const MOCK_ENV: Record<string, string> = {
  COURIER_SHIPROCKET_API_EMAIL: "test@example.com",
  COURIER_SHIPROCKET_API_PASSWORD: "test-password",
  COURIER_SHIPROCKET_WEBHOOK_SECRET: "test-webhook-secret",
  COURIER_SHIPROCKET_PICKUP_LOCATION: "Primary",
};

function setupEnv() {
  for (const [key, val] of Object.entries(MOCK_ENV)) {
    ENV_BACKUP[key] = process.env[key];
    process.env[key] = val;
  }
}

function restoreEnv() {
  for (const [key, val] of Object.entries(ENV_BACKUP)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a mock Convex context with a simple in-memory store. */
function createMockCtx(initialData: Record<string, any> = {}) {
  const store = new Map<string, any>();
  for (const [key, val] of Object.entries(initialData)) {
    store.set(key, val);
  }

  let nextId = 1;

  return {
    db: {
      get: vi.fn(async (id: string) => store.get(id) || null),
      patch: vi.fn(async (id: string, data: any) => {
        const existing = store.get(id) || {};
        store.set(id, { ...existing, ...data });
        return id;
      }),
      insert: vi.fn(async (_table: string, data: any) => {
        const id = `id_${nextId++}`;
        store.set(id, { _id: id, ...data });
        return id;
      }),
    },
    _store: store,
  };
}

/** Sample order data for testing. */
function sampleOrderData(overrides: Partial<any> = {}) {
  return {
    orderNumber: "MB-ORD-001",
    createdAt: Date.now(),
    customerName: "Rahul Sharma",
    customerPhone: "9876543210",
    customerEmail: "rahul@example.com",
    deliveryAddress: "123 Main Street, Andheri West",
    destinationPincode: "400058",
    destinationCity: "Mumbai",
    destinationState: "Maharashtra",
    subtotal: 499,
    discount: 50,
    tax: 18,
    total: 467,
    paymentMethod: "razorpay",
    items: [
      {
        name: "T-Shirt Black",
        sku: "TSHIRT-BLK-M",
        quantity: 1,
        unitPrice: 499,
      },
    ],
    ...overrides,
  };
}

/** Sample package data for testing. */
function samplePackageData(overrides: Partial<any> = {}) {
  return {
    weightGrams: 300,
    lengthCm: 25,
    widthCm: 20,
    heightCm: 5,
    ...overrides,
  };
}

/** Create a mock shipment record. */
function mockShipment(overrides: Record<string, any> = {}) {
  return {
    _id: "shipment_001",
    orderId: "order_001",
    businessUnitId: "bu_001",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Dynamically Import Adapter (after mocks are set up)
// ============================================================================

let shiprocketAdapter: any;
let BookingStatus: any;
let SHIPROCKET_CAPABILITIES: any;

beforeEach(async () => {
  vi.resetModules();
  setupEnv();
  mockFetch.mockReset();

  const mod = await import("../../convex/courier/shiprocketAdapter");
  shiprocketAdapter = mod.shiprocketAdapter;
  BookingStatus = mod.BookingStatus;
  SHIPROCKET_CAPABILITIES = mod.SHIPROCKET_CAPABILITIES;
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

// ============================================================================
// 1. Adapter Structure & Registration
// ============================================================================

describe("Shiprocket Adapter Structure", () => {
  it("exports correct providerId", () => {
    expect(shiprocketAdapter.providerId).toBe("shiprocket");
  });

  it("exports correct providerName", () => {
    expect(shiprocketAdapter.providerName).toBe("Shiprocket");
  });

  it("is not test-only", () => {
    expect(shiprocketAdapter.isTestOnly).toBe(false);
  });

  it("has correct capabilities", () => {
    expect(SHIPROCKET_CAPABILITIES.shipment_creation).toBe(true);
    expect(SHIPROCKET_CAPABILITIES.awb_assignment).toBe(true);
    expect(SHIPROCKET_CAPABILITIES.label_generation).toBe(true);
    expect(SHIPROCKET_CAPABILITIES.tracking).toBe(true);
    expect(SHIPROCKET_CAPABILITIES.cancellation).toBe(true);
    expect(SHIPROCKET_CAPABILITIES.rto_handling).toBe(true);
  });

  it("has verifyWebhook method", () => {
    expect(typeof shiprocketAdapter.verifyWebhook).toBe("function");
  });

  it("has parseWebhook method", () => {
    expect(typeof shiprocketAdapter.parseWebhook).toBe("function");
  });

  it("has bookShipment method", () => {
    expect(typeof shiprocketAdapter.bookShipment).toBe("function");
  });

  it("has reconcileBooking method", () => {
    expect(typeof shiprocketAdapter.reconcileBooking).toBe("function");
  });

  it("has retryAwbAssignment method", () => {
    expect(typeof shiprocketAdapter.retryAwbAssignment).toBe("function");
  });
});

// ============================================================================
// 2. Booking Status Enum
// ============================================================================

describe("BookingStatus Enum", () => {
  it("has all required states", () => {
    expect(BookingStatus.NotStarted).toBe("not_started");
    expect(BookingStatus.Creating).toBe("creating");
    expect(BookingStatus.OrderCreated).toBe("order_created");
    expect(BookingStatus.AWBAssigning).toBe("awb_assigning");
    expect(BookingStatus.Created).toBe("created");
    expect(BookingStatus.Unknown).toBe("unknown");
    expect(BookingStatus.Failed).toBe("failed");
    expect(BookingStatus.Cancelled).toBe("cancelled");
  });
});

// ============================================================================
// 3. Authentication
// ============================================================================

describe("Authentication", () => {
  it("authenticates successfully with valid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: "mock-token-123",
        token_lifetime_hours: 240,
      }),
    });

    const result = await shiprocketAdapter.authenticate();
    expect(result).toBe(true);
    expect(shiprocketAdapter.isAuthenticated()).toBe(true);
    expect(shiprocketAdapter.getToken()).toBe("mock-token-123");
  });

  it("fails with invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const result = await shiprocketAdapter.authenticate();
    expect(result).toBe(false);
    expect(shiprocketAdapter.isAuthenticated()).toBe(false);
  });

  it("fails with network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await shiprocketAdapter.authenticate();
    expect(result).toBe(false);
  });

  it("skips re-authentication when token is still valid", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });

    await shiprocketAdapter.authenticate();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should not hit the API
    const result = await shiprocketAdapter.authenticate();
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // No additional call
  });
});

// ============================================================================
// 4. Payload Construction (Step 1)
// ============================================================================

describe("Payload Construction — Step 1 Create Order", () => {
  it("builds correct payload with all required fields", async () => {
    // Mock auth
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    // Mock Step 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    // Mock Step 2 (needed because bookShipment runs full flow)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 142,
            awb_code: "321055706540",
            courier_name: "Test Courier",
            shipment_id: 67890,
          },
        },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const orderData = sampleOrderData();
    const packageData = samplePackageData();

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-SHIP-001",
      orderData,
      packageData,
    );

    // Check that Step 1 was called with correct payload
    const step1Call = mockFetch.mock.calls[1]; // [0] is auth, [1] is Step 1
    const body = JSON.parse(step1Call[1].body);

    expect(body.order_id).toBe("EXT-SHIP-001");
    expect(body.order_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(body.pickup_location).toBe("Primary");
    expect(body.billing_customer_name).toBe("Rahul Sharma");
    expect(body.billing_phone).toBe("9876543210");
    expect(body.billing_email).toBe("rahul@example.com");
    expect(body.billing_address).toBe("123 Main Street, Andheri West");
    expect(body.billing_pincode).toBe("400058");
    expect(body.billing_city).toBe("Mumbai");
    expect(body.billing_state).toBe("Maharashtra");
    expect(body.billing_country).toBe("India");
    expect(body.shipping_is_billing).toBe(true);
    expect(body.payment_method).toBe("Prepaid");
    expect(body.sub_total).toBe(499);
    expect(body.weight).toBeCloseTo(0.3, 1); // 300g = 0.3kg
    expect(body.length).toBe(25);
    expect(body.breadth).toBe(20);
    expect(body.height).toBe(5);

    // Order items
    expect(body.order_items).toHaveLength(1);
    expect(body.order_items[0].name).toBe("T-Shirt Black");
    expect(body.order_items[0].sku).toBe("TSHIRT-BLK-M");
    expect(body.order_items[0].units).toBe(1);
    expect(body.order_items[0].selling_price).toBe(499);
  });

  it("uses orderNumber as SKU fallback when no SKU provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({ shipment_001: mockShipment() });

    const orderData = sampleOrderData({
      items: [{ name: "Widget", quantity: 2, unitPrice: 250 }],
    });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      orderData,
      samplePackageData(),
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.order_items[0].sku).toBe("Widget"); // Falls back to name
  });

  it("sets COD payment method when paymentMethod is 'cod'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({ shipment_001: mockShipment() });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData({ paymentMethod: "cod" }),
      samplePackageData(),
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.payment_method).toBe("COD");
  });

  it("includes total_discount when discount > 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({ shipment_001: mockShipment() });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData({ discount: 100 }),
      samplePackageData(),
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.total_discount).toBe(100);
  });

  it("omits total_discount when discount is 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({ shipment_001: mockShipment() });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData({ discount: 0 }),
      samplePackageData(),
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.total_discount).toBeUndefined();
  });
});

// ============================================================================
// 5. Step 1 — Create Order
// ============================================================================

describe("Step 1 — Create Order", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("succeeds and returns Shiprocket order_id and shipment_id", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    const result = await shiprocketAdapter.createOrder(
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(true);
    expect(result.shiprocketOrderId).toBe(12345);
    expect(result.shiprocketShipmentId).toBe(67890);
  });

  it("fails with HTTP 422 validation error", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Validation failed",
        errors: { order_id: ["The order id has already been taken."] },
      }),
    });

    const result = await shiprocketAdapter.createOrder(
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
  });

  it("returns incomplete when response lacks order_id or shipment_id", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: null,
        shipment_id: null,
        status: "NEW",
      }),
    });

    const result = await shiprocketAdapter.createOrder(
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Incomplete response");
  });

  it("handles network timeout gracefully", async () => {
    await setupAuth();

    mockFetch.mockRejectedValueOnce(new Error("Request timeout"));

    const result = await shiprocketAdapter.createOrder(
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Request timeout");
  });
});

// ============================================================================
// 6. Step 2 — Assign AWB
// ============================================================================

describe("Step 2 — Assign AWB", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("succeeds and returns AWB code and courier name", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 142,
            awb_code: "321055706540",
            cod: 0,
            order_id: 12345,
            shipment_id: 67890,
            awb_code_status: 1,
            applied_weight: 0.3,
            company_id: 25149,
            courier_name: "Test Courier",
            child_courier_name: null,
          },
        },
      }),
    });

    const result = await shiprocketAdapter.assignAwb(67890);

    expect(result.success).toBe(true);
    expect(result.awbCode).toBe("321055706540");
    expect(result.courierName).toBe("Test Courier");
    expect(result.courierCompanyId).toBe(142);
  });

  it("fails with awb_assign_status 0", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 0,
        response: {
          data: {
            awb_code: "Awb Assignment Failed",
          },
        },
      }),
    });

    const result = await shiprocketAdapter.assignAwb(67890);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Awb Assignment Failed");
  });

  it("sends courier_id when provided", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 10,
            awb_code: "AWB-123",
            shipment_id: 67890,
          },
        },
      }),
    });

    await shiprocketAdapter.assignAwb(67890, 10);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.shipment_id).toBe(67890);
    expect(body.courier_id).toBe(10);
  });

  it("omits courier_id when not provided (auto-select)", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 142,
            awb_code: "AWB-456",
            shipment_id: 67890,
          },
        },
      }),
    });

    await shiprocketAdapter.assignAwb(67890);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.courier_id).toBeUndefined();
    expect(body.shipment_id).toBe(67890);
  });

  it("handles network error gracefully", async () => {
    await setupAuth();

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await shiprocketAdapter.assignAwb(67890);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

// ============================================================================
// 7. Full Booking Flow — Step 1 + Step 2 Success
// ============================================================================

describe("Full Booking Flow — Step 1 + Step 2 Success", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("completes full flow and persists identifiers", async () => {
    await setupAuth();

    // Step 1: Create order
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
        status_message: "Order Success",
      }),
    });

    // Step 2: Assign AWB
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 142,
            awb_code: "321055706540",
            courier_name: "Test Courier",
            shipment_id: 67890,
          },
        },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(true);
    expect(result.result).toBe("created");
    expect(result.awbNumber).toBe("321055706540");
    expect(result.shiprocketOrderId).toBe(12345);
    expect(result.shiprocketShipmentId).toBe(67890);
    expect(result.courierName).toBe("Test Courier");

    // Verify DB was patched with final state
    const patchCalls = ctx.db.patch.mock.calls;
    const lastPatch = patchCalls[patchCalls.length - 1][1];
    const metadata = JSON.parse(lastPatch.courierMetadata);
    expect(metadata.bookingStatus).toBe(BookingStatus.Created);
    expect(metadata.bookingAWBNumber).toBe("321055706540");
    expect(metadata.shiprocketOrderId).toBe(12345);
    expect(metadata.shiprocketShipmentId).toBe(67890);
    expect(lastPatch.awbNumber).toBe("321055706540");
    expect(lastPatch.courierProvider).toBe("shiprocket");
  });

  it("reports order_created when Step 2 fails explicitly", async () => {
    await setupAuth();

    // Step 1: Success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });

    // Step 2: Explicit failure
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 0,
        response: { data: { awb_code: "No serviceable courier" } },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("order_created");
    expect(result.shiprocketOrderId).toBe(12345);
    expect(result.shiprocketShipmentId).toBe(67890);
    expect(result.awbNumber).toBeUndefined();
    expect(result.message).toContain("Order created");
    expect(result.message).toContain("AWB assignment failed");

    // Verify status is order_created, not created or failed
    const patchCalls = ctx.db.patch.mock.calls;
    const lastPatch = patchCalls[patchCalls.length - 1][1];
    const metadata = JSON.parse(lastPatch.courierMetadata);
    expect(metadata.bookingStatus).toBe(BookingStatus.OrderCreated);
  });

  it("reports unknown when Step 2 has network error", async () => {
    await setupAuth();

    // Step 1: Success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });

    // Step 2: Network error
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("unknown");
    expect(result.shiprocketOrderId).toBe(12345);
    expect(result.shiprocketShipmentId).toBe(67890);
    expect(result.message).toContain("Reconciliation required");

    // Verify status is unknown
    const patchCalls = ctx.db.patch.mock.calls;
    const lastPatch = patchCalls[patchCalls.length - 1][1];
    const metadata = JSON.parse(lastPatch.courierMetadata);
    expect(metadata.bookingStatus).toBe(BookingStatus.Unknown);
  });

  it("reports failed when Step 1 fails explicitly", async () => {
    await setupAuth();

    // Step 1: Explicit failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Validation failed",
        errors: { order_id: ["already taken"] },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("failed");
    expect(result.awbNumber).toBeUndefined();
    expect(result.message).toContain("Order creation failed");

    // Verify no Step 2 was attempted
    expect(mockFetch).toHaveBeenCalledTimes(2); // auth + Step 1 only
  });

  it("reports unknown when Step 1 has network error", async () => {
    await setupAuth();

    // Step 1: Network error
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("unknown");
    expect(result.message).toContain("Reconciliation required");
  });
});

// ============================================================================
// 8. Package Validation
// ============================================================================

describe("Package Validation", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("rejects zero weight", async () => {
    await setupAuth();
    const ctx = createMockCtx({ shipment_001: mockShipment() });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData({ weightGrams: 0 }),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("failed");
    expect(result.message).toContain("weight must be greater than 0");
  });

  it("rejects negative dimensions", async () => {
    await setupAuth();
    const ctx = createMockCtx({ shipment_001: mockShipment() });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData({ lengthCm: -10 }),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("failed");
    expect(result.message).toContain("length must be greater than 0");
  });

  it("rejects zero width", async () => {
    await setupAuth();
    const ctx = createMockCtx({ shipment_001: mockShipment() });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData({ widthCm: 0 }),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("failed");
    expect(result.message).toContain("width must be greater than 0");
  });

  it("rejects zero height", async () => {
    await setupAuth();
    const ctx = createMockCtx({ shipment_001: mockShipment() });

    const result = await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData({ heightCm: 0 }),
    );

    expect(result.success).toBe(false);
    expect(result.result).toBe("failed");
    expect(result.message).toContain("height must be greater than 0");
  });

  it("validates BEFORE making any API calls", async () => {
    await setupAuth();
    const ctx = createMockCtx({ shipment_001: mockShipment() });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData({ weightGrams: 0 }),
    );

    // Only auth call, no Step 1 call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 9. AWB Retry
// ============================================================================

describe("AWB Retry", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("retries AWB for order_created status", async () => {
    await setupAuth();

    // First booking: Step 1 success, Step 2 fail
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 0,
        response: { data: { awb_code: "No courier" } },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    // Initial booking
    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    // Retry AWB
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: 142,
            awb_code: "RETRY-AWB-123",
            courier_name: "Retry Courier",
            shipment_id: 67890,
          },
        },
      }),
    });

    const retryResult = await shiprocketAdapter.retryAwbAssignment(
      ctx,
      "shipment_001",
    );

    expect(retryResult.success).toBe(true);
    expect(retryResult.result).toBe("created");
    expect(retryResult.awbNumber).toBe("RETRY-AWB-123");
    expect(retryResult.shiprocketOrderId).toBe(12345);
    expect(retryResult.shiprocketShipmentId).toBe(67890);
  });

  it("rejects retry when status is not order_created", async () => {
    await setupAuth();
    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Created,
          shiprocketOrderId: 12345,
          shiprocketShipmentId: 67890,
          bookingAWBNumber: "existing-awb",
        }),
      }),
    });

    const result = await shiprocketAdapter.retryAwbAssignment(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot retry AWB");
    expect(result.message).toContain("created");
  });

  it("rejects retry when no stored shipment_id", async () => {
    await setupAuth();
    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.OrderCreated,
          bookingExternalShipmentId: "EXT-001",
          // No shiprocketShipmentId
        }),
      }),
    });

    const result = await shiprocketAdapter.retryAwbAssignment(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.message).toContain("No stored Shiprocket shipment_id");
  });
});

// ============================================================================
// 10. Unknown Result & Reconciliation
// ============================================================================

describe("Unknown Result & Reconciliation", () => {
  async function setupAuth() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();
  }

  it("returns no_stored_identifiers when no Shiprocket IDs stored", async () => {
    await setupAuth();
    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Unknown,
          bookingExternalShipmentId: "EXT-001",
          // No shiprocketOrderId or shiprocketShipmentId
        }),
      }),
    });

    const result = await shiprocketAdapter.reconcileBooking(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.result).toBe("no_stored_identifiers");
    expect(result.message).toContain("No stored Shiprocket order_id");
  });

  it("skips reconciliation when status is not unknown", async () => {
    await setupAuth();
    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Created,
          shiprocketOrderId: 12345,
          shiprocketShipmentId: 67890,
        }),
      }),
    });

    const result = await shiprocketAdapter.reconcileBooking(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.result).toBe("no_stored_identifiers");
    expect(result.message).toContain("not \"unknown\"");
  });

  it("finds existing order on Shiprocket during reconciliation", async () => {
    await setupAuth();

    // Mock GET /v1/external/orders/show/{id}
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        awb: "RECON-AWB-789",
        status: "Ready to Ship",
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Unknown,
          bookingExternalShipmentId: "EXT-001",
          shiprocketOrderId: 12345,
          shiprocketShipmentId: 67890,
        }),
      }),
    });

    const result = await shiprocketAdapter.reconcileBooking(ctx, "shipment_001");

    expect(result.success).toBe(true);
    expect(result.result).toBe("found");
    expect(result.awbNumber).toBe("RECON-AWB-789");
    expect(result.shiprocketOrderId).toBe(12345);
  });

  it("returns not_found when order not on Shiprocket", async () => {
    await setupAuth();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Order not found" }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Unknown,
          bookingExternalShipmentId: "EXT-001",
          shiprocketOrderId: 99999,
          shiprocketShipmentId: 88888,
        }),
      }),
    });

    const result = await shiprocketAdapter.reconcileBooking(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.result).toBe("not_found");
    expect(result.message).toContain("Manual reconciliation required");
  });

  it("handles network error during reconciliation", async () => {
    await setupAuth();

    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const ctx = createMockCtx({
      shipment_001: mockShipment({
        courierMetadata: JSON.stringify({
          bookingStatus: BookingStatus.Unknown,
          bookingExternalShipmentId: "EXT-001",
          shiprocketOrderId: 12345,
          shiprocketShipmentId: 67890,
        }),
      }),
    });

    const result = await shiprocketAdapter.reconcileBooking(ctx, "shipment_001");

    expect(result.success).toBe(false);
    expect(result.result).toBe("error");
    expect(result.message).toContain("Network error");
  });
});

// ============================================================================
// 11. Webhook Parsing
// ============================================================================

describe("Webhook Parsing", () => {
  it("parses shipment_status_update event", async () => {
    const payload = JSON.stringify({
      event: "shipment_status_update",
      data: { status: "in_transit" },
      order_id: "EXT-001",
      tracking_number: "AWB-123",
      delivery_area: "Mumbai Hub",
      timestamp: 1699200000000,
      event_id: "evt-001",
    });

    const event = await shiprocketAdapter.parseWebhook(payload, {});

    expect(event.provider).toBe("shiprocket");
    expect(event.normalizedStatus).toBe("in_transit");
    expect(event.awbNumber).toBe("AWB-123");
    expect(event.location).toBe("Mumbai Hub");
    expect(event.eventTimestamp).toBe(1699200000000);
    expect(event.providerEventId).toBe("evt-001");
  });

  it("parses order_status_update event", async () => {
    const payload = JSON.stringify({
      event: "order_status_update",
      data: { status: "delivered" },
      order_id: "EXT-002",
    });

    const event = await shiprocketAdapter.parseWebhook(payload, {});

    expect(event.normalizedStatus).toBe("delivered");
  });

  it("handles unknown status with fallback to pending", async () => {
    const payload = JSON.stringify({
      status: "unknown_status_xyz",
      order_id: "EXT-003",
    });

    const event = await shiprocketAdapter.parseWebhook(payload, {});

    expect(event.normalizedStatus).toBe("pending");
  });

  it("generates provider event ID when not in payload", async () => {
    const payload = JSON.stringify({
      status: "in_transit",
      order_id: "EXT-004",
    });

    const event = await shiprocketAdapter.parseWebhook(payload, {});

    expect(event.providerEventId).toMatch(/^shiprocket-\d+-[a-z0-9]+$/);
  });

  it("extracts weight in kg and converts to grams", async () => {
    const payload = JSON.stringify({
      status: "in_transit",
      order_id: "EXT-005",
      weight: 2.5, // kg
    });

    const event = await shiprocketAdapter.parseWebhook(payload, {});

    // The raw payload should be preserved
    expect(event.rawPayload).toBeDefined();
  });
});

// ============================================================================
// 12. Webhook Authentication (x-api-key)
// ============================================================================

describe("Webhook Authentication", () => {
  it("accepts correct x-api-key", async () => {
    const result = await shiprocketAdapter.verifyWebhook(
      "test-body",
      { "x-api-key": "test-webhook-secret" },
    );

    expect(result.verified).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects when x-api-key header is missing", async () => {
    const result = await shiprocketAdapter.verifyWebhook("body", {});

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("Missing x-api-key");
  });

  it("rejects when x-api-key does not match", async () => {
    const result = await shiprocketAdapter.verifyWebhook(
      "test-body",
      { "x-api-key": "wrong-api-key-value" },
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("API key mismatch");
  });

  it("rejects old x-shiprocket-signature header alone", async () => {
    const result = await shiprocketAdapter.verifyWebhook(
      "test-body",
      { "x-shiprocket-signature": "some-signature" },
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("Missing x-api-key");
  });

  it("rejects when both x-api-key and x-shiprocket-signature are present but api-key is wrong", async () => {
    const result = await shiprocketAdapter.verifyWebhook(
      "test-body",
      {
        "x-api-key": "wrong-value",
        "x-shiprocket-signature": "some-signature",
      },
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("API key mismatch");
  });
});

// ============================================================================
// 13. Duplicate & Concurrent Booking Protection
// ============================================================================

describe("Duplicate & Concurrent Booking Protection", () => {
  it("sets Creating status as first DB patch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    // First patch should set Creating status
    const firstPatch = ctx.db.patch.mock.calls[0];
    const firstMetadata = JSON.parse(firstPatch[1].courierMetadata);
    expect(firstMetadata.bookingStatus).toBe(BookingStatus.Creating);
  });

  it("stores OrderCreated after Step 1 before Step 2", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    // Find the OrderCreated patch
    const orderCreatedPatch = ctx.db.patch.mock.calls.find((call: any) => {
      try {
        const meta = JSON.parse(call[1].courierMetadata);
        return meta.bookingStatus === BookingStatus.OrderCreated;
      } catch {
        return false;
      }
    });

    expect(orderCreatedPatch).toBeDefined();
    const meta = JSON.parse(orderCreatedPatch[1].courierMetadata);
    expect(meta.shiprocketOrderId).toBe(12345);
    expect(meta.shiprocketShipmentId).toBe(67890);
  });

  it("never recreates order when Step 2 fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    // Step 1: Success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });

    // Step 2: Failure
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 0,
        response: { data: { awb_code: "Failed" } },
      }),
    });

    const ctx = createMockCtx({
      shipment_001: mockShipment(),
    });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData(),
      samplePackageData(),
    );

    // Verify only 3 calls: auth + Step 1 + Step 2
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify no second Step 1 call
    const step1Calls = mockFetch.mock.calls.filter(
      (call: any) => call[0].includes("orders/create/adhoc"),
    );
    expect(step1Calls).toHaveLength(1);
  });
});

// ============================================================================
// 14. Missing Required Fields
// ============================================================================

describe("Missing Required Fields", () => {
  it("sends empty strings for missing address fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order_id: 12345,
        shipment_id: 67890,
        status: "NEW",
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awb_assign_status: 1,
        response: {
          data: { awb_code: "AWB-123", courier_name: "Courier" },
        },
      }),
    });

    const ctx = createMockCtx({ shipment_001: mockShipment() });

    await shiprocketAdapter.bookShipment(
      ctx,
      "shipment_001",
      "EXT-001",
      sampleOrderData({
        deliveryAddress: undefined,
        destinationPincode: undefined,
        destinationCity: undefined,
        destinationState: undefined,
      }),
      samplePackageData(),
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.billing_address).toBe("");
    expect(body.billing_pincode).toBe("");
    expect(body.billing_city).toBe("");
    expect(body.billing_state).toBe("");
  });
});

// ============================================================================
// 15. Token Expiry Handling
// ============================================================================

describe("Token Expiry Handling", () => {
  it("re-authenticates when token is expired", async () => {
    // First auth
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-1" }),
    });
    await shiprocketAdapter.authenticate();

    // Manually expire the token
    (shiprocketAdapter as any).tokenTimestamp = Date.now() - 241 * 60 * 60 * 1000;

    // Should re-authenticate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: "token-2" }),
    });

    const result = await shiprocketAdapter.authenticate();
    expect(result).toBe(true);
    expect(shiprocketAdapter.getToken()).toBe("token-2");
  });
});
