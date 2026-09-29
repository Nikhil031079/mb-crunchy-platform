// ============================================================================
// MB CRUNCHY — 19B Admin Data-Configuration Correctness Tests
//
// Narrow correctness phase for three confirmed 19A admin operational issues:
//  1. Banner/Announcement edit silently discards BU + Type (UI implied editable,
//     update args + backend contract ignore them).
//  2. Flash Sale create silently drops homepage-visibility settings.
//  3. Inactive Shipping Zones can be assigned to Mart Pincodes.
//
// Server checks run against the real martPincodeServiceability.create/update
// handlers with a fake ctx (same approach as 10C/10I/17B/17C/18B). Client
// checks use the repo's readSource structural convention (tests 43/45)
// plus the real toPincodeFormValues hydration function.
//
// RUN: SESSION_SECRET=<32+ char test secret> vitest run tests/19b_admin_data_configuration_correctness.test.ts
// (SESSION_SECRET is required at import time by convex/utils/crypto.ts.)
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { create, update } from "../convex/martPincodeServiceability";
import { toPincodeFormValues } from "../src/pages/admin/MartPincodeServiceabilityPage";
import { validateFlashSaleValues } from "../src/pages/admin/FlashSalesPage";
import {
  createSessionToken,
  sha256Hex,
} from "../convex/utils/crypto";

type Row = Record<string, unknown> & { _id: string };
type Pred = (row: Row) => boolean;
const isFieldRef = (v: unknown): v is { __field: string } =>
  typeof v === "object" && v !== null && "__field" in (v as object);

