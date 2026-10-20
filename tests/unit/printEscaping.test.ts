import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// SECURITY GUARD. The admin print windows are opened with document.write(), so
// any unescaped customer text becomes script running as the admin. This test
// reads the source on purpose: it exists to stop that bug coming back.
const source = readFileSync("src/components/admin/orders/shared.tsx", "utf8");

const CUSTOMER_CONTROLLED = [
  "order.orderNumber",
  "order.businessUnitName",
  "order.customerName",
  "order.customerPhone",
  "order.customerEmail",
  "order.deliveryAddress",
  "order.deliveryNotes",
  "i.name",
  "i.variantName",
];

describe("admin print templates escape customer-controlled text", () => {
  it("imports the HTML escaper", () => {
    expect(source).toMatch(/escapeHtml as esc/);
  });

  for (const field of CUSTOMER_CONTROLLED) {
    it(`never interpolates ${field} raw`, () => {
      expect(source.includes("${" + field + "}")).toBe(false);
    });
  }
});
