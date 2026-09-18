// ============================================================================
// MB CRUNCHY — Phase 28-2 P2 Remediation Regression Tests
//
// Covers the P2 findings fixed in this phase plus the documented safe-to-defer
// operational findings. All tests are pure-logic mirrors of the server-side
// guards (same pattern as 26f8_1_defect_fixes.test.ts): they do NOT connect
// to a live Convex backend, place real orders, or perform real payments.
//
// Fixed (must hold):
//   SEC-007  collections read ownership check
//   SEC-008  customers.update self-service status restriction
//   SEC-011  seedPolicies admin-only gate
//   SEC-013  review businessUnitId match validation
//   CONFIG-001 warn when error-reporting env vars are missing
// Documented (invariants that must keep holding):
//   OPS-002  finalizePaidOrder idempotency + cron-race recovery
//   OPS-004  client phone validation agrees with server normalization
// ============================================================================

import { describe, it, expect } from "vitest";

import {
  normalizeIndianPhone,
  validateIndianPhone,
} from "../src/utils/phone";

// ============================================================================
// SEC-007 — Collections read ownership check
// Mirror of the guard added to getByCustomer / getByCustomerAndType /
// bulkCheck in convex/collections.ts (same guard the mutations already had).
// ============================================================================

function checkCollectionReadAccess(
  identitySubject: string | null,
  customerAuthUserId: string | null,
  requestedCustomerId: string,
  ownCustomerId: string | null,
): void {
  if (!identitySubject) throw new Error("Authentication required");
  if (!ownCustomerId || ownCustomerId !== requestedCustomerId)
    throw new Error("Unauthorized");
  void customerAuthUserId;
}

describe("SEC-007 collections read ownership", () => {
  it("rejects unauthenticated reads", () => {
    expect(() => checkCollectionReadAccess(null, null, "c1", null)).toThrow(
      "Authentication required",
    );
  });

  it("rejects reads of another customer's collections (IDOR)", () => {
    expect(() => checkCollectionReadAccess("subA", "subA", "cOTHER", "cA")).toThrow(
      "Unauthorized",
    );
  });

  it("allows a customer to read their own collections", () => {
    expect(() =>
      checkCollectionReadAccess("subA", "subA", "cA", "cA"),
    ).not.toThrow();
  });
});

// ============================================================================
// SEC-008 — customers.update self-service status restriction
// Mirror of the guard added in convex/customers.ts: the self-service path
// (no sessionToken) must reject any status change; the admin path allows it.
// ============================================================================

function buildCustomerUpdatePatch(args: {
  sessionToken?: string;
  name?: string;
  status?: "active" | "inactive" | "archived";
}): Record<string, unknown> {
  const { sessionToken: _sessionToken, ...fields } = args;
  void _sessionToken;
  if (!args.sessionToken && args.status !== undefined) {
    throw new Error("Only admins can change account status");
  }
  const patch: Record<string, unknown> = { ...fields, updatedAt: 0 };
  if (!args.sessionToken) delete patch.status;
  return patch;
}

describe("SEC-008 customer self-update status restriction", () => {
  it("rejects a customer setting their own status", () => {
    expect(() =>
      buildCustomerUpdatePatch({ name: "A", status: "archived" }),
    ).toThrow("Only admins can change account status");
  });

  it("allows a customer to update name without touching status", () => {
    const patch = buildCustomerUpdatePatch({ name: "A" });
    expect(patch.name).toBe("A");
    expect("status" in patch).toBe(false);
  });

  it("allows the admin path to set status", () => {
    const patch = buildCustomerUpdatePatch({
      sessionToken: "admin-token",
      status: "inactive",
    });
    expect(patch.status).toBe("inactive");
  });
});

// ============================================================================
// SEC-011 — seedPolicies admin-only gate
// The mutation now requires a sessionToken validated by requireAdminSession.
// ============================================================================

function gateSeedPolicies(sessionToken: string | undefined): void {
  if (!sessionToken) throw new Error("Invalid or expired session");
}

describe("SEC-011 seedPolicies auth gate", () => {
  it("rejects anonymous seeding", () => {
    expect(() => gateSeedPolicies(undefined)).toThrow();
  });

  it("rejects empty session tokens", () => {
    expect(() => gateSeedPolicies("")).toThrow();
  });

  it("accepts a provided session token for server-side verification", () => {
    expect(() => gateSeedPolicies("admin-session-token")).not.toThrow();
  });
});

// ============================================================================
// SEC-013 — review businessUnitId match validation
// Mirror of the check added to reviews.create in convex/reviews.ts.
// ============================================================================

function validateReviewBusinessUnit(
  catalogItem: { businessUnitId: string; deletedAt?: number } | null,
  requestedBusinessUnitId: string,
): void {
  if (!catalogItem || catalogItem.deletedAt) {
    throw new Error("Product not found");
  }
  if (catalogItem.businessUnitId !== requestedBusinessUnitId) {
    throw new Error("This product does not belong to the selected store");
  }
}

describe("SEC-013 review BU validation", () => {
  it("rejects reviews for missing products", () => {
    expect(() => validateReviewBusinessUnit(null, "bu1")).toThrow(
      "Product not found",
    );
  });

  it("rejects reviews for soft-deleted products", () => {
    expect(() =>
      validateReviewBusinessUnit({ businessUnitId: "bu1", deletedAt: 1 }, "bu1"),
    ).toThrow("Product not found");
  });

  it("rejects mismatched business units", () => {
    expect(() =>
      validateReviewBusinessUnit({ businessUnitId: "buKitchen" }, "buMart"),
    ).toThrow("does not belong to the selected store");
  });

  it("accepts matching business units", () => {
    expect(() =>
      validateReviewBusinessUnit({ businessUnitId: "bu1" }, "bu1"),
    ).not.toThrow();
  });
});