function makeDb(seed: {
  businessUnits?: Row[];
  shippingZones?: Row[];
  martPincodeServiceability?: Row[];
  admins?: Row[];
  adminSessions?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    businessUnits: [...(seed.businessUnits ?? [])],
    shippingZones: [...(seed.shippingZones ?? [])],
    martPincodeServiceability: [...(seed.martPincodeServiceability ?? [])],
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

async function seedAdminSession(
  tables: Record<string, Row[]>,
  opts: { adminId?: string; username?: string; role?: string } = {}
) {
  const adminId = opts.adminId ?? "admin_1";
  const username = opts.username ?? "owner";
  const role = opts.role ?? "admin";
  tables["admins"].push({
    _id: adminId,
    username,
    role,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const token = await createSessionToken(adminId, username, role);
  tables["adminSessions"].push({
    _id: `sess_${adminId}`,
    adminId,
    tokenHash: await sha256Hex(token),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  });
  return token;
}

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8");
}

function seedShippingWorld() {
  const now = Date.now();
  return {
    businessUnits: [
      { _id: "bu_1", name: "Mart One", createdAt: now, updatedAt: now } as Row,
      { _id: "bu_2", name: "Mart Two", createdAt: now, updatedAt: now } as Row,
    ],
    shippingZones: [
      { _id: "zone_active", businessUnitId: "bu_1", name: "Active Zone", status: "active", createdAt: now, updatedAt: now } as Row,
      { _id: "zone_inactive", businessUnitId: "bu_1", name: "Inactive Zone", status: "inactive", createdAt: now, updatedAt: now } as Row,
      { _id: "zone_deleted", businessUnitId: "bu_1", name: "Deleted Zone", status: "active", createdAt: now, updatedAt: now, deletedAt: now } as Row,
      { _id: "zone_other_bu", businessUnitId: "bu_2", name: "Other BU Zone", status: "active", createdAt: now, updatedAt: now } as Row,
    ],
  };
}

// ============================================================================
// 19B-1 — Banner / Announcement edit: BU + Type immutable
// ============================================================================

describe("19B-1 — banner/announcement edit keeps BU + Type immutable", () => {
  it("create keeps BU/type editable (disabled only when editing)", () => {
    const dialog = readSource("src/components/admin/banners/BannerFormDialog.tsx");
    // BU select is disabled conditionally on edit — create path stays enabled.
    expect(dialog).toContain("disabled={isEditing}");
    // Type select preserves the HappyHour lock AND the edit guard.
    expect(dialog).toContain("disabled={Boolean(lockContentType) || isEditing}");
    // The selects themselves still exist (create path renders them enabled).
    expect(dialog).toContain("Business Unit (optional)");
    expect(dialog).toContain("Content Type");
  });

  it("edit renders BU/type disabled with a fixed-after-creation note", () => {
    const dialog = readSource("src/components/admin/banners/BannerFormDialog.tsx");
    expect(dialog).toContain("Business unit is fixed after creation and cannot be changed.");
    expect(dialog).toContain("Content type is fixed after creation and cannot be changed.");
  });

  it("edit does not imply BU/type can be changed (update omits them, create keeps them)", () => {
    const banners = readSource("src/pages/admin/BannersPage.tsx");
    const happy = readSource("src/pages/admin/HappyHourPage.tsx");
    for (const src of [banners, happy]) {
      const updateBlock = src.slice(src.indexOf("function toUpdateArgs"), src.indexOf("/* eslint-enable"));
      expect(updateBlock).not.toContain("businessUnitId");
      expect(updateBlock).not.toContain("contentType");
      const createBlock = src.slice(src.indexOf("function toCreateArgs"), src.indexOf("function toUpdateArgs"));
      expect(createBlock).toContain("businessUnitId");
      expect(createBlock).toContain("contentType");
    }
    // Backend contract unchanged: update args still do not accept BU/type.
    const backend = readSource("convex/content.ts");
    const backendUpdate = backend.slice(backend.indexOf("export const update"), backend.indexOf("export const softDelete"));
    const backendArgs = backendUpdate.slice(backendUpdate.indexOf("args: {"), backendUpdate.indexOf("handler:"));
    expect(backendArgs).not.toContain("businessUnitId");
    expect(backendArgs).not.toContain("contentType");
  });
});

// ============================================================================
// 19B-2 — Flash Sale create preserves homepage visibility
// ============================================================================

describe("19B-2 — flash-sale create preserves homepage visibility", () => {
  it("create and update share the same visibility mapping", () => {
    const page = readSource("src/pages/admin/FlashSalesPage.tsx");
    expect(page).toContain("function toSettingsArgs");
    const settingsBlock = page.slice(page.indexOf("function toSettingsArgs"), page.indexOf("function toUpdateArgs"));
    expect(settingsBlock).toContain("values.featured");
    expect(settingsBlock).toContain("!values.homeVisible");
    expect(settingsBlock).toContain("!values.categoryVisible");
    expect(settingsBlock).toContain("values.isFlashSale");
    expect(settingsBlock).toContain("values.flashSalePriority");
    expect(settingsBlock).toContain("values.flashSaleFeatured");
    const createBlock = page.slice(page.indexOf("function toCreateArgs"), page.indexOf("export default function FlashSalesPage"));
    const updateBlock = page.slice(page.indexOf("function toUpdateArgs"), page.indexOf("function toCreateArgs"));
    expect(createBlock).toContain("settings: toSettingsArgs(values)");
    expect(updateBlock).toContain("settings: toSettingsArgs(values)");
    expect(updateBlock).not.toContain("applicableCatalogItemIds:");
    expect(updateBlock).not.toContain("applicableCategoryIds:");
  });

  it("17C flash-sale behavior remains intact", () => {
    const page = readSource("src/pages/admin/FlashSalesPage.tsx");
    // Create still seeds empty targeting; update still omits targeting keys.
    const createBlock = page.slice(page.indexOf("function toCreateArgs"), page.indexOf("export default function FlashSalesPage"));
    expect(createBlock).toContain("applicableCatalogItemIds: []");
    expect(createBlock).toContain("applicableCategoryIds: []");
    const updateBlock = page.slice(page.indexOf("function toUpdateArgs"), page.indexOf("function toCreateArgs"));
    expect(updateBlock).not.toContain("applicableCatalogItemIds:");
    expect(updateBlock).not.toContain("applicableCategoryIds:");
    // Lifecycle validation, flash default, pagination, and save guard untouched.
    expect(page).toContain("validateFlashSaleValues");
    expect(page).toContain("defaultFlashSale");
    expect(page).toContain("const PAGE_SIZE = 8;");
    expect(page).toContain("if (isSaving) return;");
    expect(validateFlashSaleValues({
      businessUnitId: "bu_1",
      title: "Flash",
      description: "",
      code: "",
      discountType: "percentage",
      discountValue: 20,
      minOrderValue: "",
      maxDiscount: "",
      startsAt: "2026-10-01T10:00",
      endsAt: "2026-10-02T10:00",
      usageLimit: "",
      status: "active",
      displayOrder: 1,
      banner: "",
      featured: true,
      homeVisible: false,
      categoryVisible: false,
      isFlashSale: true,
      flashSalePriority: 5,
      flashSaleFeatured: true,
    } as Parameters<typeof validateFlashSaleValues>[0])).toBeNull();
  });
});

// ============================================================================
// 19B-3 — Mart pincode: inactive zones rejected (server) + honest UI
// ============================================================================

describe("19B-3 — server rejects inactive/deleted/wrong-BU zones", () => {
  it("active zone accepted; no-zone behavior preserved", async () => {
    const { db, tables } = makeDb(seedShippingWorld());
    const token = await seedAdminSession(tables);
    const withZone = (await invoke(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400001",
      status: "active",
      shippingZoneId: "zone_active",
    })) as string;
    expect(typeof withZone).toBe("string");
    expect((await db.get(withZone))!.shippingZoneId).toBe("zone_active");
    const withoutZone = (await invoke(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400002",
      status: "active",
    })) as string;
    expect((await db.get(withoutZone))!.shippingZoneId).toBeUndefined();
  });

  it("inactive zone rejected on create and update", async () => {
    const { db, tables } = makeDb(seedShippingWorld());
    const token = await seedAdminSession(tables);
    await expectThrows(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400003",
      status: "active",
      shippingZoneId: "zone_inactive",
    }, /inactive/);
    const id = (await invoke(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400004",
      status: "active",
      shippingZoneId: "zone_active",
    })) as string;
    await expectThrows(update, db, {
      sessionToken: token,
      id,
      status: "active",
      shippingZoneId: "zone_inactive",
    }, /inactive/);
    // Failed update leaves the stored active assignment untouched.
    expect((await db.get(id))!.shippingZoneId).toBe("zone_active");
  });

  it("deleted zone rejected; wrong-BU zone rejected", async () => {
    const { db, tables } = makeDb(seedShippingWorld());
    const token = await seedAdminSession(tables);
    await expectThrows(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400005",
      status: "active",
      shippingZoneId: "zone_deleted",
    }, /not found/);
    await expectThrows(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400006",
      status: "active",
      shippingZoneId: "zone_other_bu",
    }, /does not belong/);
    const id = (await invoke(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400007",
      status: "active",
    })) as string;
    await expectThrows(update, db, {
      sessionToken: token,
      id,
      status: "active",
      shippingZoneId: "zone_other_bu",
    }, /does not belong/);
  });

  it("update without a zone still succeeds (None preserved)", async () => {
    const { db, tables } = makeDb(seedShippingWorld());
    const token = await seedAdminSession(tables);
    const id = (await invoke(create, db, {
      sessionToken: token,
      businessUnitId: "bu_1",
      pincode: "400008",
      status: "active",
    })) as string;
    await invoke(update, db, { sessionToken: token, id, status: "inactive" });
    const after = (await db.get(id))!;
    expect(after.status).toBe("inactive");
    expect(after.shippingZoneId).toBeUndefined();
  });
});

