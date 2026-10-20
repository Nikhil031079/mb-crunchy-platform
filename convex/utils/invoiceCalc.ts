// ============================================================================
// MB CRUNCHY - Invoice calculation engine (pure functions, no I/O)
//
// All arithmetic is done in integer paise so totals are exact. Prices in this
// shop are tax-INCLUSIVE (MRP style): GST is carved out of the price the
// customer pays, so the grand total never changes because of tax.
// ============================================================================

import { GST_STATES } from "./businessProfile";

export type DocType = "tax_invoice" | "bill_of_supply";

export interface InvoiceLineInput {
  name: string;
  variantName?: string;
  quantity: number;
  /** Line total the customer pays for this line, in paise (tax inclusive). */
  grossPaise: number;
  hsnCode?: string;
  /** GST rate in percent, e.g. 5 or 18. Required for tax invoices. */
  gstRatePercent?: number;
}

export interface InvoiceCalcInput {
  docType: DocType;
  /** Seller's GST state code (required for tax invoices). */
  sellerStateCode?: string;
  /** Place of supply: the delivery state code (seller's state for pickup/local). */
  placeOfSupplyStateCode?: string;
  lines: InvoiceLineInput[];
  /** Order-level discount, in paise, spread across lines proportionally. */
  discountPaise: number;
  deliveryFeePaise: number;
  /** What the order says the customer paid, in paise. Must reconcile. */
  expectedTotalPaise: number;
  /** Legacy flat tax stored on the order, in paise. Must be 0. */
  legacyTaxPaise: number;
}

export interface InvoiceLine {
  kind: "item" | "delivery";
  description: string;
  hsnCode?: string;
  quantity: number;
  ratePercent: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceTotals {
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  grandTotalPaise: number;
}

export interface InvoiceCalcResult {
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  supplyType: "intra_state" | "inter_state" | "not_applicable";
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Splits `total` across `weights` proportionally using largest remainder (exact sum). */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const base = exact.map((e) => Math.floor(e));
  const remainder = total - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < remainder; k++) base[order[k]!.i] = base[order[k]!.i]! + 1;
  return base;
}

/** Carves GST out of a tax-inclusive amount. */
export function splitInclusive(grossPaise: number, ratePercent: number): { taxable: number; tax: number } {
  const ratePermille = Math.round(ratePercent * 1000); // keeps 0.25% etc. exact
  const taxable = Math.round((grossPaise * 100000) / (100000 + ratePermille));
  return { taxable, tax: grossPaise - taxable };
}

function validateInputs(input: InvoiceCalcInput): void {
  if (input.lines.length === 0) throw new Error("Order has no items to invoice");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`Invalid quantity for ${line.name}`);
    }
    if (!Number.isInteger(line.grossPaise) || line.grossPaise < 0) {
      throw new Error(`Invalid amount for ${line.name}`);
    }
  }
  for (const [label, value] of [
    ["discount", input.discountPaise],
    ["delivery fee", input.deliveryFeePaise],
    ["order total", input.expectedTotalPaise],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
  }
  if (input.legacyTaxPaise !== 0) {
    throw new Error(
      "This order was charged a flat tax. Set the business-unit tax rate to 0 and use per-item GST rates (Admin > GST Setup) so invoices match what customers pay.",
    );
  }
}

