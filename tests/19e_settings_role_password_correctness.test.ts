// ============================================================================
// MB CRUNCHY — 19E Settings Role + Password Correctness Tests
//
// Verifies the Phase 19E fixes for the two remaining confirmed 19A Major
// Settings issues:
//  1. Change Password did not enforce the forgot-password flow's minimum
//     length (8). Client validator + server changePassword now enforce it.
//  2. Kitchen Staff management rendered for non-superadmins although every
//     staff backend operation is superadmin-only. The section now mounts
//     only for superadmins; others see an informational note and never
//     subscribe to the superadmin-only staff query.
//
// Server checks run against the real adminAuth.changePassword/
// getKitchenStaff/createKitchenStaff handlers with a fake ctx (same
// approach as 10C/10I/17B-17G/19B). Client checks use the repo's
// readSource structural convention (tests 43/45) plus the real exported
// validateChangePassword helper.
//
// RUN: SESSION_SECRET=<32+ char test secret> vitest run tests/19e_settings_role_password_correctness.test.ts
// (SESSION_SECRET is required at import time by convex/utils/crypto.ts.)
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { validateChangePassword } from "../src/pages/admin/SettingsPage";
import {
  changePassword,
  getKitchenStaff,
  createKitchenStaff,
  issueRecoveryKey,
  regenerateRecoveryKey,
  resetPassword,
} from "../convex/adminAuth";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  sha256Hex,
} from "../convex/utils/crypto";

type Row = Record<string, unknown> & { _id: string };
type Pred = (row: Row) => boolean;
const isFieldRef = (v: unknown): v is { __field: string } =>
  typeof v === "object" && v !== null && "__field" in (v as object);

function makeDb(seed: { admins?: Row[]; adminSessions?: Row[] }) {
  const tables: Record<string, Row[]> = {
    admins: [...(seed.admins ?? [])],
    adminSessions: [...(seed.adminSessions ?? [])],
  };
  let seq = 0;
  const byId = (id: string): Row | null => {
    for (const rows of Object.values(tables)) {
      const found = rows.find((r) => r._id === id);
      if (found) return { ...found };
    }
    return null;
  };
  const resolve = (v: unknown, row: Row): unknown =>
    isFieldRef(v) ? row[v.__field] : v;
  const filterBuilder = {
    field: (f: string) => ({ __field: f }),
    eq: (a: unknown, b: unknown): Pred =>
      (row) => resolve(a, row) === resolve(b, row),
    and: (...ps: Pred[]): Pred =>
      (row) => ps.every((p) => p(row)),
  };
  const makeQuery = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const api = {
      withIndex: (
        _name: string,
        fn: (q: { eq: (f: string, v: unknown) => unknown }) => void
      ) => {
        const conds: Array<{ field: string; value: unknown }> = [];
        const q = {
          eq: (f: string, v: unknown) => {
            conds.push({ field: f, value: v });
            return q;
          },
        };
        fn(q);
        rows = rows.filter((r) => conds.every((c) => r[c.field] === c.value));
        return api;
      },
      filter: (fn: (q: typeof filterBuilder) => Pred) => {
        rows = rows.filter(fn(filterBuilder));
        return api;
      },
      order: (_dir: string) => api,
      collect: async () => rows.map((r) => ({ ...r })),
      first: async () => (rows[0] ? { ...rows[0] } : null),
    };
    return api;
  };
  const db = {
    query: (table: string) => makeQuery(table),
    get: async (id: string) => byId(id),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const id = `${table}_${++seq}_${Math.random().toString(36).slice(2)}`;
      tables[table].push({ ...doc, _id: id });
      return id;
    },
    patch: async (id: string, fields: Record<string, unknown>) => {
      for (const rows of Object.values(tables)) {
        const idx = rows.findIndex((r) => r._id === id);
        if (idx >= 0) {
          const next: Row = { ...rows[idx] };
          for (const [k, v] of Object.entries(fields)) {
            if (v === undefined) delete next[k];
            else next[k] = v;
          }
          rows[idx] = next;
          return;
        }
      }
      throw new Error(`Document with id ${id} not found`);
    },
    delete: async (id: string) => {
      for (const key of Object.keys(tables)) {
        tables[key] = tables[key].filter((r) => r._id !== id);
      }
    },
  };
  return { db, tables };
}

const ctxOf = (db: unknown) => ({ db }) as never;

async function invoke(
  fn: unknown,
  db: unknown,
  args: Record<string, unknown>
): Promise<unknown> {
  const f = fn as {
    handler?: (ctx: unknown, args: unknown) => Promise<unknown>;
    _handler?: (ctx: unknown, args: unknown) => Promise<unknown>;
  };
  if (typeof f.handler === "function") return f.handler(ctxOf(db), args);
  if (typeof f._handler === "function") return f._handler(ctxOf(db), args);
  throw new Error("cannot invoke Convex function: unknown wrapper shape");
}