describe("19B-3 — client shows only active zones and handles stale assignments honestly", () => {
  it("dropdown filters to non-deleted ACTIVE zones and preserves None", () => {
    const page = readSource("src/pages/admin/MartPincodeServiceabilityPage.tsx");
    expect(page).toContain("activeZoneList");
    expect(page).toContain('z.status === "active"');
    expect(page).toContain("zones={activeZoneList}");
    expect(page).toContain('<SelectItem value="none">None</SelectItem>');
    expect(page).toContain("Only active zones can be assigned.");
  });

  it("edit of an existing inactive-zone record is honest (no silent replacement)", () => {
    const page = readSource("src/pages/admin/MartPincodeServiceabilityPage.tsx");
    // Stale assignment is preserved and rendered as a disabled unavailable option.
    expect(page).toContain("staleZoneId");
    expect(page).toContain("(inactive — unavailable)");
    expect(page).toContain("Choose an active zone or None before saving.");
    // Table distinguishes inactive/unavailable assignments instead of hiding them.
    expect(page).toContain("(inactive)");
    expect(page).toContain("Unavailable zone");
    // Hydration keeps the stored zone id verbatim for the edit form.
    expect(
      toPincodeFormValues({
        id: "pin_1",
        businessUnitId: "bu_1",
        pincode: "400001",
        status: "active",
        shippingZoneId: "zone_inactive",
        shippingZoneName: "Inactive Zone",
        shippingZoneStatus: "inactive",
      }).shippingZoneId
    ).toBe("zone_inactive");
  });
});
