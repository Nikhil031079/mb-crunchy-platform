import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { OrderRecord } from "./types";

// ============================================================================
// Print Invoice Component
// ============================================================================

interface PrintInvoiceProps {
  order: OrderRecord;
}

export function PrintInvoice({ order }: PrintInvoiceProps) {
  const createdDate = new Date(order.createdAt);
  const updatedDate = new Date(order.updatedAt);

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${order.orderNumber}</title>
      <style>
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
        .print-only { display: block; }
        @media print {
          .print-only { display: block; }
        }
      </style>
    </head>
    <body>
      <h1>MB Crunchy</h1>
      <h2>Invoice</h2>
      <p><strong>Order:</strong> ${order.orderNumber}<br>
      <strong>Date:</strong> ${createdDate.toLocaleDateString()}<br>
      <strong>Type:</strong> ${order.orderType}<br>
      <strong>Customer:</strong> ${order.customerName} | ${order.customerPhone}${order.customerEmail ? ` | ${order.customerEmail}` : ""}<br>
      ${order.deliveryAddress ? `<strong>Delivery:</strong> ${order.deliveryAddress}<br>` : ""}</p>

      <h3>Ordered Items (${order.itemCount})</h3>
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
    </body>
    </html>
  `;

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(printContent);
      w.document.close();
      w.print();
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print Invoice
    </Button>
  );
}

// ============================================================================
// Print Packing Slip Component
// ============================================================================

export function PrintPackingSlip({ order }: PrintInvoiceProps) {
  const createdDate = new Date(order.createdAt);

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Packing Slip ${order.orderNumber}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; color: #1a1a1a; font-size: 14px; }
        h1 { font-size: 24px; margin: 0 0 4px; }
        h2 { font-size: 18px; margin: 0 0 16px; color: #666; }
        h3 { font-size: 14px; margin: 16px 0 8px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
        th { font-size: 12px; color: #666; text-transform: uppercase; }
        .muted { color: #666; }
        .right { text-align: right; }
        .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
        .box { border: 2px dashed #999; padding: 16px; margin: 16px 0; }
        .print-only { display: block; }
        @media print {
          .print-only { display: block; }
        }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h1>MB Crunchy</h1>
        <h2>Packing Slip</h2>
      </div>

      <div class="box">
        <p><strong>Order:</strong> ${order.orderNumber}</p>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Phone:</strong> ${order.customerPhone}</p>
        ${order.customerEmail ? `<p><strong>Email:</strong> ${order.customerEmail}</p>` : ""}
        <p><strong>Type:</strong> ${order.orderType.toUpperCase()}</p>
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
    </body>
    </html>
  `;

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(printContent);
      w.document.close();
      w.print();
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13.5c0 .3.1.5.2.7L8.6 17.5a2 2 0 0 0 1.7.9H16"></path>
        <path d="M12 12h.01"></path>
        <path d="M17 12h.01"></path>
        <path d="M7 12h.01"></path>
      </svg>
      Print Packing Slip
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
      case "pending_verification": return "border-amber-200 bg-amber-500/10 text-amber-700";
      case "rejected": return "border-red-200 bg-red-500/10 text-red-700";
      case "failed": return "border-red-200 bg-red-500/10 text-red-700";
      case "refunded": return "border-gray-200 bg-gray-500/10 text-gray-700";
      default: return "border-muted-foreground/20 bg-muted/50 text-muted-foreground";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "paid": return "Paid";
      case "pending_verification": return "Pending Verification";
      case "rejected": return "Payment Rejected";
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
