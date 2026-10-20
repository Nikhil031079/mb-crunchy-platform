// ============================================================================
// MB CRUNCHY - Invoices
//
// One immutable invoice per order, created on demand once the order is paid
// (or confirmed COD). Numbers are allocated inside the same transaction that
// creates the invoice, so a failure never burns a number (no gaps) and two
// simultaneous requests can never receive the same number.
//
// Before a GSTIN is on file, documents are "Bill of Supply" (no GST). After a
// valid GSTIN is saved, new documents are GST "Tax Invoice"s. Existing
// invoices are never rewritten.
// ============================================================================

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdminSession } from "./utils/adminAuth";
import { canReadCustomerData } from "./utils/customerAccess";
import { deriveInvoiceMode } from "./utils/businessProfile";
import {
  calculateInvoice,
  financialYear,
  formatInvoiceNumber,
  rupeesToPaise,
  stateCodeFromName,
  type InvoiceLineInput,
} from "./utils/invoiceCalc";

const COD_INVOICEABLE_STATUSES = ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

/** Returns null when an invoice may be issued, otherwise a customer-readable reason. */
export function invoiceBlockReason(order: Pick<Doc<"orders">, "status" | "paymentStatus" | "paymentMethod">): string | null {
  if (order.status === "cancelled" || order.status === "refunded" || order.paymentStatus === "refunded") {
    return "No invoice is issued for cancelled or refunded orders.";
  }
  if (order.status === "awaiting_payment") {
    return "Invoice will be available once payment is received.";
  }
  if (order.paymentStatus === "paid") return null;
  if (order.paymentMethod === "cod" && COD_INVOICEABLE_STATUSES.includes(order.status)) return null;
  return "Invoice will be available once payment is received.";
}

async function assertCanAccessOrder(
  ctx: any,
  order: Doc<"orders">,
  sessionToken: string | undefined,
): Promise<void> {
  if (sessionToken) {
    await requireAdminSession(ctx, sessionToken);
    return;
  }
  if (!order.customerId) {
    throw new Error("Please sign in to view this invoice, or ask the shop to send it.");
  }
  const allowed = await canReadCustomerData(ctx, { customerId: order.customerId });
  if (!allowed) throw new Error("You do not have access to this invoice.");
}

async function findOrder(ctx: any, orderNumber: string): Promise<Doc<"orders"> | null> {
  const order = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q: any) => q.eq("orderNumber", orderNumber))
    .first();
  return order && !order.deletedAt ? order : null;
}

async function findInvoice(ctx: any, orderId: Doc<"orders">["_id"]): Promise<Doc<"invoices"> | null> {
  return await ctx.db
    .query("invoices")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .first();
}

// ----------------------------------------------------------------------------
// Query: what can the caller see for this order?
// ----------------------------------------------------------------------------

export const getForOrder = query({
  args: { orderNumber: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const order = await findOrder(ctx, args.orderNumber);
    if (!order) return { status: "not_found" as const };

    try {
      await assertCanAccessOrder(ctx, order, args.sessionToken);
    } catch {
      // Never reveal whether the order exists to someone without access.
      return { status: "forbidden" as const };
    }

    const invoice = await findInvoice(ctx, order._id);
    if (invoice) return { status: "issued" as const, invoice };

    const reason = invoiceBlockReason(order);
    return { status: "not_issued" as const, canIssue: reason === null, reason: reason ?? undefined };
  },
});

// ----------------------------------------------------------------------------
// Mutation: issue (idempotent)
// ----------------------------------------------------------------------------

export const issueForOrder = mutation({
  args: { orderNumber: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const order = await findOrder(ctx, args.orderNumber);
    if (!order) throw new Error("Order not found");
    await assertCanAccessOrder(ctx, order, args.sessionToken);

    const existing = await findInvoice(ctx, order._id);
    if (existing) return existing._id;

    const reason = invoiceBlockReason(order);
    if (reason) throw new Error(reason);

    const settings = await ctx.db
      .query("globalSettings")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
    const profile = settings?.businessProfile ?? {};
    const docType = deriveInvoiceMode(profile);
    const taxMode = docType === "tax_invoice";

    // Place of supply: the delivery state. Pickup and local kitchen delivery
    // are supplied in the seller's own state.
    let placeOfSupplyStateCode: string | undefined;
    if (taxMode) {
      if (order.destinationState) {
        placeOfSupplyStateCode = stateCodeFromName(order.destinationState);
        if (!placeOfSupplyStateCode) {
          throw new Error(`Cannot determine the GST state for "${order.destinationState}".`);
        }
      } else if (order.deliveryType === "outside_area") {
        throw new Error("This order has no delivery state, so its GST type cannot be determined.");
      } else {
        placeOfSupplyStateCode = profile.stateCode;
      }
    }

    // Resolve tax data for each line from the catalog item it was sold from.
    const lines: InvoiceLineInput[] = [];
    for (const item of order.items) {
      const catalogItem = (await ctx.db.get(item.catalogItemId)) as Doc<"catalogItems"> | null;
      lines.push({
        name: item.name,
        variantName: item.variantName,
        quantity: item.quantity,
        grossPaise: rupeesToPaise(item.totalPrice),
        hsnCode: catalogItem?.hsnCode,
        gstRatePercent: catalogItem?.gstRatePercent,
      });
    }

    const calc = calculateInvoice({
      docType,
      sellerStateCode: profile.stateCode,
      placeOfSupplyStateCode,
      lines,
      discountPaise: rupeesToPaise(order.discount),
      deliveryFeePaise: rupeesToPaise(order.deliveryFee),
      expectedTotalPaise: rupeesToPaise(order.total),
      legacyTaxPaise: rupeesToPaise(order.tax),
    });

    // Allocate the next number in this transaction. If anything below throws,
    // the whole mutation rolls back and the number is not consumed.
    const now = Date.now();
    const fy = financialYear(now);
    const counterKey = `${fy.label}:${docType}`;
    const counter = await ctx.db
      .query("invoiceCounters")
      .withIndex("by_key", (q) => q.eq("key", counterKey))
      .first();
    const sequence = (counter?.lastSequence ?? 0) + 1;
    if (counter) {
      await ctx.db.patch(counter._id, { lastSequence: sequence, updatedAt: now });
    } else {
      await ctx.db.insert("invoiceCounters", { key: counterKey, lastSequence: sequence, updatedAt: now });
    }

    const invoiceNumber = formatInvoiceNumber({
      prefix: profile.invoicePrefix,
      docType,
      fyShort: fy.short,
      sequence,
    });

    return await ctx.db.insert("invoices", {
      orderId: order._id,
      orderNumber: order.orderNumber,
      invoiceNumber,
      docType,
      financialYear: fy.label,
      issuedAt: now,
      seller: {
        siteName: settings?.siteName ?? "MB Crunchy",
        legalName: profile.legalName,
        gstin: taxMode ? profile.gstin : undefined,
        address: profile.registeredAddress,
        stateCode: profile.stateCode,
        fssaiNumber: profile.fssaiNumber,
      },
      buyer: {
        name: order.customerName,
        phone: order.customerPhone,
        email: order.customerEmail,
        address: order.deliveryAddress,
        stateName: order.destinationState,
        stateCode: placeOfSupplyStateCode,
      },
      supplyType: calc.supplyType,
      placeOfSupplyStateCode,
      lines: calc.lines,
      totals: calc.totals,
      paymentMethod: order.paymentMethod,
      createdAt: now,
    });
  },
});
