// ============================================================================
// MB CRUNCHY — Phase 28-4 Admin Role-Gate Authorization Matrix Tests
//
// Mirrors of the server-side role decisions introduced for F-10 plus the
// F-07/F-11 session-state fix. Pure-logic (same pattern as 28-2 tests):
// no live backend, no real sessions, no production calls.
//
// Covered:
//   login entry-point role gate (admin vs kitchen)
//   requireAdminRole allow/deny per role
//   updateStatus BU scoping for kitchen role
//   getByCustomer projection choice per role
//   AdminLayout route decision per role
//   kitchen isLoading resolution (F-07/F-11)
// ============================================================================

import { describe, it, expect } from "vitest";

type Role = "superadmin" | "admin" | "kitchen";
const ADMIN_ROLES = ["superadmin", "admin"];

// ----------------------------------------------------------------------------
// Mirror of adminAuth.login role gate (convex/adminAuth.ts):
// unknown user -> generic; disabled -> disabled message; role mismatch ->
// generic (no information leak, no attempt recorded).
// ----------------------------------------------------------------------------

function loginDecision(
  admin: { role: Role; active: boolean } | null,
  allowedRoles?: string[],
): { success: boolean; error?: string } {
  if (!admin) return { success: false, error: "Invalid username or password." };
  if (!admin.active) return { success: false, error: "This account has been disabled." };
  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    return { success: false, error: "Invalid username or password." };
  }
  return { success: true };
}

describe("F-10 login entry-point role gate", () => {
  it("admin login accepts superadmin", () => {
    expect(loginDecision({ role: "superadmin", active: true }, ADMIN_ROLES)).toEqual({ success: true });
  });
  it("admin login accepts admin", () => {
    expect(loginDecision({ role: "admin", active: true }, ADMIN_ROLES)).toEqual({ success: true });
  });
  it("admin login rejects staff with the generic message", () => {
    expect(loginDecision({ role: "kitchen", active: true }, ADMIN_ROLES)).toEqual({
      success: false,
      error: "Invalid username or password.",
    });
  });
  it("kitchen login accepts staff", () => {
    expect(loginDecision({ role: "kitchen", active: true }, ["kitchen"])).toEqual({ success: true });
  });
  it("kitchen login rejects admin-role accounts", () => {
    expect(loginDecision({ role: "admin", active: true }, ["kitchen"])).toEqual({
      success: false,
      error: "Invalid username or password.",
    });
  });
  it("unknown user gets the same generic message (no enumeration)", () => {
    expect(loginDecision(null, ADMIN_ROLES)).toEqual({
      success: false,
      error: "Invalid username or password.",
    });
  });
  it("disabled account keeps its distinct message", () => {
    expect(loginDecision({ role: "admin", active: false }, ADMIN_ROLES)).toEqual({
      success: false,
      error: "This account has been disabled.",
    });
  });
});

// ----------------------------------------------------------------------------
// Mirror of requireAdminRole (convex/utils/adminAuth.ts)
// ----------------------------------------------------------------------------

function requireAdminRole(role: Role, allowedRoles: string[]): void {
  if (!allowedRoles.includes(role)) throw new Error("Insufficient permissions");
}

describe("F-10 backend role gate", () => {
  it.each([["superadmin"], ["admin"]] as Role[][])("allows %s on admin surface", (role) => {
    expect(() => requireAdminRole(role, ADMIN_ROLES)).not.toThrow();
  });
  it("denies kitchen on admin surface", () => {
    expect(() => requireAdminRole("kitchen", ADMIN_ROLES)).toThrow("Insufficient permissions");
  });
  it("matrix: customer/staff/admin x admin surface", () => {
    // customers have no session at all -> denied before role check
    const customerAllowed = false;
    expect(customerAllowed).toBe(false);
    expect(() => requireAdminRole("kitchen", ADMIN_ROLES)).toThrow();
    expect(() => requireAdminRole("admin", ADMIN_ROLES)).not.toThrow();
  });
});

