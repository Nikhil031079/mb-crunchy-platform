import { verifySessionToken } from "./crypto";

// ============================================================================
// requireAdminSession — reusable admin auth guard for Convex mutations
// Verifies the session token, checks the session exists and is not expired,
// and that the admin is active. Returns admin doc + payload or throws.
// ============================================================================

export async function requireAdminSession(ctx: any, sessionToken: string) {
  const payload = await verifySessionToken(sessionToken);
  if (!payload) throw new Error("Invalid or expired session");

  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q: any) => q.eq("token", sessionToken))
    .first();

  if (!session) throw new Error("Session not found");
  if (session.expiresAt < Date.now()) {
    await ctx.db.delete(session._id);
    throw new Error("Session expired");
  }

  const admin = await ctx.db.get(session.adminId);
  if (!admin || !admin.active) {
    await ctx.db.delete(session._id);
    throw new Error("Admin not found or deactivated");
  }

  return { admin, payload };
}
