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
      lastLoginAt: s.lastLoginAt,
      createdAt: s.createdAt,
    }));
  },
});