import { escapeHtml } from "@/lib/html-sanitizer";
import { formatCurrency } from "@/utils";

// ============================================================================
// Customer printable ORDER RECEIPT (11D).
//
// Zero-cost browser-print receipt built ONLY from existing stored order
// data. This is NOT a GST/tax invoice: the stored tax amount is presented
// verbatim as "Tax" with no CGST/SGST/IGST split, no HSN/SAC, no GSTIN, and
// no invoice numbering (orderNumber is the receipt reference).
//
// XSS safety: every dynamic value passes through escapeHtml before HTML
// interpolation. Numbers and mapped labels are inherently safe. Never
// interpolate unescaped database-backed strings here.
// ============================================================================

export interface ReceiptOrderItem {
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: number;
  // Customer identity is absent from sanitized customer-facing order
  // payloads by design; rendered only when present.
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  destinationPincode?: string;
  destinationCity?: string;
  destinationState?: string;
  items: ReceiptOrderItem[];
  subtotal: number;
  discount: number;
  offerCode?: string;
  deliveryFee?: number;
  tax: number;
  total: number;
  paymentStatus: string;
  paymentMethod?: string;
  orderType: string;
  deliveryType?: string;
}

function paymentStatusLabel(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return "Pending";
}

function fulfillmentLabel(order: ReceiptOrder): string {
  const type = order.orderType === "pickup" ? "Pickup" : "Delivery";
  if (order.orderType !== "delivery") return type;
  if (order.deliveryType === "outside_area") return "Delivery (Outside Area)";
  return "Delivery";
}

const RECEIPT_STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; color: #1a1a1a; font-size: 14px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 0 0 4px; color: #444; font-weight: 600; }
  h3 { font-size: 14px; margin: 16px 0 8px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-size: 12px; color: #666; text-transform: uppercase; }
  .right { text-align: right; }
  .muted { color: #666; }
  .total { font-weight: bold; font-size: 18px; }
  .masthead { margin-bottom: 8px; }
  .meta { margin: 12px 0; }
  .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
  @media print { body { margin: 24px; } }
`;

/**
 * Build the self-contained receipt HTML for an order. Only fields present
 * on the order are rendered — missing optionals leave no placeholders.
 */
export function buildOrderReceiptHtml(
  order: ReceiptOrder,
  businessName?: string,
): string {
  const esc = escapeHtml;
  const title = businessName ? esc(businessName) : "MB Crunchy";

  const destination = [
    order.deliveryAddress,
    order.destinationCity,
    order.destinationState,
    order.destinationPincode,
  ]
    .filter((part) => part !== undefined && part.trim().length > 0)
    .map((part) => esc(part as string))
    .join("<br>");

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td>${esc(item.name)}</td>
        <td>${esc(item.variantName)}</td>
        <td class="right">${item.quantity}</td>
        <td class="right">${esc(formatCurrency(item.unitPrice))}</td>
        <td class="right">${esc(formatCurrency(item.totalPrice))}</td>
      </tr>`,
    )
    .join("");

  const date = new Date(order.createdAt).toLocaleDateString();
  const deliveryFee = order.deliveryFee ?? 0;

  const customerBlock =
    order.customerName || order.customerPhone || order.customerEmail
      ? `<p>${
          order.customerName
            ? `<strong>Customer:</strong> ${esc(order.customerName)}<br>`
            : ""
        }${
          order.customerPhone
            ? `<strong>Phone:</strong> ${esc(order.customerPhone)}`
            : ""
        }${
          order.customerEmail
            ? `<br><strong>Email:</strong> ${esc(order.customerEmail)}`
            : ""
        }</p>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Order Receipt ${esc(order.orderNumber)}</title>
  <style>${RECEIPT_STYLES}</style>
</head>
<body>
  <div class="masthead">
    <h1>${title}</h1>
    <h2>Order Receipt</h2>
    <p class="muted">${esc(order.orderNumber)}</p>
  </div>

  <div class="meta">
    <p><strong>Date:</strong> ${esc(date)}<br>
    <strong>Fulfillment:</strong> ${esc(fulfillmentLabel(order))}</p>
    ${customerBlock}
    ${
      destination
        ? `<p><strong>Destination:</strong><br>${destination}</p>`
        : ""
    }
  </div>

  <h3>Items</h3>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Variant</th>
        <th class="right">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div style="text-align: right; margin-top: 16px;">
    <p>Subtotal: ${esc(formatCurrency(order.subtotal))}</p>
    ${
      order.discount > 0
        ? `<p class="muted">Discount${order.offerCode ? ` (${esc(order.offerCode)})` : ""}: -${esc(formatCurrency(order.discount))}</p>`
        : ""
    }
    <p>Delivery Fee: ${esc(formatCurrency(deliveryFee))}</p>
    <p>Tax: ${esc(formatCurrency(order.tax))}</p>
    <p class="total">Total: ${esc(formatCurrency(order.total))}</p>
  </div>

  <p><strong>Payment Status:</strong> ${esc(paymentStatusLabel(order.paymentStatus))}${
    order.paymentMethod ? `<br><strong>Payment Method:</strong> ${esc(order.paymentMethod)}` : ""
  }</p>

  <div class="footer">
    <p>Thank you for ordering from MB Crunchy.</p>
  </div>
</body>
</html>`;
}

/**
 * Open the isolated print window for an order receipt and trigger the
 * browser print dialog (where the customer may choose "Save as PDF").
 * No PDF library, no app CSS dependency, main page untouched.
 */
export function printOrderReceipt(
  order: ReceiptOrder,
  businessName?: string,
): void {
  if (typeof window === "undefined") return;
  const html = buildOrderReceiptHtml(order, businessName);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
