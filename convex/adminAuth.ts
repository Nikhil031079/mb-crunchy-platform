import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  generateRecoveryKey,
} from "./utils/crypto";

// ============================================================================
// Helpers
// ============================================================================

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

async function verifyAdminSession(ctx: any, sessionToken: string) {
  const payload = await verifySessionToken(sessionToken);
  if (!payload) return null;

  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q: any) => q.eq("token", sessionToken))
    .first();

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
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) return null;
    return {
      adminId: result.admin._id,
      username: result.admin.username,
      role: result.admin.role,
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
    role: v.union(v.literal("superadmin"), v.literal("admin")),
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

    // Create session
    const token = await createSessionToken(adminId, args.username, args.role);
    await ctx.db.insert("adminSessions", {
      adminId,
      token,
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

// Brute-force protection (in-memory)
const loginAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

function checkBruteForce(username: string): boolean {
  const record = loginAttempts.get(username);
  if (!record) return false;
  if (record.count >= MAX_LOGIN_ATTEMPTS && (Date.now() - record.firstAttemptAt) < LOCKOUT_DURATION_MS) {
    return true;
  }
  if (record.count >= MAX_LOGIN_ATTEMPTS && (Date.now() - record.firstAttemptAt) >= LOCKOUT_DURATION_MS) {
    loginAttempts.delete(username);
  }
  return false;
}

function recordFailedAttempt(username: string) {
  const record = loginAttempts.get(username);
  if (!record || (Date.now() - record.firstAttemptAt) >= LOCKOUT_DURATION_MS) {
    loginAttempts.set(username, { count: 1, firstAttemptAt: Date.now() });
  } else {
    record.count++;
  }
}

function clearAttempts(username: string) {
  loginAttempts.delete(username);
}

export const login = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
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

    // Brute-force protection
    if (checkBruteForce(args.username)) {
      return { success: false as const, error: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." };
    }

    const valid = await verifyPassword(
      args.passwordHash,
      admin.passwordHash,
      admin.passwordSalt,
    );

    if (!valid) {
      recordFailedAttempt(args.username);
      return { success: false as const, error: "Invalid username or password." };
    }

    clearAttempts(args.username);
    const now = Date.now();
    await ctx.db.patch(admin._id, { lastLoginAt: now, updatedAt: now });

    const token = await createSessionToken(admin._id, admin.username, admin.role);
    await ctx.db.insert("adminSessions", {
      adminId: admin._id,
      token,
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
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();
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

    for (const session of sessions) {
      if (session.token !== args.sessionToken) {
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
    currentPasswordHash: v.string(),
    currentPasswordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    // Verify current password
    const valid = await verifyPassword(
      args.currentPasswordHash,
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
      token,
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
      createdAt: Date.now(),
    });

    return { token };
  },
});

export const changePassword = mutation({
  args: {
    sessionToken: v.string(),
    currentPasswordHash: v.string(),
    currentPasswordSalt: v.string(),
    newPasswordHash: v.string(),
    newPasswordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    const valid = await verifyPassword(
      args.currentPasswordHash,
      result.admin.passwordHash,
      result.admin.passwordSalt,
    );
    if (!valid) throw new Error("Invalid current password");

    await ctx.db.patch(result.admin._id, {
      passwordHash: args.newPasswordHash,
      passwordSalt: args.newPasswordSalt,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================================================
// Mutations — Password Reset (Recovery Key)
// ============================================================================

export const resetPassword = mutation({
  args: {
    username: v.string(),
    recoveryKeyHash: v.string(),
    recoveryKeySalt: v.string(),
    newPasswordHash: v.string(),
    newPasswordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!admin) throw new Error("Admin not found");
    if (!admin.recoveryKeyHash || !admin.recoveryKeySalt) {
      throw new Error("No recovery key configured for this account");
    }

    const valid = await verifyPassword(
      args.recoveryKeyHash,
      admin.recoveryKeyHash,
      admin.recoveryKeySalt,
    );
    if (!valid) throw new Error("Invalid recovery key");

    const now = Date.now();

    await ctx.db.patch(admin._id, {
      passwordHash: args.newPasswordHash,
      passwordSalt: args.newPasswordSalt,
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

    // Create new session
    const token = await createSessionToken(admin._id, admin.username, admin.role);
    await ctx.db.insert("adminSessions", {
      adminId: admin._id,
      token,
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
    currentPasswordHash: v.string(),
    currentPasswordSalt: v.string(),
    newRecoveryKeyHash: v.string(),
    newRecoveryKeySalt: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await verifyAdminSession(ctx, args.sessionToken);
    if (!result) throw new Error("Unauthorized");

    const valid = await verifyPassword(
      args.currentPasswordHash,
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
    role: v.union(v.literal("superadmin"), v.literal("admin")),
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
