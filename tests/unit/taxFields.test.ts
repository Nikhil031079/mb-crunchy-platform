import { describe, expect, it } from "vitest";
import { validateGstRate, validateHsn } from "../../convex/utils/businessProfile";

describe("validateHsn", () => {
  it("accepts 4, 6 and 8 digit codes", () => {
    expect(validateHsn("0409")).toEqual({ ok: true, value: "0409" });
    expect(validateHsn("040900")).toEqual({ ok: true, value: "040900" });
    expect(validateHsn("0409 0000")).toEqual({ ok: true, value: "04090000" });
  });
  it("rejects other lengths and non-digits", () => {
    for (const bad of ["", "409", "04090", "0409000", "040900000", "04A9"]) {
      expect(validateHsn(bad).ok).toBe(false);
    }
  });
});

describe("validateGstRate", () => {
  it("accepts real GST slabs including fractional ones", () => {
    for (const rate of [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40]) {
      expect(validateGstRate(rate)).toEqual({ ok: true, value: rate });
    }
  });
  it("rejects negatives, over 40, NaN and excess decimals", () => {
    for (const bad of [-1, 40.5, 100, NaN, Infinity, 5.12345]) {
      expect(validateGstRate(bad).ok).toBe(false);
    }
  });
});