export function calculateInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  validateInputs(input);
  const taxMode = input.docType === "tax_invoice";

  if (taxMode) {
    if (!input.sellerStateCode || !GST_STATES[input.sellerStateCode]) {
      throw new Error("Seller state is missing. Add it in Admin > Settings > Business & Compliance.");
    }
    if (!input.placeOfSupplyStateCode || !GST_STATES[input.placeOfSupplyStateCode]) {
      throw new Error("Delivery state could not be determined for this order.");
    }
    const missing = input.lines.filter(
      (l) => l.gstRatePercent === undefined || !Number.isFinite(l.gstRatePercent) || l.gstRatePercent < 0,
    );
    if (missing.length > 0) {
      const names = [...new Set(missing.map((l) => l.name))].join(", ");
      throw new Error(`GST rate is missing for: ${names}. Set it in Admin > GST Setup.`);
    }
  }

  const grossSum = input.lines.reduce((s, l) => s + l.grossPaise, 0);
  const effectiveDiscount = Math.min(input.discountPaise, grossSum);
  const shares = apportion(effectiveDiscount, input.lines.map((l) => l.grossPaise));
  const nets = input.lines.map((l, i) => l.grossPaise - shares[i]!);

  const computedTotal = nets.reduce((a, b) => a + b, 0) + input.deliveryFeePaise;
  if (Math.abs(computedTotal - input.expectedTotalPaise) > 1) {
    throw new Error("Order amounts do not reconcile; invoice cannot be issued. Please review the order.");
  }

  const intra = taxMode && input.sellerStateCode === input.placeOfSupplyStateCode;

  const build = (
    kind: InvoiceLine["kind"],
    description: string,
    hsnCode: string | undefined,
    quantity: number,
    netPaise: number,
    rate: number,
  ): InvoiceLine => {
    if (!taxMode) {
      return {
        kind, description, hsnCode, quantity, ratePercent: 0,
        taxableValuePaise: netPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: netPaise,
      };
    }
    const { taxable, tax } = splitInclusive(netPaise, rate);
    const cgst = intra ? Math.floor(tax / 2) : 0;
    const sgst = intra ? tax - cgst : 0;
    const igst = intra ? 0 : tax;
    return {
      kind, description, hsnCode, quantity, ratePercent: rate,
      taxableValuePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, totalPaise: netPaise,
    };
  };

  const lines: InvoiceLine[] = input.lines.map((l, i) =>
    build(
      "item",
      l.variantName && l.variantName.toLowerCase() !== "default" ? `${l.name} (${l.variantName})` : l.name,
      l.hsnCode,
      l.quantity,
      nets[i]!,
      taxMode ? l.gstRatePercent! : 0,
    ),
  );

  if (input.deliveryFeePaise > 0) {
    // Mixed supply: delivery is taxed at the highest rate among the goods.
    const highest = taxMode ? Math.max(...input.lines.map((l) => l.gstRatePercent!)) : 0;
    lines.push(build("delivery", "Delivery charges", undefined, 1, input.deliveryFeePaise, highest));
  }

  const sum = (pick: (l: InvoiceLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const totals: InvoiceTotals = {
    taxableValuePaise: sum((l) => l.taxableValuePaise),
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    igstPaise: sum((l) => l.igstPaise),
    totalTaxPaise: sum((l) => l.cgstPaise + l.sgstPaise + l.igstPaise),
    grandTotalPaise: sum((l) => l.totalPaise),
  };

  return {
    lines,
    totals,
    supplyType: !taxMode ? "not_applicable" : intra ? "intra_state" : "inter_state",
  };
}

// ----------------------------------------------------------------------------
// State name -> GST code
// ----------------------------------------------------------------------------

const STATE_ALIASES: Record<string, string> = {
  orissa: "21",
  uttaranchal: "05",
  pondicherry: "34",
  "new delhi": "07",
  "nct of delhi": "07",
  "delhi ncr": "07",
  "jammu and kashmir": "01",
  "dadra and nagar haveli": "26",
  "daman and diu": "26",
  "andaman and nicobar": "35",
};

function normalizeStateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stateCodeFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = normalizeStateName(name);
  if (!n) return undefined;
  if (STATE_ALIASES[n]) return STATE_ALIASES[n];
  for (const [code, label] of Object.entries(GST_STATES)) {
    if (normalizeStateName(label) === n) return code;
  }
  return undefined;
}

// ----------------------------------------------------------------------------
// Numbering
// ----------------------------------------------------------------------------

/** Indian financial year (April to March) for a timestamp, evaluated in IST. */
export function financialYear(timestampMs: number): { label: string; short: string } {
  const ist = new Date(timestampMs + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  const a = String(start % 100).padStart(2, "0");
  const b = String((start + 1) % 100).padStart(2, "0");
  return { label: `${start}-${b}`, short: `${a}${b}` };
}

/**
 * GST rules cap invoice numbers at 16 characters. With a prefix of at most
 * 4 characters: tax invoice = PPPP/2627/000001 (16), bill of supply =
 * PPPPB/2627/00001 (16).
 */
export function formatInvoiceNumber(args: {
  prefix?: string;
  docType: DocType;
  fyShort: string;
  sequence: number;
}): string {
  const prefix = (args.prefix?.trim().toUpperCase() || "INV").slice(0, 4);
  if (!Number.isInteger(args.sequence) || args.sequence < 1) throw new Error("Invalid invoice sequence");
  if (args.docType === "tax_invoice") {
    if (args.sequence > 999999) throw new Error("Invoice series exhausted for this financial year");
    return `${prefix}/${args.fyShort}/${String(args.sequence).padStart(6, "0")}`;
  }
  if (args.sequence > 99999) throw new Error("Bill of supply series exhausted for this financial year");
  return `${prefix}B/${args.fyShort}/${String(args.sequence).padStart(5, "0")}`;
}

// ----------------------------------------------------------------------------
// Amount in words (Indian numbering)
// ----------------------------------------------------------------------------

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]!);
  }
  return parts.join(" ");
}

export function amountInWords(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new Error("Invalid amount");
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  const rupeeText = parts.length ? parts.join(" ") : "Zero";
  const paiseText = ps ? ` and ${below1000(ps)} Paise` : "";
  return `Rupees ${rupeeText}${paiseText} Only`;
}
