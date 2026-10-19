// ============================================================================
// MB CRUNCHY - Business profile validation (GST / FSSAI / invoice settings)
//
// Pure functions only (no Convex or React imports) so the same code runs in the
// backend mutation, the admin form and unit tests.
// ============================================================================

/** GST state / UT codes (first two digits of a GSTIN). */
export const GST_STATES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export interface BusinessProfileInput {
  legalName?: string;
  gstin?: string;
  stateCode?: string;
  registeredAddress?: string;
  fssaiNumber?: string;
  invoicePrefix?: string;
}

export type InvoiceMode = "tax_invoice" | "bill_of_supply";

const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHECKSUM_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeGstin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Computes the GSTIN check character for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHECKSUM_CHARS.indexOf(first14[i]!) * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(value / 36) + (value % 36);
  }
  return CHECKSUM_CHARS[(36 - (total % 36)) % 36]!;
}

export type GstinResult =
  | { ok: true; gstin: string; stateCode: string }
  | { ok: false; error: string };

export function validateGstin(raw: string): GstinResult {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15) {
    return { ok: false, error: "GSTIN must be exactly 15 characters" };
  }
  if (!GSTIN_FORMAT.test(gstin)) {
    return { ok: false, error: "GSTIN format is invalid" };
  }
  const stateCode = gstin.slice(0, 2);
  if (!GST_STATES[stateCode]) {
    return { ok: false, error: "GSTIN has an unknown state code" };
  }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, error: "GSTIN check digit does not match - please re-check the number" };
  }
  return { ok: true, gstin, stateCode };
}

/** FSSAI licence / registration numbers are 14 digits. */
export function validateFssai(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.replace(/[\s-]+/g, "");
  if (!/^[0-9]{14}$/.test(value)) {
    return { ok: false, error: "FSSAI number must be exactly 14 digits" };
  }
  return { ok: true, value };
}

export function validateInvoicePrefix(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,8}$/.test(value)) {
    return { ok: false, error: "Invoice prefix must be 1-8 letters, digits or hyphens" };
  }
  return { ok: true, value };
}

/** Invoices are tax invoices only once a valid GSTIN is on file. */
export function deriveInvoiceMode(profile: { gstin?: string } | null | undefined): InvoiceMode {
  return profile?.gstin && validateGstin(profile.gstin).ok ? "tax_invoice" : "bill_of_supply";
}

/**
 * Validates and cleans a profile from the admin form. Blank fields are dropped.
 * Throws an Error with a user-readable message on invalid input.
 */
export function normalizeBusinessProfile(input: BusinessProfileInput): BusinessProfileInput {
  const out: BusinessProfileInput = {};

  const legalName = input.legalName?.trim();
  if (legalName) out.legalName = legalName.slice(0, 120);

  const registeredAddress = input.registeredAddress?.trim();
  if (registeredAddress) out.registeredAddress = registeredAddress.slice(0, 300);

  const stateCode = input.stateCode?.trim();
  if (stateCode) {
    if (!GST_STATES[stateCode]) throw new Error("Unknown state code");
    out.stateCode = stateCode;
  }

  const gstinRaw = input.gstin?.trim();
  if (gstinRaw) {
    const result = validateGstin(gstinRaw);
    if (!result.ok) throw new Error(result.error);
    if (out.stateCode && out.stateCode !== result.stateCode) {
      throw new Error(
        `GSTIN belongs to ${GST_STATES[result.stateCode]}, but the selected state is ${GST_STATES[out.stateCode]}`,
      );
    }
    out.gstin = result.gstin;
    out.stateCode = result.stateCode;
  }

  const fssaiRaw = input.fssaiNumber?.trim();
  if (fssaiRaw) {
    const result = validateFssai(fssaiRaw);
    if (!result.ok) throw new Error(result.error);
    out.fssaiNumber = result.value;
  }

  const prefixRaw = input.invoicePrefix?.trim();
  if (prefixRaw) {
    const result = validateInvoicePrefix(prefixRaw);
    if (!result.ok) throw new Error(result.error);
    out.invoicePrefix = result.value;
  }

  return out;
}
