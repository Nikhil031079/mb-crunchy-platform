// ============================================================================
// MB CRUNCHY - Customer Data Access Guards
//
// Shared authorization + projection helpers for customer-owned data
// (orders, addresses, loyalty, activities). Every read that accepts a
// customerId / orderId / userId must go through one of these so a caller can
// only ever see data they own, or data an authenticated admin session is
// allowed to read.
// ============================================================================

import { requireAdminSession } from "./adminAuth";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Authorization
// ============================================================================

/**
 * Decide whether a caller may read another entity's customer-scoped data.
 *
 * - When a `sessionToken` is supplied it MUST be a valid admin session;
 *   `requireAdminSession` throws otherwise, so admin reads fail loudly.
 * - Without a session token the caller is only allowed when the customer
 *   document is explicitly linked to the signed-in identity
 *   (`customer.authUserId === identity.subject`).
 *
 * Returns `true` when access is granted, `false` when the caller is a
 * signed-in user who does not own the customer (queries should degrade to an
 * empty / null result rather than leak or crash).
 */
export async function canReadCustomerData(
  ctx: { db: QueryCtx["db"]; auth: QueryCtx["auth"] },
  args: { customerId: Id<"customers">; sessionToken?: string },
): Promise<boolean> {
  if (args.sessionToken) {
    await requireAdminSession(ctx, args.sessionToken);
    return true;
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  const customer = await ctx.db.get(args.customerId);
  if (!customer) return false;

  return customer.authUserId === identity.subject;
}

/**
 * True only when the caller owns `customerId`. Never throws for an
 * unauthenticated / non-owner caller — used by queries that are intentionally
 * public but must not disclose another customer's data (e.g. the guest order
 * tracking lookup, which proves possession via phone + order number).
 */
export async function isCustomerOwner(
  ctx: { db: QueryCtx["db"]; auth: QueryCtx["auth"] },
  customerId: Id<"customers">,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const customer = await ctx.db.get(customerId);
  if (!customer) return false;
  return customer.authUserId === identity.subject;
}

// ============================================================================
// Projection - customer-facing order
// ============================================================================

/**
 * Fields on an order document that must NEVER be returned to a customer-facing
 * view: UPI transaction reference (UTR), delivery address, contact details,
 * internal IDs and internal order metadata. The admin path returns the raw
 * document; everything the storefront receives goes through this projection.
 */
export function sanitizeOrderForCustomer(
  order: Doc<"orders">,
): {
  _id: Id<"orders">;
  _creationTime: number;
  orderNumber: string;
  businessUnitId: Id<"businessUnits">;
  items: Doc<"orders">["items"];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  orderType: "delivery" | "pickup";
  status: Doc<"orders">["status"];
  paymentStatus: Doc<"orders">["paymentStatus"];
  paymentMethod?: string;
  deliveryType?: "local" | "outside_area";
  deliveryQuoteRequired?: boolean;
  deliveryQuoteStatus?: "pending" | "quoted" | "accepted" | "rejected";
  deliveryQuoteAmount?: number;
  deliveryQuoteNotes?: string;
  deliveryQuoteUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
} {
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    orderNumber: order.orderNumber,
    businessUnitId: order.businessUnitId,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryFee: order.deliveryFee,
    tax: order.tax,
    total: order.total,
    orderType: order.orderType,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    deliveryType: order.deliveryType,
    deliveryQuoteRequired: order.deliveryQuoteRequired,
    deliveryQuoteStatus: order.deliveryQuoteStatus,
    deliveryQuoteAmount: order.deliveryQuoteAmount,
    deliveryQuoteNotes: order.deliveryQuoteNotes,
    deliveryQuoteUpdatedAt: order.deliveryQuoteUpdatedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

// ============================================================================
// Projection - storefront inventory
// ============================================================================

/**
 * Fields a storefront may see on an inventory doc. Internal costing / supplier
 * / barcode / shelf-life data stays server-side.
 */
export function sanitizeInventoryForStorefront(
  item: Doc<"inventory">,
): {
  _id: Id<"inventory">;
  _creationTime: number;
  catalogItemId: Id<"catalogItems">;
  businessUnitId: Id<"businessUnits">;
  variantName: string;
  sku?: string;
  stockQuantity: number;
  reservedStock?: number;
  available: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
} {
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    catalogItemId: item.catalogItemId,
    businessUnitId: item.businessUnitId,
    variantName: item.variantName,
    sku: item.sku,
    stockQuantity: item.stockQuantity,
    reservedStock: item.reservedStock,
    available: item.available,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}
