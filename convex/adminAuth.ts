import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  generateRecoveryKey,
  sha256Hex,
} from "./utils/crypto";
import { findSessionByToken } from "./utils/adminAuth";

// ============================================================================
// Helpers
// ============================================================================

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

async function verifyAdminSession(
  ctx: any,
  sessionToken: string,
  opts?: { upgradeLegacy?: boolean },
) {
  const payload = await verifySessionToken(sessionToken);
  if (!payload) return null;

  const session = await findSessionByToken(ctx, sessionToken, opts);

  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await ctx.db.delete(session._id);
    return null;
  }

  const admin = await ctx.db.get(session.adminId);
  if (!admin || !admin.active) {
    await ctx.db.delete(session._id);
    return null;
  }

  return { admin, payload };
}

// ============================================================================
// Queries
// ============================================================================

export const hasAdmins = query({
  handler: async (ctx) => {
    const admin = await ctx.db.query("admins").first();
    return admin !== null;
  },
});

export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    // Queries cannot write: authenticate legacy rows without upgrading them
    // (the upgrade happens on the next mutating call).
    const result = await verifyAdminSession(ctx, args.sessionToken, {
      upgradeLegacy: false,
    });
    if (!result) return null;
    return {
      adminId: result.admin._id,
      username: result.admin.username,
      role: result.admin.role,
      businessUnitIds: result.admin.businessUnitIds ?? [],
      lastLoginAt: result.admin.lastLoginAt,
    };
  },
});

export const getAdminByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (!admin) return null;
    return {
      id: admin._id,
      username: admin.username,
      role: admin.role,
      active: admin.active,
      hasRecoveryKey: Boolean(admin.recoveryKeyHash),
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  },
});

export const getActiveSessions = query({
  args: { adminId: v.id("admins") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", args.adminId))
      .collect();
    return sessions.filter((s) => s.expiresAt > Date.now()).map((s) => ({
      id: s._id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  },
});

// ============================================================================
// Mutations — Setup
// ============================================================================

export const setup = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    role: v.union(v.literal("superadmin"), v.literal("admin"), v.literal("kitchen")),
    recoveryKeyHash: v.string(),
    recoveryKeySalt: v.string(),
  },
  handler: async (ctx, args) => {
    // Only allow setup if no admins exist
    const existing = await ctx.db.query("admins").first();
    if (existing) throw new Error("An admin account already exists. Cannot run setup.");

    const now = Date.now();

    const adminId = await ctx.db.insert("admins", {
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: args.role,
      active: true,
      recoveryKeyHash: args.recoveryKeyHash,
      recoveryKeySalt: args.recoveryKeySalt,
      createdAt: now,
      updatedAt: now,
    });

    // Create session — 10F: persist tokenHash only, never the plaintext JWT.
    const token = await createSessionToken(adminId, args.username, args.role);
    await ctx.db.insert("adminSessions", {
      adminId,
      tokenHash: await sha256Hex(token),
      expiresAt: now + SESSION_EXPIRY_MS,
      createdAt: now,
    });

    return { adminId, token };
  },
});

// ============================================================================
// Mutations — Login
// ============================================================================

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

async function checkBruteForce(ctx: any, username: string): Promise<boolean> {
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (!admin) return false;
  const attempts = admin.failedLoginAttempts ?? 0;
  const firstFailedAt = admin.firstFailedLoginAt;
  if (attempts >= MAX_LOGIN_ATTEMPTS && firstFailedAt) {
    if (Date.now() - firstFailedAt < LOCKOUT_DURATION_MS) {
      return true;
    }
    await ctx.db.patch(admin._id, { failedLoginAttempts: 0, firstFailedLoginAt: undefined });
  }
  return false;
}

async function recordFailedAttempt(ctx: any, username: string): Promise<void> {
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (!admin) return;
  const now = Date.now();
  const attempts = admin.failedLoginAttempts ?? 0;
  if (attempts === 0 || (now - (admin.firstFailedLoginAt ?? 0)) >= LOCKOUT_DURATION_MS) {
    await ctx.db.patch(admin._id, { failedLoginAttempts: 1, firstFailedLoginAt: now });
  } else {
    await ctx.db.patch(admin._id, { failedLoginAttempts: attempts + 1 });
  }
}

