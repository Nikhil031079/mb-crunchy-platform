import { describe, expect, it } from "vitest";
import {
  amountInWords,
  apportion,
  calculateInvoice,
  financialYear,
  formatInvoiceNumber,
  splitInclusive,
  stateCodeFromName,
  type InvoiceCalcInput,
} from "../../convex/utils/invoiceCalc";

const TS = "36"; // Telangana
const KA = "29"; // Karnataka

function base(overrides: Partial<InvoiceCalcInput> = {}): InvoiceCalcInput {
  return {
    docType: "tax_invoice",
    sellerStateCode: TS,
    placeOfSupplyStateCode: TS,
    lines: [{ name: "Honey", quantity: 2, grossPaise: 21000, hsnCode: "0409", gstRatePercent: 5 }],
    discountPaise: 0,
    deliveryFeePaise: 0,
    expectedTotalPaise: 21000,
    legacyTaxPaise: 0,
    ...overrides,
  };
}

describe("apportion", () => {
  it("always sums exactly to the total", () => {
    expect(apportion(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(apportion(1, [5, 5, 5])).toEqual([1, 0, 0]);
    expect(apportion(0, [5, 5])).toEqual([0, 0]);
  });
  it("never gives a line more than its own weight", () => {
    const out = apportion(299, [100, 100, 100]);
    out.forEach((v) => expect(v).toBeLessThanOrEqual(100));
  });
});

describe("splitInclusive", () => {
  it("carves GST out of an inclusive price", () => {
    expect(splitInclusive(10500, 5)).toEqual({ taxable: 10000, tax: 500 });
    expect(splitInclusive(11800, 18)).toEqual({ taxable: 10000, tax: 1800 });
    expect(splitInclusive(10000, 0)).toEqual({ taxable: 10000, tax: 0 });
  });
  it("handles fractional rates exactly", () => {
    const { taxable, tax } = splitInclusive(100250, 0.25);
    expect(taxable + tax).toBe(100250);
    expect(taxable).toBe(100000);
  });
});

describe("calculateInvoice - tax invoice", () => {
  it("splits into CGST + SGST within the same state", () => {
    const r = calculateInvoice(base());
    expect(r.supplyType).toBe("intra_state");
    const line = r.lines[0]!;
    expect(line.taxableValuePaise).toBe(20000);
    expect(line.cgstPaise).toBe(500);
    expect(line.sgstPaise).toBe(500);
    expect(line.igstPaise).toBe(0);
    expect(r.totals.grandTotalPaise).toBe(21000);
  });

  it("uses IGST across states", () => {
    const r = calculateInvoice(base({ placeOfSupplyStateCode: KA }));
    expect(r.supplyType).toBe("inter_state");
    expect(r.lines[0]!.igstPaise).toBe(1000);
    expect(r.lines[0]!.cgstPaise + r.lines[0]!.sgstPaise).toBe(0);
  });

  it("keeps CGST+SGST equal to total tax even when tax paise is odd", () => {
    const r = calculateInvoice(
      base({ lines: [{ name: "X", quantity: 1, grossPaise: 10001, gstRatePercent: 5 }], expectedTotalPaise: 10001 }),
    );
    const l = r.lines[0]!;
    expect(l.cgstPaise + l.sgstPaise).toBe(l.totalPaise - l.taxableValuePaise);
  });

  it("spreads the order discount across lines and still reconciles", () => {
    const r = calculateInvoice(
      base({
        lines: [
          { name: "A", quantity: 1, grossPaise: 10000, gstRatePercent: 5 },
          { name: "B", quantity: 1, grossPaise: 30000, gstRatePercent: 18 },
        ],
        discountPaise: 4000,
        expectedTotalPaise: 36000,
      }),
    );
    expect(r.lines[0]!.totalPaise).toBe(9000);
    expect(r.lines[1]!.totalPaise).toBe(27000);
    expect(r.totals.grandTotalPaise).toBe(36000);
  });

  it("taxes delivery at the highest rate among the goods", () => {
    const r = calculateInvoice(
      base({
        lines: [
          { name: "A", quantity: 1, grossPaise: 10000, gstRatePercent: 0 },
          { name: "B", quantity: 1, grossPaise: 10000, gstRatePercent: 18 },
        ],
        deliveryFeePaise: 5900,
        expectedTotalPaise: 25900,
      }),
    );
    const delivery = r.lines.find((l) => l.kind === "delivery")!;
    expect(delivery.ratePercent).toBe(18);
    expect(delivery.taxableValuePaise).toBe(5000);
    expect(r.totals.grandTotalPaise).toBe(25900);
  });

  it("invariants hold for 500 random orders", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const rates = [0, 0.25, 3, 5, 12, 18, 28, 40];
    for (let n = 0; n < 500; n++) {
      const count = 1 + Math.floor(rnd() * 5);
      const lines = Array.from({ length: count }, (_, i) => ({
        name: `L${i}`,
        quantity: 1 + Math.floor(rnd() * 4),
        grossPaise: 100 + Math.floor(rnd() * 500000),
        gstRatePercent: rates[Math.floor(rnd() * rates.length)]!,
      }));
      const gross = lines.reduce((s, l) => s + l.grossPaise, 0);
      const discountPaise = Math.floor(rnd() * gross * 0.5);
      const deliveryFeePaise = Math.floor(rnd() * 20000);
      const expectedTotalPaise = gross - discountPaise + deliveryFeePaise;
      const r = calculateInvoice({
        docType: "tax_invoice",
        sellerStateCode: TS,
        placeOfSupplyStateCode: rnd() < 0.5 ? TS : KA,
        lines,
        discountPaise,
        deliveryFeePaise,
        expectedTotalPaise,
        legacyTaxPaise: 0,
      });
      expect(r.totals.grandTotalPaise).toBe(expectedTotalPaise);
      for (const l of r.lines) {
        expect(l.taxableValuePaise + l.cgstPaise + l.sgstPaise + l.igstPaise).toBe(l.totalPaise);
        expect(l.taxableValuePaise).toBeGreaterThanOrEqual(0);
      }
      expect(r.totals.taxableValuePaise + r.totals.totalTaxPaise).toBe(expectedTotalPaise);
    }
  });
});

describe("calculateInvoice - bill of supply", () => {
  it("charges no tax and needs no GST rates or seller state", () => {
    const r = calculateInvoice({
      docType: "bill_of_supply",
      lines: [{ name: "Jaggery", quantity: 1, grossPaise: 15000 }],
      discountPaise: 0,
      deliveryFeePaise: 4000,
      expectedTotalPaise: 19000,
      legacyTaxPaise: 0,
    });
    expect(r.supplyType).toBe("not_applicable");
    expect(r.totals.totalTaxPaise).toBe(0);
    expect(r.totals.grandTotalPaise).toBe(19000);
  });
});

describe("calculateInvoice - refuses to guess", () => {
  it("names the items that have no GST rate", () => {
    expect(() =>
      calculateInvoice(base({ lines: [{ name: "Mystery Snack", quantity: 1, grossPaise: 21000 }] })),
    ).toThrow(/Mystery Snack/);
  });
  it("requires the seller state and delivery state for tax invoices", () => {
    expect(() => calculateInvoice(base({ sellerStateCode: undefined }))).toThrow(/Seller state/);
    expect(() => calculateInvoice(base({ placeOfSupplyStateCode: undefined }))).toThrow(/Delivery state/);
  });
  it("rejects orders that were charged a legacy flat tax", () => {
    expect(() => calculateInvoice(base({ legacyTaxPaise: 500 }))).toThrow(/flat tax/);
  });
  it("rejects amounts that do not reconcile with the order total", () => {
    expect(() => calculateInvoice(base({ expectedTotalPaise: 25000 }))).toThrow(/reconcile/);
  });
  it("rejects empty orders and bad quantities", () => {
    expect(() => calculateInvoice(base({ lines: [] }))).toThrow();
    expect(() =>
      calculateInvoice(base({ lines: [{ name: "A", quantity: 0, grossPaise: 100, gstRatePercent: 5 }], expectedTotalPaise: 100 })),
    ).toThrow(/quantity/);
  });
});

describe("stateCodeFromName", () => {
  it("resolves common spellings", () => {
    expect(stateCodeFromName("Telangana")).toBe("36");
    expect(stateCodeFromName("  tamil nadu ")).toBe("33");
    expect(stateCodeFromName("Orissa")).toBe("21");
    expect(stateCodeFromName("Jammu & Kashmir")).toBe("01");
    expect(stateCodeFromName("NCT of Delhi")).toBe("07");
  });
  it("returns undefined rather than guessing", () => {
    expect(stateCodeFromName("Atlantis")).toBeUndefined();
    expect(stateCodeFromName("")).toBeUndefined();
    expect(stateCodeFromName(undefined)).toBeUndefined();
  });
});

describe("financialYear (IST)", () => {
  it("rolls over at midnight IST on 1 April", () => {
    expect(financialYear(Date.parse("2026-03-31T18:29:59Z")).label).toBe("2025-26");
    expect(financialYear(Date.parse("2026-03-31T18:30:00Z")).label).toBe("2026-27");
    expect(financialYear(Date.parse("2026-10-19T08:00:00Z"))).toEqual({ label: "2026-27", short: "2627" });
  });
});

describe("formatInvoiceNumber", () => {
  it("stays within the 16-character GST limit at the maximum prefix", () => {
    const tax = formatInvoiceNumber({ prefix: "ABCD", docType: "tax_invoice", fyShort: "2627", sequence: 999999 });
    const bos = formatInvoiceNumber({ prefix: "ABCD", docType: "bill_of_supply", fyShort: "2627", sequence: 99999 });
    expect(tax).toBe("ABCD/2627/999999");
    expect(bos).toBe("ABCDB/2627/99999");
    expect(tax.length).toBeLessThanOrEqual(16);
    expect(bos.length).toBeLessThanOrEqual(16);
  });
  it("defaults the prefix and separates the series", () => {
    expect(formatInvoiceNumber({ docType: "tax_invoice", fyShort: "2627", sequence: 1 })).toBe("INV/2627/000001");
    expect(formatInvoiceNumber({ docType: "bill_of_supply", fyShort: "2627", sequence: 1 })).toBe("INVB/2627/00001");
  });
  it("refuses to overflow a series", () => {
    expect(() => formatInvoiceNumber({ docType: "tax_invoice", fyShort: "2627", sequence: 1000000 })).toThrow();
    expect(() => formatInvoiceNumber({ docType: "tax_invoice", fyShort: "2627", sequence: 0 })).toThrow();
  });
});

describe("amountInWords", () => {
  it("uses Indian numbering", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(123456)).toBe("Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only");
    expect(amountInWords(1000000000)).toBe("Rupees One Crore Only");
    expect(amountInWords(15000000)).toBe("Rupees One Lakh Fifty Thousand Only");
  });
});