async function expectThrows(
  fn: unknown,
  db: unknown,
  args: Record<string, unknown>,
  pattern: RegExp
) {
  let message = "";
  try {
    await invoke(fn, db, args);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toMatch(pattern);
  return message;
}

function readSource(relativePath: string): string {
  // Normalize CRLF: the repo mixes line endings and markers assume "\n".
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8").replace(/\r\n/g, "\n");
}

// Seeds one active admin with a known password plus a live session token.
async function seedAdminWithSession(
  tables: Record<string, Row[]>,
  opts: { adminId: string; username: string; role: string; password: string }
) {
  const { hash, salt } = await hashPassword(opts.password);
  const now = Date.now();
  tables["admins"].push({
    _id: opts.adminId,
    username: opts.username,
    role: opts.role,
    active: true,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  });
  const token = await createSessionToken(opts.adminId, opts.username, opts.role);
  tables["adminSessions"].push({
    _id: `sess_${opts.adminId}`,
    adminId: opts.adminId,
    tokenHash: await sha256Hex(token),
    expiresAt: now + 24 * 60 * 60 * 1000,
    createdAt: now,
  });
  return token;
}

// ============================================================================
// PASSWORD — client validator (tests 1-4)
// ============================================================================

describe("19E — change-password client validation", () => {
  it("TEST 1 — below the established minimum is rejected", () => {
    expect(validateChangePassword("1234567", "1234567")).toMatch(/at least 8 characters/);
    expect(validateChangePassword("", "")).toMatch(/at least 8 characters/);
  });

  it("TEST 2 — exactly the minimum is accepted", () => {
    expect(validateChangePassword("12345678", "12345678")).toBeNull();
  });

  it("TEST 3 — confirmation mismatch is still rejected", () => {
    expect(validateChangePassword("12345678", "87654321")).toMatch(/do not match/);
    expect(validateChangePassword("long-enough-password", "different-password")).toMatch(/do not match/);
  });

  it("TEST 4 — valid password path remains valid", () => {
    expect(validateChangePassword("correct horse staple", "correct horse staple")).toBeNull();
  });

  it("forgot-password flow still establishes the same minimum", () => {
    const forgot = readSource("src/pages/admin/AdminForgotPasswordPage.tsx");
    expect(forgot).toContain("newPassword.length < 8");
    expect(forgot).toContain("Password must be at least 8 characters");
    // Settings change-password now mirrors it instead of skipping the check.
    const settings = readSource("src/pages/admin/SettingsPage.tsx");
    expect(settings).toContain("validateChangePassword(newPassword, confirmPassword)");
  });
});

// ============================================================================
// PASSWORD — server enforcement (test 5)
// ============================================================================

describe("19E — change-password server enforcement", () => {
  it("TEST 5 — server rejects below-minimum passwords and accepts the minimum", async () => {
    const { db, tables } = makeDb({});
    const token = await seedAdminWithSession(tables, {
      adminId: "admin_1", username: "owner", role: "admin", password: "current-password-1",
    });
    // Below minimum rejected even with the correct current password…
    await expectThrows(changePassword, db, {
      sessionToken: token, currentPassword: "current-password-1", newPassword: "short7!",
    }, /at least 8 characters/);
    // …and the stored password is untouched.
    const stored = (await db.get("admin_1"))!;
    expect(await verifyPassword("current-password-1", stored.passwordHash as string, stored.passwordSalt as string)).toBe(true);
    // Exactly the minimum succeeds through the existing path…
    await invoke(changePassword, db, {
      sessionToken: token, currentPassword: "current-password-1", newPassword: "12345678",
    });
    const after = (await db.get("admin_1"))!;
    expect(await verifyPassword("12345678", after.passwordHash as string, after.passwordSalt as string)).toBe(true);
    expect(await verifyPassword("current-password-1", after.passwordHash as string, after.passwordSalt as string)).toBe(false);
    // …while wrong-current-password behavior is unchanged.
    await expectThrows(changePassword, db, {
      sessionToken: token, currentPassword: "wrong-password", newPassword: "another-valid-1",
    }, /Invalid current password/);
  });
});

// ============================================================================
// ROLE — kitchen staff visibility (tests 6-10)
// ============================================================================

describe("19E — kitchen staff role visibility", () => {
  it("TEST 6 — superadmin sees Kitchen Staff management", () => {
    const src = readSource("src/pages/admin/SettingsPage.tsx");
    expect(src).toContain('admin?.role === "superadmin"');
    // The management section mounts in the superadmin branch.
    const gate = src.indexOf('admin?.role === "superadmin"');
    const section = src.indexOf("<KitchenStaffSection />", gate);
    expect(section).toBeGreaterThan(gate);
  });

  it("TEST 7 — non-superadmin gets a note, not management controls", () => {
    const src = readSource("src/pages/admin/SettingsPage.tsx");
    expect(src).toContain("Only Superadmin can manage Kitchen Staff.");
    // The only mount of the management section is inside the role gate…
    expect(src.split("<KitchenStaffSection />").length - 1).toBe(1);
    // …and the interactive controls live inside the section, unreachable
    // without mounting it.
    const sectionFn = src.slice(src.indexOf("function KitchenStaffSection()"), src.indexOf("function AuthSecuritySection()"));
    expect(sectionFn).toContain("Add Staff");
    const fallback = src.slice(src.indexOf("Only Superadmin can manage Kitchen Staff.") - 500, src.indexOf("Only Superadmin can manage Kitchen Staff."));
    expect(fallback).not.toContain("Add Staff");
  });

  it("TEST 8 — unauthorized roles never subscribe to the staff query", () => {
    const src = readSource("src/pages/admin/SettingsPage.tsx");
    // The superadmin-only query is issued only inside the gated section…
    const sectionStart = src.indexOf("function KitchenStaffSection()");
    const sectionEnd = src.indexOf("function AuthSecuritySection()");
    const queryCall = src.indexOf("useQuery(api.adminAuth.getKitchenStaff");
    expect(queryCall).toBeGreaterThan(sectionStart);
    expect(queryCall).toBeLessThan(sectionEnd);
    // …which mounts exclusively behind the superadmin gate.
    expect(src.split("<KitchenStaffSection />").length - 1).toBe(1);
  });

  it("TEST 9 — unauthorized roles are not stuck in a loading state", () => {
    const src = readSource("src/pages/admin/SettingsPage.tsx");
    // The loading skeletons belong to the gated section; the fallback for
    // other roles is a static note with no async dependency.
    const sectionFn = src.slice(src.indexOf("function KitchenStaffSection()"), src.indexOf("function AuthSecuritySection()"));
    expect(sectionFn).toContain("kitchenStaff === undefined");
    const noteIdx = src.indexOf("Only Superadmin can manage Kitchen Staff.");
    const window = src.slice(Math.max(0, noteIdx - 400), noteIdx + 200);
    expect(window).not.toContain("Skeleton");
    expect(window).not.toContain("kitchenStaff ===");
  });

  it("TEST 10 — backend superadmin authorization remains intact", async () => {
    const { db, tables } = makeDb({});
    const superToken = await seedAdminWithSession(tables, {
      adminId: "super_1", username: "root", role: "superadmin", password: "super-password-1",
    });
    const adminToken = await seedAdminWithSession(tables, {
      adminId: "admin_1", username: "owner", role: "admin", password: "admin-password-1",
    });
    // Non-superadmin cannot view staff…
    await expectThrows(getKitchenStaff, db, { sessionToken: adminToken }, /Only superadmins can view kitchen staff/);
    // …nor create them (backend remains the final authority).
    await expectThrows(createKitchenStaff, db, {
      sessionToken: adminToken, username: "k1", passwordHash: "h", passwordSalt: "s",
      recoveryKeyHash: "r", recoveryKeySalt: "t",
    }, /Only superadmins can create kitchen staff accounts/);
    // Superadmin path unchanged.
    const staff = (await invoke(getKitchenStaff, db, { sessionToken: superToken })) as unknown[];
    expect(staff).toEqual([]);
  });
});

// ============================================================================
// RECOVERY — untouched (test 11)
// ============================================================================

describe("19E — recovery-key path unchanged", () => {
  it("TEST 11 — recovery-key UI and backend paths remain intact", () => {
    const src = readSource("src/pages/admin/SettingsPage.tsx");
    // Generate flow with current-password confirmation…
    expect(src).toContain("Generate New Recovery Key");
    expect(src).toContain("api.adminAuth.issueRecoveryKey");
    expect(src).toContain("api.adminAuth.regenerateRecoveryKey");
    // …one-time plaintext display…
    expect(src).toContain("setIssuedRecoveryKey");
    expect(src).toContain("issuedRecoveryKey");
    // …and copy action.
    expect(src).toContain("Copy Key");
    expect(src).toContain("navigator.clipboard.writeText");
    // Backend recovery surface still exported and unaltered in contract.
    for (const fn of [issueRecoveryKey, regenerateRecoveryKey, resetPassword]) {
      expect(["function", "object"]).toContain(typeof fn);
    }
    // The 19E server change is scoped to changePassword: the recovery
    // reset handler keeps its existing (client-enforced) contract.
    const backend = readSource("convex/adminAuth.ts");
    const resetBlock = backend.slice(backend.indexOf("export const resetPassword"), backend.indexOf("export const createKitchenStaff"));
    expect(resetBlock).not.toContain("at least 8 characters");
    const changeBlock = backend.slice(backend.indexOf("export const changePassword"), backend.indexOf("export const issueRecoveryKey"));
    expect(changeBlock).toContain("Password must be at least 8 characters");
  });
});
