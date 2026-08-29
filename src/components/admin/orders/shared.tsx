import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { OrderRecord } from "./types";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS } from "./types";

// ============================================================================
// Shared print helpers
// ============================================================================

const PRINT_STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; color: #1a1a1a; font-size: 14px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 0 0 16px; color: #666; }
  h3 { font-size: 14px; margin: 16px 0 8px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-size: 12px; color: #666; text-transform: uppercase; }
  .total { font-weight: bold; font-size: 16px; }
  .muted { color: #666; }
  .right { text-align: right; }
  .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
  .box { border: 2px dashed #999; padding: 16px; margin: 16px 0; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.04em; }
  .value { font-size: 14px; margin-top: 2px; }
  @media print {
    .print-only { display: block; }
  }
`;

const PRINT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"></polyline>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
    <rect x="6" y="14" width="12" height="8"></rect>
  </svg>
);

function openPrintWindow(title: string, html: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

function printBase(title: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>${PRINT_STYLES}</style>
    </head>
    <body>
      ${body}
    </body>
    </html>
  `;
}

const orderTypeLabel = (type: string) => (type === "pickup" ? "Pickup" : "Delivery");

// ============================================================================
// Print Invoice Component
// ============================================================================

interface PrintInvoiceProps {
  order: OrderRecord;
}

export function PrintInvoice({ order }: PrintInvoiceProps) {
  const createdDate = new Date(order.createdAt);
  const updatedDate = new Date(order.updatedAt);

  const printContent = printBase(
    `Invoice ${order.orderNumber}`,
    `
      <div class="masthead">
        <div>
          <h1>MB Crunchy</h1>
          <p class="muted">${order.businessUnitName}</p>
        </div>
        <div class="right">
          <h2>Invoice</h2>
          <p class="muted">${order.orderNumber}</p>
        </div>
      </div>

      <div class="meta">
        <p><strong>Status:</strong> ${STATUS_LABELS[order.status]}<br>
        <strong>Payment:</strong> ${PAYMENT_STATUS_LABELS[order.paymentStatus]}</p>
        <p class="right"><strong>Date:</strong> ${createdDate.toLocaleDateString()}<br>
        <strong>Type:</strong> ${orderTypeLabel(order.orderType)}</p>
      </div>

      <div class="grid-2">
        <div class="box">
          <p class="label">Billed To</p>
          <p class="value"><strong>${order.customerName}</strong></p>
          <p class="value">${order.customerPhone}${order.customerEmail ? `<br>${order.customerEmail}` : ""}</p>
        </div>
        <div class="box">
          <p class="label">Order Details</p>
          <p class="value"><strong>${order.orderNumber}</strong></p>
          <p class="value">${order.itemCount} item${order.itemCount === 1 ? "" : "s"}</p>
          ${order.deliveryAddress ? `<p class="value">${order.deliveryAddress}</p>` : ""}
        </div>
      </div>

      <h3>Ordered Items</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Variant</th>
            <th class="right">Qty</th>
            <th class="right">Price</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map((i) => `
            <tr>
              <td>${i.name}</td>
              <td>${i.variantName}</td>
              <td class="right">${i.quantity}</td>
              <td class="right">₹${i.unitPrice.toLocaleString()}</td>
              <td class="right">₹${i.totalPrice.toLocaleString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div style="text-align: right; margin-top: 16px;">
        <p>Subtotal: ₹${order.subtotal.toLocaleString()}</p>
        ${order.discount > 0 ? `<p class="muted">Discount (${order.offerCode || "N/A"}): -₹${order.discount.toLocaleString()}</p>` : ""}
        ${order.deliveryFee > 0 ? `<p class="muted">Delivery: ₹${order.deliveryFee.toLocaleString()}</p>` : ""}
        <p>Tax: ₹${order.tax.toLocaleString()}</p>
        <p class="total">Total: ₹${order.total.toLocaleString()}</p>
      </div>

      <div class="footer">
        <p>Thank you for your order!</p>
        <p>Order created: ${createdDate.toLocaleString()} | Updated: ${updatedDate.toLocaleString()}</p>
      </div>
    `,
  );

  return (
    <Button variant="outline" size="sm" onClick={() => openPrintWindow(`Invoice ${order.orderNumber}`, printContent)} className="gap-1.5">
      {PRINT_ICON}
      Print Invoice
    </Button>
  );
}

// ============================================================================
// Print Packing Slip Component
// ============================================================================

export function PrintPackingSlip({ order }: PrintInvoiceProps) {
  const createdDate = new Date(order.createdAt);

  const printContent = printBase(
    `Packing Slip ${order.orderNumber}`,
    `
      <div class="masthead">
        <h1>MB Crunchy</h1>
        <h2>Packing Slip</h2>
      </div>

      <div class="box">
        <p><strong>Order:</strong> ${order.orderNumber}</p>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Phone:</strong> ${order.customerPhone}</p>
        ${order.customerEmail ? `<p><strong>Email:</strong> ${order.customerEmail}</p>` : ""}
        <p><strong>Type:</strong> ${orderTypeLabel(order.orderType).toUpperCase()}</p>
      </div>

      ${order.deliveryAddress ? `
        <h3>Delivery Address</h3>
        <div class="box">
          ${order.deliveryAddress}
        </div>
      ` : ""}

      ${order.deliveryNotes ? `
        <h3>Delivery Notes</h3>
        <div class="box">
          ${order.deliveryNotes}
        </div>
      ` : ""}

      <h3>Items to Pack (${order.itemCount})</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Variant</th>
            <th class="right">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map((i) => `
            <tr>
              <td>${i.name}</td>
              <td>${i.variantName}</td>
              <td class="right">${i.quantity}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="footer">
        <p>Packing Slip generated: ${createdDate.toLocaleString()}</p>
        <p>Quantity shown is what to pack. Do not include pricing.</p>
      </div>
    `,
  );

  return (
    <Button variant="outline" size="sm" onClick={() => openPrintWindow(`Packing Slip ${order.orderNumber}`, printContent)} className="gap-1.5">
      {PRINT_ICON}
      Print Packing Slip
    </Button>
  );
}

// ============================================================================
// Print Kitchen Order Ticket Component
// ============================================================================

export function PrintKitchenTicket({ order }: PrintInvoiceProps) {
  const createdDate = new Date(order.createdAt);
  const elapsedMinutes = Math.max(0, order.elapsedMinutes);

  const printContent = printBase(
    `Kitchen Ticket ${order.orderNumber}`,
    `
      <div class="masthead">
        <div>
          <h1>MB Crunchy</h1>
          <p class="muted">${order.businessUnitName}</p>
        </div>
        <div class="right">
          <h2>Kitchen Order Ticket</h2>
          <p class="muted">${order.orderNumber}</p>
        </div>
      </div>

      <div class="meta">
        <p><strong>Placed:</strong> ${createdDate.toLocaleString()}<br>
        <strong>Age:</strong> ${elapsedMinutes}m</p>
        <p class="right"><strong>Customer:</strong> ${order.customerName}<br>
        <strong>Phone:</strong> ${order.customerPhone}<br>
        <strong>Type:</strong> ${orderTypeLabel(order.orderType).toUpperCase()}</p>
      </div>

      ${order.deliveryNotes ? `
        <h3>Special Instructions</h3>
        <div class="box">
          ${order.deliveryNotes}
        </div>
      ` : ""}

      <h3>Items (${order.itemCount})</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Variant</th>
            <th class="right">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map((i) => `
            <tr>
              <td>${i.name}</td>
              <td>${i.variantName}</td>
              <td class="right"><strong>${i.quantity}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="footer">
        <p>Fire ticket. Kitchen copy only — do not share pricing with customers.</p>
      </div>
    `,
  );

  return (
    <Button variant="outline" size="sm" onClick={() => openPrintWindow(`Kitchen Ticket ${order.orderNumber}`, printContent)} className="gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
        <path d="M7 2v20"></path>
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>
      </svg>
      Print Kitchen Ticket
    </Button>
  );
}

// ============================================================================
// Payment Status Badge
// ============================================================================

export function PaymentStatusBadge({ status }: { status: string }) {
  const getStatusColor = () => {
    switch (status) {
      case "paid": return "border-emerald-200 bg-emerald-500/10 text-emerald-700";
      case "failed": return "border-red-200 bg-red-500/10 text-red-700";
      case "refunded": return "border-gray-200 bg-gray-500/10 text-gray-700";
      default: return "border-muted-foreground/20 bg-muted/50 text-muted-foreground";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "paid": return "Paid";
      case "failed": return "Payment Failed";
      case "refunded": return "Refunded";
      default: return "Pending";
    }
  };

  return (
    <Badge variant="outline" className={cn("text-xs capitalize", getStatusColor())}>
      {getStatusLabel()}
    </Badge>
  );
}

// ============================================================================
// Order Type Badge
// ============================================================================

export function OrderTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    delivery: "border-purple-200 bg-purple-500/10 text-purple-700",
    pickup: "border-sky-200 bg-sky-500/10 text-sky-700",
  };

  return (
    <Badge variant="outline" className={cn("text-xs capitalize", colors[type] ?? "border-border bg-muted text-muted-foreground")}>
      {type === "pickup" ? "Pickup" : type}
    </Badge>
  );
}
