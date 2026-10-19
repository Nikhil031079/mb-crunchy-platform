import { describe, expect, it } from "vitest";
import {
  deriveInvoiceMode,
  gstinCheckChar,
  normalizeBusinessProfile,
  validateFssai,
  validateGstin,
} from "../../convex/utils/businessProfile";

// Real-format GSTINs with correct check characters.
const VALID_MAHARASHTRA = "27AAPFU0939F1ZV";
const VALID_KARNATAKA = "29AAGCB7383J1Z4";

describe("validateGstin", () => {
  it("accepts valid GSTINs and returns the state code", () => {
    expect(validateGstin(VALID_MAHARASHTRA)).toEqual({ ok: true, gstin: VALID_MAHARASHTRA, stateCode: "27" });
    expect(validateGstin(VALID_KARNATAKA).ok).toBe(true);
  });

  it("normalizes case and whitespace", () => {
    const result = validateGstin(" 27aapfu0939f1zv ");
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    const result = validateGstin("27AAPFU0939F1ZA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/check digit/i);
  });

  it("rejects wrong length and bad format", () => {
    expect(validateGstin("27AAPFU0939F1Z").ok).toBe(false);
    expect(validateGstin("ABCDEFGHIJKLMNO").ok).toBe(false);
  });

  it("rejects an unknown state code even if the checksum is right", () => {
    const body = "99AAPFU0939F1Z";
    const forged = body + gstinCheckChar(body);
    const result = validateGstin(forged);
    expect(result.ok).toBe(false);
  });
});

describe("validateFssai", () => {
  it("accepts exactly 14 digits (ignoring spaces and hyphens)", () => {
    expect(validateFssai("1234 5678-901234")).toEqual({ ok: true, value: "12345678901234" });
  });
  it("rejects other lengths and non-digits", () => {
    expect(validateFssai("1234567890123").ok).toBe(false);
    expect(validateFssai("123456789012345").ok).toBe(false);
    expect(validateFssai("1234567890123A").ok).toBe(false);
  });
});

describe("deriveInvoiceMode", () => {
  it("is bill_of_supply with no GSTIN or an invalid one", () => {
    expect(deriveInvoiceMode(undefined)).toBe("bill_of_supply");
    expect(deriveInvoiceMode({})).toBe("bill_of_supply");
    expect(deriveInvoiceMode({ gstin: "27AAPFU0939F1ZA" })).toBe("bill_of_supply");
  });
  it("switches to tax_invoice once a valid GSTIN exists", () => {
    expect(deriveInvoiceMode({ gstin: VALID_MAHARASHTRA })).toBe("tax_invoice");
  });
});

describe("normalizeBusinessProfile", () => {
  it("allows a completely blank profile (GST pending)", () => {
    expect(normalizeBusinessProfile({ legalName: "  ", gstin: "", fssaiNumber: "" })).toEqual({});
  });

  it("keeps FSSAI alone when GSTIN is not available yet", () => {
    expect(normalizeBusinessProfile({ fssaiNumber: "12345678901234", stateCode: "36" })).toEqual({
      fssaiNumber: "12345678901234",
      stateCode: "36",
    });
  });

  it("derives stateCode from the GSTIN", () => {
    const out = normalizeBusinessProfile({ gstin: VALID_KARNATAKA });
    expect(out.stateCode).toBe("29");
    expect(out.gstin).toBe(VALID_KARNATAKA);
  });

  it("rejects a GSTIN that contradicts the selected state", () => {
    expect(() => normalizeBusinessProfile({ gstin: VALID_MAHARASHTRA, stateCode: "36" })).toThrow(/Maharashtra/);
  });

  it("rejects invalid FSSAI, unknown state and bad prefix", () => {
    expect(() => normalizeBusinessProfile({ fssaiNumber: "123" })).toThrow(/14 digits/);
    expect(() => normalizeBusinessProfile({ stateCode: "00" })).toThrow(/Unknown state/);
    expect(() => normalizeBusinessProfile({ invoicePrefix: "bad prefix!" })).toThrow(/prefix/i);
  });

  it("uppercases the invoice prefix", () => {
    expect(normalizeBusinessProfile({ invoicePrefix: "mbc" }).invoicePrefix).toBe("MBC");
  });
});
