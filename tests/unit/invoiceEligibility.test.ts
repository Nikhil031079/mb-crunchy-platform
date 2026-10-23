import { describe, expect, it } from "vitest";
import { invoiceBlockReason } from "../../convex/invoices";

type Args = Parameters<typeof invoiceBlockReason>[0];
const order = (o: Partial<Args>): Args => ({ status: "confirmed", paymentStatus: "paid", paymentMethod: "razorpay", ...o }) as Args;

describe("invoiceBlockReason", () => {
  it("allows paid orders", () => {
    expect(invoiceBlockReason(order({}))).toBeNull();
    expect(invoiceBlockReason(order({ status: "delivered" }))).toBeNull();
  });

  it("blocks unpaid and awaiting-payment orders", () => {
    expect(invoiceBlockReason(order({ paymentStatus: "pending", status: "awaiting_payment" }))).toMatch(/payment/i);
    expect(invoiceBlockReason(order({ paymentStatus: "pending" }))).toMatch(/payment/i);
    expect(invoiceBlockReason(order({ paymentStatus: "failed" }))).toMatch(/payment/i);
  });

  it("never invoices cancelled or refunded orders, even if they were paid", () => {
    expect(invoiceBlockReason(order({ status: "cancelled" }))).toMatch(/cancelled or refunded/i);
    expect(invoiceBlockReason(order({ status: "refunded" }))).toMatch(/cancelled or refunded/i);
    expect(invoiceBlockReason(order({ paymentStatus: "refunded" }))).toMatch(/cancelled or refunded/i);
  });

  it("allows COD only once the order is confirmed or later", () => {
    const cod = { paymentMethod: "cod", paymentStatus: "pending" } as Partial<Args>;
    expect(invoiceBlockReason(order({ ...cod, status: "pending" }))).not.toBeNull();
    expect(invoiceBlockReason(order({ ...cod, status: "confirmed" }))).toBeNull();
    expect(invoiceBlockReason(order({ ...cod, status: "out_for_delivery" }))).toBeNull();
    expect(invoiceBlockReason(order({ ...cod, status: "cancelled" }))).not.toBeNull();
  });
});