async function clearAttempts(ctx: any, username: string): Promise<void> {
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (!admin) return;
  await ctx.db.patch(admin._id, { failedLoginAttempts: 0, firstFailedLoginAt: undefined });
}

export const login = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    // P2 F-10: optional entry-point role gate. Admin login passes
    // ["superadmin", "admin"], kitchen login passes ["kitchen"]. Rejection
    // uses the generic message so no role information leaks.
    allowedRoles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!admin) {
      return { success: false as const, error: "Invalid username or password." };
    }

    if (!admin.active) {
      return { success: false as const, error: "This account has been disabled." };
    }

    if (args.allowedRoles && !args.allowedRoles.includes(admin.role)) {
      return { success: false as const, error: "Invalid username or password." };
    }

    // Brute-force protection
    if (await checkBruteForce(ctx, args.username)) {
      return { success: false as const, error: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." };
    }

    const valid = await verifyPassword(
      args.password,
      admin.passwordHash,
      admin.passwordSalt,
    );

    if (!valid) {
      await recordFailedAttempt(ctx, args.username);
      return { success: false as const, error: "Invalid username or password." };
    }

    await clearAttempts(ctx, args.username);
    const now = Date.now();
    await ctx.db.patch(admin._id, { lastLoginAt: now, updatedAt: now });

    const token = await createSessionToken(admin._id, admin.username, admin.role);
    await ctx.db.insert("adminSessions", {
      adminId: admin._id,
      tokenHash: await sha256Hex(token),
      expiresAt: now + SESSION_EXPIRY_MS,
      createdAt: now,
    });

    return {
      success: true as const,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    };
  },
});

// ============================================================================
// Mutations — Session Management
// ============================================================================

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await findSessionByToken(ctx, args.sessionToken);
    if (session) {
      await ctx.db.delete(session._id);
    }
    return true;
  },
});

export const logoutAllSessions = mutation({
  args: {
    sessionToken: v.string(),
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");
    if (result.admin._id !== args.adminId) throw new Error("Cannot logout other admin sessions");

    const sessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", args.adminId))
      .collect();

    // Identify the current session row directly: new rows carry no plaintext
    // token, so comparison must be by row id, not by token value.
    const current = await findSessionByToken(ctx, args.sessionToken);
    for (const session of sessions) {
      if (!current || session._id !== current._id) {
        await ctx.db.delete(session._id);
      }
    }

    return true;
  },
});

// ============================================================================
// Mutations — Password & Username Management
// ============================================================================

export const changeUsername = mutation({
  args: {
    sessionToken: v.string(),
    newUsername: v.string(),
    currentPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    // Verify current password
    const valid = await verifyPassword(
      args.currentPassword,
      result.admin.passwordHash,
      result.admin.passwordSalt,
    );
    if (!valid) throw new Error("Invalid password");

    // Check username availability
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.newUsername))
      .first();
    if (existing && existing._id !== result.admin._id) {
      throw new Error("Username is already taken");
    }

    await ctx.db.patch(result.admin._id, {
      username: args.newUsername,
      updatedAt: Date.now(),
    });

    // Invalidate all sessions and create a new one
    const sessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", result.admin._id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    const token = await createSessionToken(result.admin._id, args.newUsername, result.admin.role);
    await ctx.db.insert("adminSessions", {
      adminId: result.admin._id,
      tokenHash: await sha256Hex(token),
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
      createdAt: Date.now(),
    });

    return { token };
  },
});

