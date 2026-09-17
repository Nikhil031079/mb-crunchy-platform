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

// ============================================================================
// requireAdminRole — requires admin session AND specific role(s)
// ============================================================================

export async function requireAdminRole(ctx: any, sessionToken: string, allowedRoles: string[]) {
  const { admin, payload } = await requireAdminSession(ctx, sessionToken);
  if (!allowedRoles.includes(admin.role)) {
    throw new Error("Insufficient permissions");
  }
  return { admin, payload };
}

// ============================================================================
// filterByBusinessUnitIds — filters a query result by admin's authorized BUs
// Returns all results for superadmin/admin, or only admin.businessUnitIds for kitchen
// ============================================================================

export function filterByBusinessUnitIds(
  ctx: any,
  query: any,
  admin: any,
  businessUnitIdArg: any,
) {
  if (admin.role === "superadmin" || admin.role === "admin") {
    return query.withIndex("by_business_unit", (q: any) => q.eq("businessUnitId", businessUnitIdArg));
  }
  const allowedBUs = admin.businessUnitIds ?? [];
  if (allowedBUs.length === 0) {
    return query.filter((q: any) => q.eq(q.field("_id"), "none"));
  }
  return query.filter((q: any) => q.neq(q.field("businessUnitId"), undefined)).filter((q: any) => {
    let match = false;
    for (const buId of allowedBUs) {
      if (q.field("businessUnitId") === buId) {
        match = true;
        break;
      }
    }
    return match;
  });
}
