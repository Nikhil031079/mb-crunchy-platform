import type { PaymentStatus } from "@/types";

// ============================================================================
// Payment display — single source of truth for payment wording + colors so the
// customer and admin always see the same status. Never invent new labels.
// ============================================================================

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  pending_verification: "Pending Verification",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  rejected: "Rejected",
};

export const PAYMENT_STATUS_BADGE_COLORS: Record<PaymentStatus, string> = {
  pending: "border-muted-foreground/20 bg-muted/50 text-muted-foreground",
  pending_verification: "border-amber-200 bg-amber-500/10 text-amber-700",
  paid: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
  failed: "border-red-200 bg-red-500/10 text-red-700",
  refunded: "border-gray-200 bg-gray-500/10 text-gray-700",
  rejected: "border-red-200 bg-red-500/10 text-red-700",
};

export const PAYMENT_STATUS_TEXT_COLORS: Record<PaymentStatus, string> = {
  pending: "text-amber-600",
  pending_verification: "text-amber-600",
  paid: "text-emerald-600",
  failed: "text-red-600",
  refunded: "text-gray-500",
  rejected: "text-red-600",
};

// ============================================================================
// Payment method — display labels. Never hardcode a gateway name (Razorpay);
// the stored value is mapped to a stable, honest label.
// ============================================================================

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi_qr: "UPI QR",
  cash: "Cash",
  cod: "COD",
  razorpay: "Future Gateway",
};

export function getPaymentMethodLabel(method?: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? "Future Gateway";
}