export const changePassword = mutation({
  args: {
    sessionToken: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    // 19E: same minimum length as the forgot-password flow (client in
    // AdminForgotPasswordPage). Rejected before password verification.
    if (args.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const valid = await verifyPassword(
      args.currentPassword,
      result.admin.passwordHash,
      result.admin.passwordSalt,
    );
    if (!valid) throw new Error("Invalid current password");

    const { hash: newHash, salt: newSalt } = await hashPassword(args.newPassword);
    await ctx.db.patch(result.admin._id, {
      passwordHash: newHash,
      passwordSalt: newSalt,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================================================
// Queries — Recovery Key Issuance
// ============================================================================

/**
 * Issue one cryptographically secure recovery key (10M).
 *
 * Uses the server-side WebCrypto generator — never Math.random(), never
 * browser randomness, never a password-derived value. Read-only: nothing
 * is persisted and nothing is logged; the plaintext is returned once so
 * the caller can display it and submit only its hash via setup /
 * createAdmin / createKitchenStaff / regenerateRecoveryKey. An unbound key
 * is useless on its own (it becomes valid only when its hash is stored
 * for an account), so this stays callable from the unauthenticated setup
 * page like the rest of the onboarding flow.
 */
export const issueRecoveryKey = query({
  args: {},
  handler: async () => {
    return { recoveryKey: generateRecoveryKey() };
  },
});

// ============================================================================
// Mutations — Password Reset (Recovery Key)
// ============================================================================

export const resetPassword = mutation({
  args: {
    username: v.string(),
    recoveryKey: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!admin) throw new Error("Admin not found");

    // 10M: deactivated accounts cannot recover — enforced server-side for
    // every role (including kitchen staff, which share this mutation).
    // Rejected before key verification, password change, session churn,
    // and before recording any brute-force attempt.
    if (!admin.active) {
      throw new Error("This account has been disabled.");
    }

    if (!admin.recoveryKeyHash || !admin.recoveryKeySalt) {
      throw new Error("No recovery key configured for this account");
    }

    // 10M: same persisted 5-attempt / 15-minute protection as normal login.
    // Recovery guesses share the login counters (fail-closed): excessive
    // recovery guessing also locks password login for the window, and a
    // successful recovery clears the state. Checked before the expensive
    // PBKDF2 verification.
    if (await checkBruteForce(ctx, args.username)) {
      throw new Error("Account temporarily locked due to too many failed attempts. Try again in 15 minutes.");
    }

    const valid = await verifyPassword(
      args.recoveryKey,
      admin.recoveryKeyHash,
      admin.recoveryKeySalt,
    );
    if (!valid) {
      await recordFailedAttempt(ctx, args.username);
      throw new Error("Invalid recovery key");
    }

    await clearAttempts(ctx, args.username);

    const now = Date.now();
    const { hash: pwHash, salt: pwSalt } = await hashPassword(args.newPassword);

    // 10M: recovery credentials are single-use. The used key hash/salt are
    // cleared (Convex patch undefined deletes the fields) so the same key
    // can never perform a second reset. Rotation remains available via the
    // session-gated regenerateRecoveryKey mutation. Password login is
    // unaffected; only the recovery credential is consumed.
    await ctx.db.patch(admin._id, {
      passwordHash: pwHash,
      passwordSalt: pwSalt,
      recoveryKeyHash: undefined,
      recoveryKeySalt: undefined,
      updatedAt: now,
    });

    // Invalidate all sessions
    const sessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", admin._id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Create new session — 10F: tokenHash only, never the plaintext JWT.
    const token = await createSessionToken(admin._id, admin.username, admin.role);
    await ctx.db.insert("adminSessions", {
      adminId: admin._id,
      tokenHash: await sha256Hex(token),
      expiresAt: now + SESSION_EXPIRY_MS,
      createdAt: now,
    });

    return { token };
  },
});

// ============================================================================
// Mutations — Recovery Key Management
// ============================================================================

export const regenerateRecoveryKey = mutation({
  args: {
    sessionToken: v.string(),
    currentPassword: v.string(),
    newRecoveryKeyHash: v.string(),
    newRecoveryKeySalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    const valid = await verifyPassword(
      args.currentPassword,
      result.admin.passwordHash,
      result.admin.passwordSalt,
    );
    if (!valid) throw new Error("Invalid password");

    await ctx.db.patch(result.admin._id, {
      recoveryKeyHash: args.newRecoveryKeyHash,
      recoveryKeySalt: args.newRecoveryKeySalt,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================================================
// Mutations — Admin Creation (for superadmins)
// ============================================================================

export const createAdmin = mutation({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    role: v.union(v.literal("superadmin"), v.literal("admin"), v.literal("kitchen")),
    recoveryKeyHash: v.string(),
    recoveryKeySalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can create new admin accounts");
    }

    const existing = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (existing) throw new Error("Username already exists");

    const now = Date.now();

    const adminId = await ctx.db.insert("admins", {
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: args.role,
      active: true,
      recoveryKeyHash: args.recoveryKeyHash,
      recoveryKeySalt: args.recoveryKeySalt,
      createdAt: now,
      updatedAt: now,
    });

    return { adminId };
  },
});

export const toggleAdminActive = mutation({
  args: {
    sessionToken: v.string(),
    targetAdminId: v.id("admins"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can modify admin accounts");
    }
    if (result.admin._id === args.targetAdminId) {
      throw new Error("Cannot disable your own account");
    }

    await ctx.db.patch(args.targetAdminId, {
      active: args.active,
      updatedAt: Date.now(),
    });

    // If disabling, invalidate all sessions
    if (!args.active) {
      const sessions = await ctx.db
        .query("adminSessions")
        .withIndex("by_admin", (q) => q.eq("adminId", args.targetAdminId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }

    return true;
  },
});
// ============================================================================
// Kitchen Staff Management (superadmin only)
// ============================================================================

export const createKitchenStaff = mutation({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    recoveryKeyHash: v.string(),
    recoveryKeySalt: v.string(),
    businessUnitIds: v.optional(v.array(v.id("businessUnits"))),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can create kitchen staff accounts");
    }

    const existing = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (existing) throw new Error("Username already exists");

    const now = Date.now();

    const adminId = await ctx.db.insert("admins", {
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: "kitchen",
      active: true,
      businessUnitIds: args.businessUnitIds ?? [],
      recoveryKeyHash: args.recoveryKeyHash,
      recoveryKeySalt: args.recoveryKeySalt,
      createdAt: now,
      updatedAt: now,
    });

    return { adminId };
  },
});

export const resetKitchenStaffPassword = mutation({
  args: {
    sessionToken: v.string(),
    targetAdminId: v.id("admins"),
    newPasswordHash: v.string(),
    newPasswordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can reset kitchen staff passwords");
    }

    const target = await ctx.db.get(args.targetAdminId);
    if (!target || target.role !== "kitchen") {
      throw new Error("Target is not a kitchen staff account");
    }

    await ctx.db.patch(args.targetAdminId, {
      passwordHash: args.newPasswordHash,
      passwordSalt: args.newPasswordSalt,
      updatedAt: Date.now(),
    });

    // Invalidate all sessions for this kitchen staff
    const sessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", args.targetAdminId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return true;
  },
});

export const toggleKitchenStaffActive = mutation({
  args: {
    sessionToken: v.string(),
    targetAdminId: v.id("admins"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can modify kitchen staff accounts");
    }

    const target = await ctx.db.get(args.targetAdminId);
    if (!target || target.role !== "kitchen") {
      throw new Error("Target is not a kitchen staff account");
    }

    await ctx.db.patch(args.targetAdminId, {
      active: args.active,
      updatedAt: Date.now(),
    });

    // If disabling, invalidate all sessions
    if (!args.active) {
      const sessions = await ctx.db
        .query("adminSessions")
        .withIndex("by_admin", (q) => q.eq("adminId", args.targetAdminId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }

    return true;
  },
});

export const updateKitchenStaff = mutation({
  args: {
    sessionToken: v.string(),
    targetAdminId: v.id("admins"),
    businessUnitIds: v.optional(v.array(v.id("businessUnits"))),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can modify kitchen staff accounts");
    }

    const target = await ctx.db.get(args.targetAdminId);
    if (!target || target.role !== "kitchen") {
      throw new Error("Target is not a kitchen staff account");
    }

    await ctx.db.patch(args.targetAdminId, {
      businessUnitIds: args.businessUnitIds ?? [],
      updatedAt: Date.now(),
    });

    return true;
  },
});

export const getKitchenStaff = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result || result.admin.role !== "superadmin") {
      throw new Error("Only superadmins can view kitchen staff");
    }

    const staff = await ctx.db
      .query("admins")
      .filter((q) => q.eq(q.field("role"), "kitchen"))
      .collect();

    return staff.map((s) => ({
      id: s._id,
      username: s.username,
      active: s.active,
      businessUnitIds: s.businessUnitIds ?? [],
      lastLoginAt: s.lastLoginAt,
      createdAt: s.createdAt,
    }));
  },
});
