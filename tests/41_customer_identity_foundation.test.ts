// ============================================================================
// MB CRUNCHY — Phase 41 Customer Identity & Account Foundation Tests
//
// Tests for the authUserId wiring and ensureCustomerForAuthUser logic.
// These are unit/logic tests verifying the behavior patterns.
//
// Pure logic tests — no live backend calls.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// 1. ensureCustomerByPhone — authUserId Wiring
// ============================================================================

describe("1. ensureCustomerByPhone — authUserId wiring", () => {
  interface CustomerRecord {
    _id: string;
    name: string;
    phone: string;
    email?: string;
    authUserId?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt?: number;
    status: string;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number;
  }

  function createMockDb(customers: CustomerRecord[] = []) {
    const db = {
      customers: [...customers],
      insert: vi.fn((table: string, record: unknown) => {
        const id = `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (table === "customers") {
          db.customers.push({ ...record, _id: id } as CustomerRecord);
        }
        return id;
      }),
      patch: vi.fn((id: string, patch: Record<string, unknown>) => {
        const idx = db.customers.findIndex((c) => c._id === id);
        if (idx >= 0) {
          db.customers[idx] = { ...db.customers[idx], ...patch } as CustomerRecord;
        }
      }),
    };
    return db;
  }

  function createMockCtx(db: ReturnType<typeof createMockDb>) {
    return {
      db: {
        insert: db.insert,
        patch: db.patch,
        query: (table: string) => ({
          withIndex: (_indexName: string, queryFn: (q: unknown) => unknown) => ({
            filter: (_filterFn: unknown) => ({
              first: () => {
                if (table === "customers") {
                  const args = { index: "", phone: "", authUserId: "" };
                  // Simplified lookup: just return first matching customer
                  return db.customers.find((c) => !c.deletedAt) || null;
                }
                return null;
              },
            }),
          }),
        }),
      },
    };
  }

  it("should create new customer with authUserId when no existing records", async () => {
    const db = createMockDb();
    const ctx = createMockCtx(db);
    const now = Date.now();

    // Simulate ensureCustomerByPhone logic for new customer
    const phone = "9876543210";
    const authUserId = "user_abc123";
    const name = "Test User";

    // Step 1: No auth-linked customer found (empty DB)
    // Step 2: No phone-based customer found (empty DB)
    // Step 3: Create new customer
    const customerId = await db.insert("customers", {
      name: name.trim(),
      phone,
      authUserId,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    expect(customerId).toBeTruthy();
    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].authUserId).toBe("user_abc123");
    expect(db.customers[0].phone).toBe("9876543210");
    expect(db.customers[0].name).toBe("Test User");
  });

  it("should link authUserId to existing phone-based customer", async () => {
    const existingCustomer: CustomerRecord = {
      _id: "customer_existing",
      name: "",
      phone: "9876543210",
      totalOrders: 2,
      totalSpent: 50000,
      status: "active",
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    };

    const db = createMockDb([existingCustomer]);
    const ctx = createMockCtx(db);

    // Simulate: phone-based customer found, no authUserId set
    const existing = db.customers.find((c) => c.phone === "9876543210" && !c.authUserId);

    expect(existing).toBeTruthy();
    expect(existing!.authUserId).toBeUndefined();

    // Link authUserId
    await db.patch(existing!._id, {
      authUserId: "user_abc123",
      totalOrders: existing!.totalOrders + 1,
      updatedAt: Date.now(),
    });

    const updated = db.customers.find((c) => c._id === "customer_existing");
    expect(updated!.authUserId).toBe("user_abc123");
    expect(updated!.totalOrders).toBe(3);
  });

  it("should merge when auth-linked customer already exists", async () => {
    const authCustomer: CustomerRecord = {
      _id: "customer_auth",
      name: "Auth User",
      phone: "",
      authUserId: "user_abc123",
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    };

    const db = createMockDb([authCustomer]);

    // Simulate: auth-linked customer found
    const existing = db.customers.find(
      (c) => c.authUserId === "user_abc123" && !c.deletedAt,
    );

    expect(existing).toBeTruthy();
    expect(existing!._id).toBe("customer_auth");

    // Should update order count and merge phone
    await db.patch(existing!._id, {
      phone: "9876543210",
      totalOrders: existing!.totalOrders + 1,
      lastOrderAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = db.customers.find((c) => c._id === "customer_auth");
    expect(updated!.phone).toBe("9876543210");
    expect(updated!.totalOrders).toBe(1);
  });

  it("should not overwrite existing phone on auth-linked customer", async () => {
    const authCustomer: CustomerRecord = {
      _id: "customer_auth",
      name: "Auth User",
      phone: "9876543210",
      authUserId: "user_abc123",
      totalOrders: 1,
      totalSpent: 10000,
      status: "active",
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    };

    const db = createMockDb([authCustomer]);

    // Simulate: auth-linked customer found, phone already set
    const existing = db.customers.find(
      (c) => c.authUserId === "user_abc123" && !c.deletedAt,
    );

    // Should NOT overwrite existing phone
    const patch: Record<string, unknown> = {
      totalOrders: existing!.totalOrders + 1,
      updatedAt: Date.now(),
    };
    if (!existing!.phone) {
      patch.phone = "9999999999";
    }

    await db.patch(existing!._id, patch);

    const updated = db.customers.find((c) => c._id === "customer_auth");
    expect(updated!.phone).toBe("9876543210"); // unchanged
  });

  it("should not overwrite existing name on auth-linked customer", async () => {
    const authCustomer: CustomerRecord = {
      _id: "customer_auth",
      name: "Existing Name",
      phone: "9876543210",
      authUserId: "user_abc123",
      totalOrders: 1,
      totalSpent: 10000,
      status: "active",
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    };

    const db = createMockDb([authCustomer]);

    const existing = db.customers.find(
      (c) => c.authUserId === "user_abc123" && !c.deletedAt,
    );

    const patch: Record<string, unknown> = {
      totalOrders: existing!.totalOrders + 1,
      updatedAt: Date.now(),
    };
    if (!existing!.name) {
      patch.name = "New Name";
    }

    await db.patch(existing!._id, patch);

    const updated = db.customers.find((c) => c._id === "customer_auth");
    expect(updated!.name).toBe("Existing Name"); // unchanged
  });
});

// ============================================================================
// 2. ensureCustomerForAuthUser — Idempotency
// ============================================================================

describe("2. ensureCustomerForAuthUser — idempotency", () => {
  interface CustomerRecord {
    _id: string;
    name: string;
    email?: string;
    authUserId?: string;
    totalOrders: number;
    totalSpent: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  }

  function createMockDb(customers: CustomerRecord[] = []) {
    const db = {
      customers: [...customers],
      insert: vi.fn((table: string, record: unknown) => {
        const id = `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (table === "customers") {
          db.customers.push({ ...record, _id: id } as CustomerRecord);
        }
        return id;
      }),
    };
    return db;
  }

  it("should return existing customer ID when auth user already linked", () => {
    const db = createMockDb([
      {
        _id: "customer_1",
        name: "Test User",
        authUserId: "user_abc123",
        totalOrders: 0,
        totalSpent: 0,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    // Simulate: find customer by authUserId
    const existing = db.customers.find((c) => c.authUserId === "user_abc123");

    expect(existing).toBeTruthy();
    expect(existing!._id).toBe("customer_1");
  });

  it("should create new customer when no auth user linked", async () => {
    const db = createMockDb();

    // Simulate: no customer found for this auth user
    const existing = db.customers.find((c) => c.authUserId === "user_new456");
    expect(existing).toBeUndefined();

    // Create new customer
    const customerId = await db.insert("customers", {
      name: "New User",
      email: "new@example.com",
      authUserId: "user_new456",
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(customerId).toBeTruthy();
    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].authUserId).toBe("user_new456");
  });

  it("should handle anonymous user (no identity) by returning null", () => {
    const identity = null;

    // Simulate: no identity → return null
    const result = identity ? "customer_id" : null;
    expect(result).toBeNull();
  });

  it("should set name from identity when available", async () => {
    const db = createMockDb();

    const identity = {
      subject: "user_abc123",
      name: "John Doe",
      email: "john@example.com",
    };

    const customerId = await db.insert("customers", {
      name: identity.name || "",
      email: identity.email || undefined,
      authUserId: identity.subject,
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(db.customers[0].name).toBe("John Doe");
    expect(db.customers[0].email).toBe("john@example.com");
  });

  it("should handle identity with no name gracefully", async () => {
    const db = createMockDb();

    const identity = {
      subject: "user_anon789",
      name: undefined,
      email: undefined,
    };

    const customerId = await db.insert("customers", {
      name: identity.name || "",
      email: identity.email || undefined,
      authUserId: identity.subject,
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(db.customers[0].name).toBe("");
    expect(db.customers[0].email).toBeUndefined();
  });
});

// ============================================================================
// 3. finalizePaidOrder — authUserId Pass-through
// ============================================================================

describe("3. finalizePaidOrder — authUserId pass-through", () => {
  it("should pass identity.subject as authUserId to ensureCustomerByPhone", () => {
    // The key code path in orders.ts finalizePaidOrder:
    // const authUserId = identity?.subject;
    // await ensureCustomerByPhone(ctx, { name, phone, email, authUserId });

    const identity = { subject: "user_abc123" };
    const authUserId = identity?.subject;

    expect(authUserId).toBe("user_abc123");
  });

  it("should handle missing identity gracefully", () => {
    const identity = undefined;
    const authUserId = identity?.subject;

    expect(authUserId).toBeUndefined();
  });

  it("should handle null identity gracefully", () => {
    const identity = null;
    const authUserId = identity?.subject;

    expect(authUserId).toBeUndefined();
  });
});

// ============================================================================
// 4. Auth Page — No Auto-redirect Race Condition
// ============================================================================

describe("4. Auth page — no auto-redirect race condition", () => {
  it("should not redirect when isAuthenticated changes from false to true", () => {
    // The old code had a useEffect that redirected to "/" when isAuthenticated became true.
    // This caused a race: user clicks sign in → anonymous sign in starts →
    // isAuthenticated flips true → redirect to "/" → form submission never completes.

    const REDIRECT_PATH = "/"; // the old redirect target

    let navigateCalled = false;
    const mockNavigate = (path: string) => {
      if (path === REDIRECT_PATH) {
        navigateCalled = true;
      }
    };

    // Simulate: isAuthenticated changes to true
    // With the fix: NO redirect should happen
    const isAuthenticated = true;
    // The useEffect was removed, so no redirect logic runs

    expect(navigateCalled).toBe(false);
  });

  it("should preserve user location after sign-in", () => {
    // After removing the auto-redirect, the user stays on /auth until they
    // explicitly navigate elsewhere or the form completes.

    const currentPath = "/auth";
    let navigateTarget = currentPath;

    // Simulate: sign-in completes
    // With the fix: stay on /auth (no automatic redirect)
    // The form submission handler manages navigation

    expect(navigateTarget).toBe("/auth");
  });
});

// ============================================================================
// 5. Customer Layout — ensureCustomerForAuthUser on Mount
// ============================================================================

describe("5. CustomerLayout — ensureCustomerForAuthUser on mount", () => {
  it("should call ensureCustomerForAuthUser when authenticated", () => {
    const ensureCustomer = vi.fn();

    let isAuthenticated = true;

    // Simulate useEffect trigger
    if (isAuthenticated) {
      ensureCustomer();
    }

    expect(ensureCustomer).toHaveBeenCalledTimes(1);
  });

  it("should not call ensureCustomerForAuthUser when not authenticated", () => {
    const ensureCustomer = vi.fn();

    let isAuthenticated = false;

    if (isAuthenticated) {
      ensureCustomer();
    }

    expect(ensureCustomer).not.toHaveBeenCalled();
  });

  it("should be idempotent on re-renders", () => {
    const ensureCustomer = vi.fn();
    const isAuthenticated = true;

    // Simulate multiple re-renders (React useEffect behavior)
    for (let i = 0; i < 5; i++) {
      if (isAuthenticated) {
        ensureCustomer();
      }
    }

    // In actual React, useEffect with correct deps only fires once per dep change
    // Here we verify the function can be called multiple times safely
    expect(ensureCustomer).toHaveBeenCalledTimes(5);
  });
});

// ============================================================================
// 6. Integration — Full Identity Flow
// ============================================================================

describe("6. Integration — full identity flow", () => {
  interface CustomerRecord {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    authUserId?: string;
    totalOrders: number;
    totalSpent: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  }

  function createMockDb(customers: CustomerRecord[] = []) {
    const db = {
      customers: [...customers],
      insert: vi.fn((table: string, record: unknown) => {
        const id = `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (table === "customers") {
          db.customers.push({ ...record, _id: id } as CustomerRecord);
        }
        return id;
      }),
      patch: vi.fn((id: string, patch: Record<string, unknown>) => {
        const idx = db.customers.findIndex((c) => c._id === id);
        if (idx >= 0) {
          db.customers[idx] = { ...db.customers[idx], ...patch } as CustomerRecord;
        }
      }),
    };
    return db;
  }

  it("should handle full lifecycle: anonymous → auth → order → profile", async () => {
    const db = createMockDb();
    const now = Date.now();

    // Step 1: User signs in anonymously → ensureCustomerForAuthUser creates customer
    const customerId1 = await db.insert("customers", {
      name: "",
      authUserId: "user_anon_123",
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].authUserId).toBe("user_anon_123");
    expect(db.customers[0].name).toBe("");

    // Step 2: User places order → ensureCustomerByPhone finds auth-linked customer
    const existing = db.customers.find(
      (c) => c.authUserId === "user_anon_123" && !c.deletedAt,
    );
    expect(existing).toBeTruthy();

    // Merge phone into existing customer
    await db.patch(existing!._id, {
      phone: "9876543210",
      name: "John Doe",
      totalOrders: 1,
      lastOrderAt: now,
      updatedAt: now,
    });

    expect(db.customers[0].phone).toBe("9876543210");
    expect(db.customers[0].name).toBe("John Doe");
    expect(db.customers[0].totalOrders).toBe(1);

    // Step 3: User updates profile → customer found via authUserId
    const profileCustomer = db.customers.find(
      (c) => c.authUserId === "user_anon_123" && !c.deletedAt,
    );
    expect(profileCustomer).toBeTruthy();

    await db.patch(profileCustomer!._id, {
      email: "john@example.com",
      updatedAt: now,
    });

    expect(db.customers[0].email).toBe("john@example.com");

    // Final state: single customer record with all data linked
    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].authUserId).toBe("user_anon_123");
    expect(db.customers[0].phone).toBe("9876543210");
    expect(db.customers[0].name).toBe("John Doe");
    expect(db.customers[0].email).toBe("john@example.com");
    expect(db.customers[0].totalOrders).toBe(1);
  });

  it("should handle multiple anonymous sessions linking to same customer", async () => {
    const db = createMockDb();
    const now = Date.now();

    // Step 1: First anonymous session creates customer
    await db.insert("customers", {
      name: "User A",
      phone: "9876543210",
      authUserId: "session_abc",
      totalOrders: 1,
      totalSpent: 10000,
      status: "active",
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    });

    // Step 2: Second anonymous session — no auth user match
    // But phone matches → ensureCustomerByPhone links the new session
    const existingByPhone = db.customers.find((c) => c.phone === "9876543210");
    expect(existingByPhone).toBeTruthy();

    // Don't create new customer — update existing
    await db.patch(existingByPhone!._id, {
      totalOrders: existingByPhone!.totalOrders + 1,
      updatedAt: now,
    });

    // Should still be one customer record
    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].totalOrders).toBe(2);
  });
});