// ============================================================================
// CONFIG-001 — error-reporting misconfiguration must be loud, not silent
// reportErrorToVly warns when VITE_VLY_APP_ID / VITE_VLY_MONITORING_URL are
// missing instead of silently disabling observability.
// ============================================================================

function shouldWarnAboutMissingObservability(
  appId: string | undefined,
  monitoringUrl: string | undefined,
): boolean {
  return !appId || !monitoringUrl ? true : false;
}

describe("CONFIG-001 observability misconfiguration warning", () => {
  it("warns when both env vars are missing", () => {
    expect(shouldWarnAboutMissingObservability(undefined, undefined)).toBe(true);
  });

  it("warns when only one env var is set", () => {
    expect(shouldWarnAboutMissingObservability("app", undefined)).toBe(true);
    expect(shouldWarnAboutMissingObservability(undefined, "url")).toBe(true);
  });

  it("stays silent when both env vars are set", () => {
    expect(shouldWarnAboutMissingObservability("app", "url")).toBe(false);
  });
});

// ============================================================================
// OPS-002 — finalizePaidOrder idempotency + cron-race recovery
// Mirror of the guards in convex/orders.ts finalizePaidOrder. These invariants
// are what make the 15-min cron vs webhook race safe: no duplicate orders,
// no incorrect payment state, no lost payments.
// ============================================================================

type OrderState = {
  status: string;
  paymentStatus: string;
  lastActivityAction?: string;
  lastActivityActor?: string;
};

function finalizePaidOrderDecision(order: OrderState): {
  noop: boolean;
  newStatus?: string;
  newPaymentStatus?: string;
} {
  // Idempotent: already paid or refunded — do nothing (no duplicates).
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return { noop: true };
  }
  // Normal path: awaiting_payment -> pending.
  if (order.status === "awaiting_payment") {
    return { noop: false, newStatus: "pending", newPaymentStatus: "paid" };
  }
  // Race recovery: system-cancelled (cron) orders are restored to pending
  // because the Razorpay payment is authoritative. Admin cancellations stand.
  if (order.status === "cancelled") {
    const wasSystemCancelled =
      order.lastActivityAction === "cancelled" &&
      order.lastActivityActor === "system";
    return {
      noop: false,
      ...(wasSystemCancelled ? { newStatus: "pending" } : {}),
      newPaymentStatus: "paid",
    };
  }
  return { noop: false, newPaymentStatus: "paid" };
}

describe("OPS-002 payment/cron race invariants", () => {
  it("is a no-op when already paid (duplicate webhook safe)", () => {
    expect(
      finalizePaidOrderDecision({ status: "pending", paymentStatus: "paid" }),
    ).toEqual({ noop: true });
  });

  it("is a no-op when refunded (no resurrection)", () => {
    expect(
      finalizePaidOrderDecision({ status: "refunded", paymentStatus: "refunded" }),
    ).toEqual({ noop: true });
  });

  it("moves awaiting_payment to pending on payment", () => {
    expect(
      finalizePaidOrderDecision({ status: "awaiting_payment", paymentStatus: "pending" }),
    ).toEqual({ noop: false, newStatus: "pending", newPaymentStatus: "paid" });
  });

  it("restores system-cancelled (cron race) orders to pending", () => {
    expect(
      finalizePaidOrderDecision({
        status: "cancelled",
        paymentStatus: "pending",
        lastActivityAction: "cancelled",
        lastActivityActor: "system",
      }),
    ).toEqual({ noop: false, newStatus: "pending", newPaymentStatus: "paid" });
  });

  it("keeps admin-cancelled orders cancelled while recording payment", () => {
    const decision = finalizePaidOrderDecision({
      status: "cancelled",
      paymentStatus: "pending",
      lastActivityAction: "cancelled",
      lastActivityActor: "admin",
    });
    expect(decision.noop).toBe(false);
    expect(decision.newStatus).toBeUndefined();
    expect(decision.newPaymentStatus).toBe("paid");
  });
});

// ============================================================================
// OPS-004 — client phone validation agrees with server normalization
// CheckoutPage.validate() blocks submit unless validateIndianPhone() passes,
// and validateIndianPhone(x) is defined as normalizeIndianPhone(x) !== null.
// Therefore the `?? raw.trim()` fallback in handleSubmit is unreachable with
// invalid input and the server's requireIndianPhone never sees a value the
// client accepted but the server rejects. Uses the REAL frontend helpers.
// ============================================================================

describe("OPS-004 phone validation agreement", () => {
  const validPhones = ["9876543210", "+919876543210", "919876543210", "09876543210"];
  const invalidPhones = ["12345", "1234567890", "9999999999", "abcdefghij", ""];

  it.each(validPhones)("accepts valid phone %s", (phone) => {
    expect(validateIndianPhone(phone)).toBe(true);
    expect(normalizeIndianPhone(phone)).not.toBeNull();
  });

  it.each(invalidPhones)("rejects invalid phone %s", (phone) => {
    expect(validateIndianPhone(phone)).toBe(false);
    expect(normalizeIndianPhone(phone)).toBeNull();
  });

  it("validate() and normalize() never disagree", () => {
    const samples = [...validPhones, ...invalidPhones, "  9876543210  ", "+91 98765 43210"];
    for (const phone of samples) {
      expect(validateIndianPhone(phone)).toBe(
        normalizeIndianPhone(phone) !== null,
      );
    }
  });
});