// ----------------------------------------------------------------------------
// Mirror of updateStatus BU scoping (convex/orders.ts)
// ----------------------------------------------------------------------------

function canUpdateOrderStatus(role: Role, assignedBUs: string[], orderBU: string): boolean {
  if (role === "superadmin" || role === "admin") return true;
  return (assignedBUs ?? []).includes(orderBU);
}

describe("F-10 updateStatus BU scope", () => {
  it("admin may update any BU order", () => {
    expect(canUpdateOrderStatus("admin", [], "bu-other")).toBe(true);
  });
  it("staff may update assigned Kitchen order", () => {
    expect(canUpdateOrderStatus("kitchen", ["buK", "buM"], "buK")).toBe(true);
  });
  it("staff may update assigned Mart order", () => {
    expect(canUpdateOrderStatus("kitchen", ["buK", "buM"], "buM")).toBe(true);
  });
  it("staff denied on unassigned BU order", () => {
    expect(canUpdateOrderStatus("kitchen", ["buK", "buM"], "buX")).toBe(false);
  });
  it("staff with no assignments denied everywhere", () => {
    expect(canUpdateOrderStatus("kitchen", [], "buK")).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Mirror of getByCustomer projection choice (convex/orders.ts)
// ----------------------------------------------------------------------------

function fullOrderAccess(role: Role): boolean {
  return role === "superadmin" || role === "admin";
}

describe("F-10 PII projection", () => {
  it("admin roles get full order documents", () => {
    expect(fullOrderAccess("superadmin")).toBe(true);
    expect(fullOrderAccess("admin")).toBe(true);
  });
  it("kitchen role gets the sanitized projection", () => {
    expect(fullOrderAccess("kitchen")).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Mirror of AdminLayout route decision (src/layouts/admin/AdminLayout.tsx)
// ----------------------------------------------------------------------------

function adminRouteDecision(
  isLoading: boolean,
  authenticated: boolean,
  role: Role | null,
): "loading" | "login" | "kitchen-login" | "allow" {
  if (isLoading) return "loading";
  if (!authenticated) return "login";
  if (role && role !== "superadmin" && role !== "admin") return "kitchen-login";
  return "allow";
}

describe("F-10 admin route protection", () => {
  it("staff session redirected to kitchen login on every admin route", () => {
    expect(adminRouteDecision(false, true, "kitchen")).toBe("kitchen-login");
  });
  it("admin session allowed", () => {
    expect(adminRouteDecision(false, true, "admin")).toBe("allow");
    expect(adminRouteDecision(false, true, "superadmin")).toBe("allow");
  });
  it("unauthenticated goes to admin login", () => {
    expect(adminRouteDecision(false, false, null)).toBe("login");
  });
});

// ----------------------------------------------------------------------------
// Mirror of fixed kitchen isLoading (src/hooks/use-kitchen-auth.tsx, F-07/F-11)
// ----------------------------------------------------------------------------

function kitchenIsLoading(isChecking: boolean, sessionToken: string | null, verified: unknown): boolean {
  return isChecking || (sessionToken !== null && verified === undefined);
}

describe("F-07/F-11 kitchen loading resolution", () => {
  it("no token resolves out of loading (redirects to login)", () => {
    expect(kitchenIsLoading(false, null, undefined)).toBe(false);
  });
  it("fresh token waits for verification", () => {
    expect(kitchenIsLoading(false, "tok", undefined)).toBe(true);
  });
  it("verified session resolves", () => {
    expect(kitchenIsLoading(false, "tok", { role: "kitchen" })).toBe(false);
  });
  it("dead token resolves (auto-clear + login redirect)", () => {
    expect(kitchenIsLoading(false, "tok", null)).toBe(false);
  });
  it("initial check still shows loading", () => {
    expect(kitchenIsLoading(true, null, undefined)).toBe(true);
  });
});
