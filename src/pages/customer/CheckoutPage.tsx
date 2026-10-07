import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useAction, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Truck,
  Store,
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  Loader2,
  MapPin,
  Clock,
  CreditCard,
  Package,
  Star,
  User,
  CircleDot,
  AlertTriangle,
  MessageCircle,
  BadgeCheck,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, ROUTES, FALLBACK_WHATSAPP_NUMBER, DEFAULT_PICKUP_ESTIMATE } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency, checkKitchenServiceability, checkMartPincodeFormat, filterCatalogItemIds } from "@/utils";
import { printOrderReceipt } from "@/utils/orderReceipt";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";
import { normalizeIndianPhone, validateIndianPhone, extractDigitsForInput } from "@/utils/phone";
import { getActiveVariants } from "@/utils/product-variants";
import { resolveDestinationCityState } from "@/utils/destinationCityState";

// Hooks
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";
import { useLocationStore } from "@/stores/location";

// Customer components
import { StoreStatusDot } from "@/components/customer/StoreStatusBadge";
import { PaymentPendingCard } from "@/components/customer/PaymentPendingCard";
import { PhoneInput } from "@/components/customer/PhoneInput";
import { QuantitySelector } from "@/components/customer";

// Payment
import { openRazorpayCheckout } from "@/hooks/use-razorpay";

// Shared components
import { EmptyState } from "@/components/shared/EmptyState";

// UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type {
  BusinessUnitSettings,
  CartAppliedMealDeal,
  CartItem,
  CatalogItem,
  Customer,
  CustomerAddress,
  LoyaltySettings,
  LoyaltyAccount,
  Product,
} from "@/types";
import type { Id } from "@convex/_generated/dataModel";

// ============================================================================
// Mart delivery error messages — customer-facing, no internal terminology
// ============================================================================

function getMartDeliveryErrorMessage(reason?: string): string {
  switch (reason) {
    case "INVALID_PINCODE":
      return "Enter a valid 6-digit pincode.";
    case "BUSINESS_UNIT_NOT_FOUND":
    case "MART_DELIVERY_DISABLED":
    case "MART_SERVICEABILITY_NOT_CONFIGURED":
      return "Delivery is not available for this store.";
    case "PINCODE_NOT_SERVICEABLE":
      return "Delivery is not available for this pincode.";
    case "MISSING_SHIPPING_ZONE":
    case "SHIPPING_ZONE_UNAVAILABLE":
    case "SHIPPING_ZONE_MISMATCH":
      return "Delivery is temporarily unavailable for this area.";
    case "SHIPPING_NOT_CONFIGURED":
      return "Shipping is not configured for this store.";
    case "ITEM_UNAVAILABLE":
      return "One or more items are no longer available.";
    case "ITEM_NOT_SHIPPABLE":
      return "One or more items cannot be delivered to this location.";
    case "MISSING_WEIGHT":
    case "INVALID_WEIGHT":
      return "Shipping information is incomplete for one or more items.";
    case "NO_MATCHING_RATE":
      return "No shipping rate is available for this order.";
    case "OVERLAPPING_RATES":
      return "Shipping configuration error. Please contact support.";
    default:
      return "Delivery is not available for this pincode.";
  }
}

// ============================================================================
// Phase 21D-D — stale cart price detection (mirrors Phase 21D-C CartPage)
// ============================================================================

// Mirrors PRICE_TOLERANCE in convex/orders.ts (resolveOrderLine) — and the
// identical threshold in CartPage — so the checkout indicator only surfaces
// captured prices the server would reject at submit.
const STALE_PRICE_THRESHOLD = 0.02;

/**
 * Current server-authoritative price for a checkout cart line. Mirrors
 * resolveCurrentLinePrice (CartPage, Phase 21D-C): active-variant products
 * price from the matched active variant; zero-active-variant products use
 * the catalog price; product lines whose docs are missing or cross-BU
 * disagree resolve to null (no indicator — never guess a price).
 */
function resolveCurrentLinePrice(
  item: CartItem,
  catalogEntry: CatalogItem | undefined,
  productDoc: Product | undefined,
): number | null {
  if (item.itemType !== "product" || item.mealDealId) return null;
  if (!catalogEntry || !productDoc) return null;
  if (productDoc.businessUnitId !== item.businessUnitId) return null;
  const active = getActiveVariants(productDoc.variants);
  if (active.length === 0) return catalogEntry.price;
  const variant = active.find((v) => v.optionValue === item.variantName);
  return variant ? variant.price : null;
}

// ============================================================================
// OrderConfirmationCard — shared confirmation UI for all order flows
// ============================================================================

interface OrderConfirmationCardProps {
  orderNumber: string;
  title: string;
  subtitle: string;
  businessName?: string;
  order?: {
    subtotal: number;
    discount: number;
    deliveryFee?: number;
    tax: number;
    total: number;
    orderType: string;
    deliveryType?: string;
    paymentStatus: string;
    status: string;
    orderNumber: string;
    createdAt: number;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
    destinationPincode?: string;
    destinationCity?: string;
    destinationState?: string;
    items: Array<{
      name: string;
      variantName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    offerCode?: string;
    paymentMethod?: string;
  } | null;
}

function OrderConfirmationCard({
  orderNumber,
  title,
  subtitle,
  businessName,
  order,
}: OrderConfirmationCardProps) {
  const orderSubtotal = order ? order.subtotal : 0;
  const orderDeliveryFee = order?.deliveryFee ?? 0;
  const paymentLabel = order
    ? order.paymentStatus === "paid"
      ? "Paid"
      : order.paymentStatus === "failed"
        ? "Failed"
        : "Pending"
    : "Pending";
  const paymentColor = order
    ? order.paymentStatus === "paid"
      ? "text-emerald-600"
      : order.paymentStatus === "failed"
        ? "text-red-600"
        : "text-amber-600"
    : "text-amber-600";
  const orderStatusLabel = order
    ? order.status === "pending"
      ? "Order Placed"
      : order.status === "confirmed"
        ? "Confirmed"
        : order.status === "preparing"
          ? "Preparing"
          : order.status === "ready"
            ? "Ready"
            : order.status === "out_for_delivery"
              ? "Out for Delivery"
              : order.status === "delivered"
                ? "Delivered"
                : order.status === "cancelled"
                  ? "Cancelled"
                  : "Processing"
    : "Processing";
  const orderStatusColor =
    order?.status === "confirmed" || order?.status === "preparing" || order?.status === "ready" || order?.status === "out_for_delivery" || order?.status === "delivered"
      ? "text-emerald-600"
      : order?.status === "cancelled"
        ? "text-red-600"
        : "text-amber-600";

  return (
    <div className="min-h-screen culinary-canvas">
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/40"
          >
            <CheckCircle2 className="h-12 w-12 text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-border/60 bg-card p-6 space-y-3"
          >
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Number</span>
              <span className="font-mono font-semibold">{orderNumber || "Processing..."}</span>
            </div>
            {order && order.items && order.items.length > 0 && (
              <div className="space-y-1.5 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Items
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const count = order.items.reduce((total, item) => total + item.quantity, 0);
                      return count === 1 ? "1 item" : `${count} items`;
                    })()}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {order.items.map((item, index) => (
                    <li
                      key={`${item.name}-${item.variantName}-${index}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 break-words text-muted-foreground">
                        {item.name} ({item.variantName}) × {item.quantity}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Subtotal</span>
              <span className="font-medium">
                {order ? formatCurrency(orderSubtotal) : "Loading..."}
              </span>
            </div>
            {order && order.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Discount{order.offerCode ? ` (${order.offerCode})` : ""}
                </span>
                <span className="font-medium text-emerald-600">
                  -{formatCurrency(order.discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span className="font-medium">
                {order
                  ? order.orderType === "pickup"
                    ? "Pickup"
                    : orderDeliveryFee === 0
                      ? order.deliveryType === "outside_area" ? "Quote Required" : "Free"
                      : formatCurrency(orderDeliveryFee)
                  : "Loading..."}
              </span>
            </div>
            {order && order.tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatCurrency(order.tax)}</span>
              </div>
            )}
            {order && (
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment</span>
              <span className={`flex items-center gap-1.5 font-medium ${paymentColor}`}>
                {paymentLabel === "Paid" ? (
                  <BadgeCheck className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
                {paymentLabel}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order</span>
              <span className={`flex items-center gap-1.5 font-medium ${orderStatusColor}`}>
                {orderStatusColor === "text-emerald-600" ? (
                  <BadgeCheck className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
                {orderStatusLabel}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col gap-3 items-center"
          >
            <div className="flex gap-3 justify-center">
              <Link to={ROUTES.TRACK_ORDER}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Track Order
                </Button>
              </Link>
              {order && order.items ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => printOrderReceipt(order, businessName)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Receipt
                </Button>
              ) : null}
              <Link to="/">
                <Button size="sm" className="gap-2">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================================
// CheckoutPage — Contact form, delivery/pickup, order summary, submit
// ============================================================================

interface CheckoutForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  orderType: "delivery" | "pickup";
  deliveryType: "local" | "outside_area";
  deliveryAddress: string;
  deliveryNotes: string;
  selectedZoneId: string;
  couponCode: string;
  destinationPincode: string;
  destinationCity: string;
  destinationState: string;
}

const INITIAL_FORM: CheckoutForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  orderType: "delivery",
  deliveryType: "local",
  deliveryAddress: "",
  deliveryNotes: "",
  selectedZoneId: "",
  couponCode: "",
  destinationPincode: "",
  destinationCity: "",
  destinationState: "",
};

// ============================================================================
// Idempotency key — stable per order intent, reused across retries so a
// double-click, network retry or browser refresh can never create a duplicate
// order. Persisted in sessionStorage so it survives a refresh mid-submit; it
// is cleared only after the order is successfully created.
// ============================================================================

const IDEMPOTENCY_KEY_STORAGE = "mb_checkout_idempotency_key";

function getOrCreateIdempotencyKey(): string {
  const existing = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE);
  if (existing) return existing;
  const key =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, key);
  return key;
}

function clearIdempotencyKey() {
  sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);
}

// ============================================================================
// Checkout meal-deal scoping — the cart may hold deals from another BU
// (mixed cart). Only deals owned by the selected checkout BU may contribute
// to displayed savings and submitted mealDealIds; anything else (including
// legacy entries without a BU) is filtered out. Displayed savings and
// submitted IDs always derive from this same set. Server-side 17F BU
// validation in orders.create remains the final authority.
// ============================================================================

export function selectCheckoutMealDeals(
  appliedMealDeals: CartAppliedMealDeal[] | undefined,
  selectedCheckoutBU: string | null,
): { deals: CartAppliedMealDeal[]; savings: number } {
  const deals = (appliedMealDeals ?? []).filter(
    (d) => d.businessUnitId === selectedCheckoutBU,
  );
  const savings = deals.reduce((sum, d) => sum + d.savings * d.quantity, 0);
  return { deals, savings };
}

// ============================================================================
// Order confirmation persistence — survives browser refresh so the
// confirmation page can recover the order via a reactive Convex query.
// Used by ALL order flows (outside-area, local delivery, pickup).
// ============================================================================

const ORDER_CONFIRMATION_KEY = "mb_order_confirmation";
const LEGACY_OUTSIDE_AREA_KEY = "mb_outside_area_order";

function persistOrderConfirmation(orderNumber: string, phone: string) {
  try {
    localStorage.setItem(
      ORDER_CONFIRMATION_KEY,
      JSON.stringify({ orderNumber, phone })
    );
  } catch {
    // localStorage unavailable — non-critical, fallback to fresh state
  }
}

function loadPersistedOrderConfirmation(): { orderNumber: string; phone: string } | null {
  try {
    const raw = localStorage.getItem(ORDER_CONFIRMATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.orderNumber && parsed?.phone) return parsed;
    }

    // Fallback: migrate existing outside-area order from old key
    const legacy = localStorage.getItem(LEGACY_OUTSIDE_AREA_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed?.orderNumber && parsed?.phone) {
        persistOrderConfirmation(parsed.orderNumber, parsed.phone);
        return parsed;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function clearPersistedOrderConfirmation() {
  try {
    localStorage.removeItem(ORDER_CONFIRMATION_KEY);
  } catch {
    // ignore
  }
}

// ============================================================================
// OutsideAreaConfirmation — persistent, backend-driven order status page
// for outside-area delivery orders. Uses a reactive Convex query so the
// page updates in real-time when the admin sends a quote.
// ============================================================================

function OutsideAreaConfirmation({ orderNumber, phone }: { orderNumber: string; phone: string }) {
  const tracked = useQuery(api.orders.getByPhoneAndOrderNumber, { phone, orderNumber });
  const globalSettings = useQuery(api.settings.getGlobalSettings);
  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    tracked?.order?.businessUnitId
      ? { businessUnitId: tracked.order.businessUnitId as any }
      : "skip",
  );

  const order = tracked?.order;
  const quoteStatus = order?.deliveryQuoteStatus;

  // Clear persisted identity once the order reaches a terminal state
  useEffect(() => {
    if (!order) return;
    if (order.status === "delivered" || order.status === "cancelled" || order.status === "refunded") {
      clearPersistedOrderConfirmation();
    }
  }, [order?.status]);

  // Loading state
  if (tracked === undefined) {
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8 text-center space-y-4">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your order...</p>
        </div>
      </div>
    );
  }

  // Order not found
  if (!order) {
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8 text-center space-y-4">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="text-2xl font-bold">Order not found</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t find this order. Please check your order number and phone number.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link to={ROUTES.TRACK_ORDER}>
              <Button variant="outline" size="sm" className="gap-2">
                <Package className="h-3.5 w-3.5" />
                Track Order
              </Button>
            </Link>
            <Link to="/">
              <Button size="sm" className="gap-2">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Non-outside-area order — shouldn't happen, but fallback
  if (order.deliveryType !== "outside_area") {
    clearPersistedOrderConfirmation();
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="text-2xl font-bold">Order Placed</h1>
          <p className="text-sm text-muted-foreground">
            Your order has been placed successfully.
          </p>
          <Link to="/">
            <Button size="sm" className="gap-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const whatsappPhone = (globalSettings?.paymentConfig?.whatsappNumber ?? FALLBACK_WHATSAPP_NUMBER).replace(/[^0-9]/g, "");
  const orderSubtotal = order.subtotal - order.discount;
  const whatsappMsg = encodeURIComponent(
    `Hi MB Crunchy,\n\nI have requested outside-area delivery.\n\nOrder: ${order.orderNumber}\nOrder value: ${formatCurrency(orderSubtotal)}\n\nPlease check delivery availability and confirm the delivery charge.`
  );

  // ── QUOTE PENDING ────────────────────────────────────────────────────────
  if (quoteStatus === "pending") {
    return (
      <div className="min-h-screen culinary-canvas">
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-200 dark:shadow-amber-900/40"
            >
              <Clock className="h-12 w-12 text-white" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <h1 className="text-2xl font-bold tracking-tight">Delivery Request Received</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;re checking delivery availability for your location. We&apos;ll confirm the delivery charge with you shortly.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl border border-border/60 bg-card p-6 space-y-3"
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Number</span>
                <span className="font-mono font-semibold">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Subtotal</span>
                <span className="font-medium">{formatCurrency(orderSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium text-amber-600">Quote Required</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Total payable after quote</span>
                <span>To be confirmed</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl border border-border/60 bg-card p-6 text-left space-y-3"
            >
              <h3 className="font-semibold text-sm">What happens next?</h3>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>We&apos;ll check delivery availability for your location.</li>
                <li>We&apos;ll confirm the delivery charge with you.</li>
                <li>You can accept or decline the quote.</li>
                <li>If you accept, we&apos;ll provide the payment option.</li>
                <li>Your order will be prepared after payment confirmation.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground pt-1">
                You will not be charged for delivery until we confirm the delivery cost with you.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col gap-3 items-center"
            >
              {whatsappPhone && (
                <a
                  href={`https://wa.me/${whatsappPhone}?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors w-full justify-center"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat with {SITE_NAME} on WhatsApp
                </a>
              )}
            <div className="flex gap-3 justify-center">
              <Link to={ROUTES.TRACK_ORDER}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Track Order
                </Button>
              </Link>
              <Link to="/">
                <Button size="sm" className="gap-2">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Home
                </Button>
              </Link>
            </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── QUOTE QUOTED / ACCEPTED / REJECTED — delegate to PaymentPendingCard ──
  // PaymentPendingCard handles: quote ready (accept/decline), quote accepted
  // (payment flow), quote rejected (cancelled state).
  const settings = (buSettings ?? null) as { paymentConfig?: { whatsappNumber?: string } } | null;

  return (
    <div className="min-h-screen culinary-canvas">
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/40"
          >
            <CheckCircle2 className="h-12 w-12 text-white" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h1 className="text-2xl font-bold tracking-tight">
              {quoteStatus === "quoted" && "Delivery Quote Ready"}
              {quoteStatus === "accepted" && "Quote Accepted — Complete Payment"}
              {quoteStatus === "rejected" && "Delivery Quote Declined"}
              {!quoteStatus && "Order Confirmed"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {quoteStatus === "quoted" && "We've confirmed the delivery charge for your location."}
              {quoteStatus === "accepted" && "You accepted the delivery quote. Complete payment to confirm your order."}
              {quoteStatus === "rejected" && "You declined the delivery quote. This order has been cancelled."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-border/60 bg-card p-6"
          >
            <PaymentPendingCard
              order={order as any}
              phone={phone}
              onOrderAgain={() => {}}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="flex flex-col gap-3 items-center"
          >
            {whatsappPhone && quoteStatus !== "rejected" && (
              <a
                href={`https://wa.me/${whatsappPhone}?text=${whatsappMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors w-full justify-center"
              >
                <MessageCircle className="h-4 w-4" />
                Chat with {SITE_NAME} on WhatsApp
              </a>
            )}
            <div className="flex gap-3 justify-center">
              <Link to={ROUTES.TRACK_ORDER}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Track Order
                </Button>
              </Link>
              <Link to="/">
                <Button size="sm" className="gap-2">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, clearCart, itemCount, dismissNotice, removeByBusinessUnit, updateQuantity, updateVariant } = useCart();
  const createOrder = useMutation(api.orders.create);
  const createRazorpayOrder = useAction(api.razorpay.createOrder);
  const verifyRazorpayPayment = useAction(api.razorpay.verifyPayment);

  // ==========================================================================
  // State
  // ==========================================================================

  const [form, setForm] = useState<CheckoutForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    orderId: string;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing_payment" | "creating_order">("idle");
  const [pendingOrder, setPendingOrder] = useState<{
    orderId: string;
    orderNumber: string;
    amount: number;
    phone: string;
  } | null>(null);
  const [couponApplied, setCouponApplied] = useState<{
    valid: boolean;
    error?: string;
    discount?: number;
    title?: string;
  } | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // ==========================================================================
  // Mixed-BU cart detection and BU selection for checkout
  // ==========================================================================

  const isMixedCart = cart.businessUnitIds.length > 1;

  // The selected BU for checkout — null means "not yet chosen" for mixed carts.
  // For single-BU carts, this is always the only BU.
  const [selectedCheckoutBU, setSelectedCheckoutBU] = useState<string | null>(null);

  // For single-BU carts, auto-select the only BU.
  useEffect(() => {
    if (!isMixedCart && cart.businessUnitIds.length === 1 && !selectedCheckoutBU) {
      setSelectedCheckoutBU(cart.businessUnitIds[0]);
    }
    // If cart becomes single-BU after being mixed, auto-select
    if (!isMixedCart && cart.businessUnitIds.length === 1) {
      setSelectedCheckoutBU(cart.businessUnitIds[0]);
    }
  }, [isMixedCart, cart.businessUnitIds, selectedCheckoutBU]);

  // Items belonging to the selected BU only
  const checkoutItems = useMemo(() => {
    if (!selectedCheckoutBU) return [];
    return cart.items.filter((item) => item.businessUnitId === selectedCheckoutBU);
  }, [cart.items, selectedCheckoutBU]);

  // Meal deals scoped to the selected checkout BU. The cart may hold deals
  // from another BU (mixed cart); those must neither display nor submit here.
  // The server 17F BU guard remains the final authority.
  const checkoutMealDeals = useMemo(
    () => selectCheckoutMealDeals(cart.appliedMealDeals, selectedCheckoutBU).deals,
    [cart.appliedMealDeals, selectedCheckoutBU],
  );
  const checkoutMealDealSavings = useMemo(
    () => selectCheckoutMealDeals(cart.appliedMealDeals, selectedCheckoutBU).savings,
    [cart.appliedMealDeals, selectedCheckoutBU],
  );

  // ==========================================================================
  // Phase 21D-D — checkout quantity editing (cart store stays the single
  // source of truth; no local quantity state) + 21D-C stale-price surface
  // ==========================================================================

  // Catalog + product docs for the DISPLAYED checkout lines so the order
  // summary can surface 21D-C stale prices before payment. Query args change
  // with the selected BU; the hook count is fixed.
  const checkoutItemCatalogIds = useMemo(
    () => filterCatalogItemIds(checkoutItems.map((item) => item.catalogItemId)),
    [checkoutItems],
  );

  const checkoutCatalogItems = useQuery(
    api.catalogItems.getByIds,
    checkoutItemCatalogIds.length > 0
      ? { ids: checkoutItemCatalogIds as Id<"catalogItems">[] }
      : "skip",
  ) as CatalogItem[] | undefined;

  const checkoutCatalogById = useMemo(
    () => new Map((checkoutCatalogItems ?? []).map((c) => [c._id, c])),
    [checkoutCatalogItems],
  );

  const checkoutProductSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of checkoutItems) {
      if (item.itemType !== "product" || item.mealDealId) continue;
      const sourceId = checkoutCatalogById.get(item.catalogItemId)?.sourceId;
      if (sourceId) ids.add(sourceId);
    }
    return [...ids];
  }, [checkoutItems, checkoutCatalogById]);

  const checkoutProducts = useQuery(
    api.products.getByIds,
    checkoutProductSourceIds.length > 0
      ? { ids: checkoutProductSourceIds as Id<"products">[] }
      : "skip",
  ) as Product[] | undefined;

  const checkoutProductById = useMemo(
    () => new Map((checkoutProducts ?? []).map((p) => [p._id, p])),
    [checkoutProducts],
  );

  // Payment boundary — quantity editing locks while submission is in flight,
  // the Razorpay attempt is live, or an order already exists at a FIXED
  // amount (pendingOrder: the retry flow charges pendingOrder.amount, so the
  // cart must not drift from it). Lock clears when the existing checkout
  // state machine returns to idle without a pending order. No second
  // payment state machine is introduced.
  const checkoutQtyLocked =
    isSubmitting || paymentStatus !== "idle" || pendingOrder !== null;

  // Per-line guard: while one line's store write is settling, further clicks
  // on THAT line are ignored (rapid duplicate clicks cannot double-apply).
  // Other lines stay editable — no global "everything is loading" state.
  const [pendingQtyIds, setPendingQtyIds] = useState<ReadonlySet<string>>(new Set());

  const handleCheckoutQuantityChange = useCallback(
    (cartItemId: string, nextQuantity: number) => {
      if (checkoutQtyLocked) return;
      if (pendingQtyIds.has(cartItemId)) return;
      if (!Number.isFinite(nextQuantity)) return;
      // Clamp to a valid quantity; minimum 1 keeps checkout inside the
      // existing cart contract (a checkout edit can never remove a line).
      const quantity = Math.max(1, Math.min(99, Math.floor(nextQuantity)));
      setPendingQtyIds((prev) => new Set(prev).add(cartItemId));
      // Single update path — the existing cart store remains the only
      // quantity authority (its merge/meal-deal/validation rules unchanged).
      updateQuantity(cartItemId, quantity);
      window.setTimeout(() => {
        setPendingQtyIds((prev) => {
          if (!prev.has(cartItemId)) return prev;
          const next = new Set(prev);
          next.delete(cartItemId);
          return next;
        });
      }, 0);
    },
    [checkoutQtyLocked, pendingQtyIds, updateQuantity],
  );

  // Order confirmation lookup — after order creation, we subscribe to the
  // authoritative order record from Convex so the confirmation screen always
  // shows correct totals (not derived from the now-empty cart).
  const [confirmLookup, setConfirmLookup] = useState<{ phone: string; orderNumber: string } | null>(null);

  // On mount (browser refresh), restore the order lookup from localStorage.
  const [persistedOrder] = useState(() => loadPersistedOrderConfirmation());
  const activeLookup = confirmLookup ?? persistedOrder;
  const confirmedOrder = useQuery(
    api.orders.getByPhoneAndOrderNumber,
    activeLookup
      ? { phone: activeLookup.phone, orderNumber: activeLookup.orderNumber }
      : "skip",
  );

  // ==========================================================================
  // Data Fetching — BU settings + global delivery policy
  // ==========================================================================

  // Reset selected BU if its items were removed from the cart
  useEffect(() => {
    if (selectedCheckoutBU && !cart.businessUnitIds.includes(selectedCheckoutBU)) {
      setSelectedCheckoutBU(null);
    }
  }, [selectedCheckoutBU, cart.businessUnitIds]);

  // Use the selected checkout BU for settings queries
  const primaryBusinessUnitId = selectedCheckoutBU ?? cart.businessUnitIds[0];

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    primaryBusinessUnitId
      ? { businessUnitId: primaryBusinessUnitId as any }
      : "skip"
  ) as BusinessUnitSettings | null | undefined;

  // Global delivery policy (not BU-owned)
  const deliveryPolicy = useQuery(
    api.deliveryPolicies.getActivePolicy,
  ) as { _id: string; name: string; serviceType: string; feeType: string; fixedFee?: number; minimumOrder?: number; freeDeliveryThreshold?: number; estimatedMinutes?: number; requiresQuote: boolean; instructions?: string } | null | undefined;

  // Global settings for payment config
  const globalSettings = useQuery(api.settings.getGlobalSettings);
  const whatsappPhone = (globalSettings?.paymentConfig?.whatsappNumber ?? FALLBACK_WHATSAPP_NUMBER).replace(/[^0-9]/g, "");

  // ==========================================================================
  // Store Open Status
  // ==========================================================================

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

  // Kitchen serviceability
  const customerLocation = useLocationStore();
  const activeBUs = useQuery(api.businessUnits.getAll) as
    | { _id: string; name: string; slug: string; enableDelivery: boolean; serviceabilityMode?: "coordinate_radius" | "pincode_region" | "manual"; originLatitude?: number; originLongitude?: number; deliveryRadiusKm?: number }[]
    | undefined;

  const kitchenServiceability = useMemo(() => {
    if (!activeBUs || checkoutItems.length === 0) return null;
    for (const bu of activeBUs) {
      // Configuration-driven: check serviceabilityMode, not slug/name.
      // coordinate_radius stores (Kitchen model) need Haversine distance validation.
      // Undefined serviceabilityMode defaults to coordinate_radius for legacy records.
      const mode = bu.serviceabilityMode ?? "coordinate_radius";
      if (mode !== "coordinate_radius") continue;
      const hasBuItems = checkoutItems.some((item) => item.businessUnitId === bu._id);
      if (!hasBuItems) continue;
      const svc = checkKitchenServiceability(customerLocation.location, bu);
      if (!svc.serviceable) return { buName: bu.name, ...svc };
    }
    return null;
  }, [activeBUs, checkoutItems, customerLocation.location]);

  // Can the customer place a delivery order with Kitchen items?
  const canPlaceKitchenDelivery = useMemo(() => {
    if (!kitchenServiceability) return true; // no issue
    if (form.orderType === "pickup") return true; // pickup bypasses delivery radius
    return false; // Kitchen items + delivery + outside radius
  }, [kitchenServiceability, form.orderType]);

  // Mart serviceability — determine if selected BU uses pincode_region mode
  const selectedBU = activeBUs?.find((bu) => bu._id === selectedCheckoutBU);
  const isMartPincodeMode = selectedBU?.serviceabilityMode === "pincode_region";

  // Server-side Mart delivery resolution — single canonical query combining
  // pincode serviceability + shipping quote into one atomic result.
  // This eliminates the contradiction where checkServiceability returned true
  // but quoteForCart returned false.
  const martDelivery = useQuery(
    api.shippingRates.resolveMartDelivery,
    isMartPincodeMode && form.orderType === "delivery" && form.destinationPincode && checkMartPincodeFormat(form.destinationPincode) && selectedCheckoutBU && checkoutItems.length > 0
      ? {
          businessUnitId: selectedCheckoutBU as Id<"businessUnits">,
          items: checkoutItems.map((item) => ({
            catalogItemId: item.catalogItemId as Id<"catalogItems">,
            variantName: item.variantName,
            quantity: item.quantity,
          })),
          destinationPincode: form.destinationPincode.trim(),
        }
      : "skip",
  ) as {
    serviceable: boolean;
    available: boolean;
    reason?: string;
    shippingCharge?: number;
    shippingZoneName?: string;
    shippingRateName?: string;
    actualWeightGrams?: number;
    billableWeightGrams?: number;
  } | undefined;

  // Can the customer place a delivery order with Mart items?
  const canPlaceMartDelivery = useMemo(() => {
    if (!isMartPincodeMode) return true; // not Mart pincode mode
    if (form.orderType === "pickup") return true; // pickup bypasses delivery check
    if (!form.destinationPincode || !checkMartPincodeFormat(form.destinationPincode)) return false;
    if (martDelivery === undefined) return false; // still loading
    if (!martDelivery.available) return false;
    return true;
  }, [isMartPincodeMode, form.orderType, form.destinationPincode, martDelivery]);

  // Combined delivery check — Kitchen + Mart
  const canPlaceDelivery = canPlaceKitchenDelivery && canPlaceMartDelivery;

  // ==========================================================================
  // Customer Profile + Saved Addresses + Loyalty
  // ==========================================================================

  const { isAuthenticated } = useAuth();
  const customer = useQuery(
    api.customers.getByAuthUser,
    isAuthenticated ? {} : "skip",
  ) as Customer | null | undefined;

  const savedAddresses = useQuery(
    api.addresses.getByCustomer,
    customer?._id ? { customerId: customer._id as Id<"customers"> } : "skip",
  ) as CustomerAddress[] | undefined;

  const loyaltySettings = useQuery(api.loyalty.getSettings, {});

  // Compute subtotal from checkout items only (selected BU)
  const checkoutSubtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [checkoutItems],
  );

  const loyaltyAccount = useQuery(
    api.loyalty.getBalance,
    customer?._id ? { customerId: customer._id as Id<"customers"> } : "skip",
  ) as LoyaltyAccount | undefined;

  const maxRedeemable = useQuery(
    api.loyalty.getMaxRedeemable,
    customer?._id && loyaltySettings
      ? {
          customerId: customer._id as Id<"customers">,
          orderTotal: checkoutSubtotal,
        }
      : "skip",
  );

  // ==========================================================================
  // Auto-fill from customer profile (once on load)
  // ==========================================================================

  const [profileAutoFilled, setProfileAutoFilled] = useState(false);

  useEffect(() => {
    if (profileAutoFilled || !customer) return;
    setForm((prev) => ({
      ...prev,
      customerName: prev.customerName || customer.name || "",
      customerPhone: prev.customerPhone || extractDigitsForInput(customer.phone || ""),
      customerEmail: prev.customerEmail || customer.email || "",
    }));
    // Auto-select default address
    if (savedAddresses && savedAddresses.length > 0 && !selectedAddressId) {
      const defaultAddr = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
      setSelectedAddressId(defaultAddr._id);
      setForm((prev) => ({
        ...prev,
        deliveryAddress: defaultAddr.address,
        deliveryNotes: defaultAddr.landmark ? `Landmark: ${defaultAddr.landmark}` : "",
        destinationPincode: defaultAddr.zipCode || prev.destinationPincode,
        destinationCity: defaultAddr.city?.trim() || "",
        destinationState: defaultAddr.state?.trim() || "",
      }));
    }
    setProfileAutoFilled(true);
  }, [customer, savedAddresses, profileAutoFilled, selectedAddressId]);

  // ==========================================================================
  // Loyalty Discount Calculation
  // ==========================================================================

  const loyaltyDiscount = useMemo(() => {
    if (!loyaltySettings || redeemPoints <= 0) return 0;
    const valuePerPoint = loyaltySettings.rupeesPerPointRedemption ?? 1;
    const maxDiscountByPercent = checkoutSubtotal * (loyaltySettings.maxRedeemPercentOfOrder / 100);
    const rawDiscount = redeemPoints * valuePerPoint;
    return Math.min(rawDiscount, maxDiscountByPercent, checkoutSubtotal);
  }, [loyaltySettings, redeemPoints, checkoutSubtotal]);

  // ==========================================================================
  // Pricing Calculation
  // ==========================================================================

  const pricing = useMemo(() => {
    const subtotal = checkoutSubtotal;
    const couponDiscount = couponApplied?.valid ? (couponApplied.discount ?? 0) : 0;
    const mealDealDiscount = checkoutMealDealSavings;
    const discount = cart.discount + couponDiscount + loyaltyDiscount + mealDealDiscount;
    const afterDiscount = Math.max(0, subtotal - discount);

    // Tax
    const taxRate = buSettings?.taxRate ?? 0;
    const tax = Math.round(afterDiscount * taxRate * 100) / 100;

    // Delivery fee
    let deliveryFee = 0;
    let freeDelivery = false;
    let estimatedMinutes: number | undefined;

    if (isMartPincodeMode && form.orderType === "delivery") {
      // Mart pincode-region: use server-authoritative delivery resolution
      if (martDelivery?.available && martDelivery.shippingCharge !== undefined) {
        deliveryFee = martDelivery.shippingCharge;
      }
      // If delivery resolution is loading or failed, deliveryFee stays 0 — Pay button will be disabled
    } else if (form.orderType === "delivery" && form.deliveryType === "local" && deliveryPolicy) {
      if (deliveryPolicy.feeType === "fixed" && deliveryPolicy.fixedFee !== undefined) {
        const threshold = deliveryPolicy.freeDeliveryThreshold;
        if (threshold && afterDiscount >= threshold) {
          freeDelivery = true;
          deliveryFee = 0;
        } else {
          deliveryFee = deliveryPolicy.fixedFee;
        }
        estimatedMinutes = deliveryPolicy.estimatedMinutes;
      }
    }
    // Outside-area and pickup: deliveryFee = 0

    const total = afterDiscount + deliveryFee + tax;

    return { subtotal, discount, afterDiscount, tax, taxRate, deliveryFee, freeDelivery, estimatedMinutes, total };
  }, [checkoutSubtotal, cart.discount, checkoutMealDealSavings, form.orderType, form.deliveryType, buSettings, deliveryPolicy, couponApplied, loyaltyDiscount, isMartPincodeMode, martDelivery]);

  // ==========================================================================
  // Defensive normalization — deliveryType is only meaningful for delivery orders.
  // When orderType is "pickup", effectiveDeliveryType is undefined so stale
  // outside_area state can never leak into pricing, validation, or submission.
  // ==========================================================================
  const effectiveDeliveryType =
    form.orderType === "delivery" ? form.deliveryType : undefined;

  // Whether "Local Delivery" should be shown as unavailable in the Delivery Area
  // RadioGroup. This integrates Kitchen serviceability with the legacy Delivery
  // Area selector without automatically switching the customer's selection.
  const localDeliveryUnavailable =
    form.orderType === "delivery" &&
    !!kitchenServiceability &&
    !kitchenServiceability.serviceable;

  const destinationCityState = useMemo(
    () =>
      resolveDestinationCityState({
        orderType: form.orderType,
        formCity: form.destinationCity,
        formState: form.destinationState,
        destinationPincode: form.destinationPincode,
        locationCity: customerLocation.location?.city,
        locationState: customerLocation.location?.state,
        locationZipCode: customerLocation.location?.zipCode,
      }),
    [form, customerLocation.location],
  );

  // ==========================================================================
  // Coupon Validation
  // ==========================================================================

  const couponValidation = useQuery(
    api.offers.validateCoupon,
    form.couponCode.trim() && primaryBusinessUnitId
      ? {
          code: form.couponCode.trim(),
          businessUnitId: primaryBusinessUnitId as any,
          subtotal: checkoutSubtotal,
        }
      : "skip"
  );

  const handleApplyCoupon = useCallback(() => {
    if (!form.couponCode.trim()) {
      setCouponApplied(null);
      return;
    }

    if (!couponValidation) return; // still loading

    if (!couponValidation.valid) {
      setCouponApplied({ valid: false, error: couponValidation.error });
      toast.error("Invalid coupon", { description: couponValidation.error });
      return;
    }

    setCouponApplied({
      valid: true,
      discount: couponValidation.discount,
      title: couponValidation.title,
    });
    toast.success("Coupon applied!", {
      description: `${couponValidation.title} — ${formatCurrency(couponValidation.discount ?? 0)} off`,
    });
  }, [form.couponCode, couponValidation, cart.subtotal]);

  const handleRemoveCoupon = useCallback(() => {
    setForm((prev) => ({ ...prev, couponCode: "" }));
    setCouponApplied(null);
  }, []);

  // ==========================================================================
  // ==========================================================================
  // Page Title
  // ==========================================================================

  useEffect(() => {
    document.title = `Checkout | ${SITE_NAME}`;
  }, []);

  // ==========================================================================
  // Redirect if cart is empty (but not after success)
  // ==========================================================================

  useEffect(() => {
    // A persisted/active confirmation lookup means the confirmation screen
    // (rendered below once confirmedOrder resolves) must win over the
    // empty-cart redirect — otherwise a browser refresh loses it.
    const awaitingConfirmation = !!activeLookup && confirmedOrder === undefined;
    const confirmationShown = !!orderSuccess || (!!activeLookup && !!confirmedOrder?.order);
    if (cart.items.length === 0 && !confirmationShown && !awaitingConfirmation) {
      // Small delay to avoid flash redirect
      const timer = setTimeout(() => {
        navigate(ROUTES.CART);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cart.items.length, navigate, orderSuccess, activeLookup, confirmedOrder]);

  // ==========================================================================
  // Form Handlers
  // ==========================================================================

  const updateField = useCallback(
    <K extends keyof CheckoutForm>(field: K, value: CheckoutForm[K]) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        // When switching to pickup, clear deliveryType so stale outside_area
        // state never leaks into the pickup flow.
        if (field === "orderType" && value === "pickup") {
          next.deliveryType = "local";
        }
        if (field === "deliveryAddress" || field === "destinationPincode") {
          next.destinationCity = "";
          next.destinationState = "";
        }
        return next;
      });
      // Clear error on edit
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [errors]
  );

  // ==========================================================================
  // Validation
  // ==========================================================================

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof CheckoutForm, string>> = {};

    if (!form.customerName.trim()) {
      newErrors.customerName = "Name is required";
    }
    if (!form.customerPhone.trim()) {
      newErrors.customerPhone = "Phone number is required";
    } else if (!validateIndianPhone(form.customerPhone)) {
      newErrors.customerPhone = "Enter a valid 10-digit Indian mobile number";
    }
    if (form.orderType === "delivery" && !form.deliveryAddress.trim()) {
      newErrors.deliveryAddress = "Delivery address is required";
    }

    // Mart pincode validation
    if (form.orderType === "delivery" && isMartPincodeMode) {
      if (!form.destinationPincode.trim()) {
        newErrors.destinationPincode = "Pincode is required for delivery";
      } else if (!checkMartPincodeFormat(form.destinationPincode)) {
        newErrors.destinationPincode = "Enter a valid 6-digit pincode";
      }
    }

    // Local delivery minimum order check
    if (form.orderType === "delivery" && form.deliveryType === "local" && deliveryPolicy?.minimumOrder) {
      if (pricing.afterDiscount < deliveryPolicy.minimumOrder) {
        newErrors.deliveryAddress = `Minimum order for local delivery is ${formatCurrency(deliveryPolicy.minimumOrder)}. Add ${formatCurrency(deliveryPolicy.minimumOrder - pricing.afterDiscount)} more to your cart.`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, isMartPincodeMode, deliveryPolicy, pricing]);

  // ==========================================================================
  // Submit Order
  // ==========================================================================

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) return;
      if (checkoutItems.length === 0) return;
      if (!selectedCheckoutBU) return;
      if (!storeIsOpen) {
        toast.error("Store is currently closed", {
          description: nextOpenTime
            ? `Orders can be placed starting ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
            : "Please try again during business hours.",
        });
        return;
      }

      setIsSubmitting(true);
      setPaymentStatus("creating_order");

      try {
        const orderResult = await createOrder({
          businessUnitId: selectedCheckoutBU as any,
          customerName: form.customerName.trim(),
          customerPhone: normalizeIndianPhone(form.customerPhone) ?? form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          items: checkoutItems.map((item) => ({
            catalogItemId: item.catalogItemId as any,
            itemType: item.itemType,
            name: item.name,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            image: item.image,
          })),
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          deliveryFee: pricing.deliveryFee,
          tax: pricing.tax,
          total: pricing.total,
          orderType: form.orderType,
          deliveryType: effectiveDeliveryType,
          deliveryAddress:
            form.orderType === "delivery"
              ? form.deliveryAddress.trim()
              : undefined,
          deliveryZoneId: undefined,
          deliveryNotes: form.deliveryNotes.trim() || undefined,
          destinationPincode: form.destinationPincode.trim() || undefined,
          destinationCity: destinationCityState.destinationCity,
          destinationState: destinationCityState.destinationState,
          offerCode: couponApplied?.valid ? form.couponCode.trim() : undefined,
          paymentMethod: "razorpay",
          idempotencyKey: getOrCreateIdempotencyKey(),
          loyaltyPointsToRedeem: redeemPoints > 0 ? redeemPoints : undefined,
          mealDealIds: checkoutMealDeals.map((d) => d.mealDealId),
          mealDealDiscount: checkoutMealDealSavings > 0 ? checkoutMealDealSavings : undefined,
          customerLatitude: customerLocation.location?.latitude,
          customerLongitude: customerLocation.location?.longitude,
        });

        const { orderId: newOrderId, orderNumber: newOrderNumber } = orderResult as { orderId: string; orderNumber: string };

        clearIdempotencyKey();

        setPendingOrder({
          orderId: newOrderId,
          orderNumber: newOrderNumber,
          amount: pricing.total,
          phone: form.customerPhone.trim(),
        });

        // Outside-area orders: show "Delivery Request Received" immediately,
        // no payment QR. Customer will be contacted for delivery quote.
        if (effectiveDeliveryType === "outside_area") {
          setOrderSuccess({
            orderNumber: newOrderNumber,
            orderId: newOrderId,
          });
          setConfirmLookup({ phone: form.customerPhone.trim(), orderNumber: newOrderNumber });
          persistOrderConfirmation(newOrderNumber, form.customerPhone.trim());
          removeByBusinessUnit(selectedCheckoutBU!);
          clearIdempotencyKey();
          toast.success("Delivery request submitted!", {
            description: "We'll contact you with a delivery quote shortly.",
          });
        } else {
          // Launch Razorpay checkout
          setPaymentStatus("processing_payment");
          const razorpayResult = await openRazorpayCheckout({
            orderId: newOrderId as Id<"orders">,
            amount: pricing.total,
            customerName: form.customerName.trim(),
            customerPhone: form.customerPhone.trim(),
            customerEmail: form.customerEmail.trim() || undefined,
            businessName: SITE_NAME,
            createRazorpayOrder: (args) => createRazorpayOrder(args as any),
            verifyRazorpayPayment: (args) => verifyRazorpayPayment(args as any),
          });

          if (razorpayResult.success) {
            // Payment verified — finalizePaidOrder runs server-side
            setOrderSuccess({
              orderNumber: newOrderNumber,
              orderId: newOrderId,
            });
            setConfirmLookup({ phone: form.customerPhone.trim(), orderNumber: newOrderNumber });
            persistOrderConfirmation(newOrderNumber, form.customerPhone.trim());
            removeByBusinessUnit(selectedCheckoutBU!);
            clearIdempotencyKey();
            toast.success("Payment successful!", {
              description: "Your order is being prepared.",
            });
          } else if (razorpayResult.error) {
            // Payment failed — show error but keep order for retry
            setPendingOrder({
              orderId: newOrderId,
              orderNumber: newOrderNumber,
              amount: pricing.total,
              phone: form.customerPhone.trim(),
            });
            toast.error("Payment failed", {
              description: razorpayResult.error,
            });
          } else {
            // Payment cancelled — keep order for retry
            setPendingOrder({
              orderId: newOrderId,
              orderNumber: newOrderNumber,
              amount: pricing.total,
              phone: form.customerPhone.trim(),
            });
            toast.info("Payment pending", {
              description: "Your order is reserved. Pay now or complete it later from Track Order.",
            });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Order creation failed";
        console.error("Checkout failed:", error);

        // 21D-B S6 — the server mixed-BU gate is authoritative. Send the
        // customer back to the store selection panel with the same guidance
        // the panel shows instead of a generic failure. No cart lines are
        // discarded and no server rule is bypassed.
        if (message.includes("MIXED_BUSINESS_UNIT_CHECKOUT_REQUIRED")) {
          setSelectedCheckoutBU(null);
          toast.error("Choose Store to Checkout", {
            description:
              "Your cart contains items from different stores. Please checkout each store separately.",
          });
          return;
        }

        const isAvailabilityError =
          message.includes("stock") ||
          message.includes("catalogItems") ||
          message.includes("does not match the expected Convex");
        // 14D: surface server-side minimum-order rejections verbatim so the
        // configured amount reaches the customer instead of a generic error.
        const isMinOrderError = message.toLowerCase().includes("minimum order");
        // 21D-B: variant/inventory fail-closed rejections are already written
        // as customer-facing copy ("Please review your cart.") — show them
        // verbatim so the customer knows exactly what to fix.
        const isVariantError = message.includes("selected variant");
        toast.error("Checkout failed", {
          description: isVariantError
            ? message
            : isAvailabilityError
              ? "Some items in your cart are no longer available. Please review your cart."
              : isMinOrderError
                ? message
                : "Please try again or contact support.",
        });
      } finally {
        setIsSubmitting(false);
        setPaymentStatus("idle");
      }
    },
    [validate, cart, form, pricing, createOrder, storeIsOpen, nextOpenTime, couponApplied, redeemPoints, checkoutItems, checkoutMealDeals, checkoutMealDealSavings, selectedCheckoutBU, effectiveDeliveryType, destinationCityState]
  );

  // ==========================================================================
  // Payment Success — handled by Razorpay + finalizePaidOrder (server-side).
  // ==========================================================================

  const handleRetryPayment = useCallback(async () => {
    if (!pendingOrder) return;
    setPaymentStatus("processing_payment");
    try {
      const razorpayResult = await openRazorpayCheckout({
        orderId: pendingOrder.orderId as Id<"orders">,
        amount: pendingOrder.amount,
        customerName: form.customerName.trim() || undefined,
        customerPhone: pendingOrder.phone,
        customerEmail: form.customerEmail.trim() || undefined,
        businessName: SITE_NAME,
        createRazorpayOrder: (args) => createRazorpayOrder(args as any),
        verifyRazorpayPayment: (args) => verifyRazorpayPayment(args as any),
      });

      if (razorpayResult.success) {
        setOrderSuccess({
          orderNumber: pendingOrder.orderNumber,
          orderId: pendingOrder.orderId,
        });
        setConfirmLookup({ phone: pendingOrder.phone, orderNumber: pendingOrder.orderNumber });
        persistOrderConfirmation(pendingOrder.orderNumber, pendingOrder.phone);
        if (selectedCheckoutBU) {
          removeByBusinessUnit(selectedCheckoutBU);
        }
        clearIdempotencyKey();
        toast.success("Payment successful!", {
          description: "Your order is being prepared.",
        });
      } else if (razorpayResult.error) {
        toast.error("Payment failed", {
          description: razorpayResult.error,
        });
      } else {
        toast.info("Payment pending", {
          description: "Your order is reserved. Pay now or complete it later from Track Order.",
        });
      }
    } catch {
      toast.error("Payment failed", {
        description: "Please try again or contact support.",
      });
    } finally {
      setPaymentStatus("idle");
    }
  }, [pendingOrder, form, createRazorpayOrder, verifyRazorpayPayment, selectedCheckoutBU, removeByBusinessUnit]);

  // ==========================================================================
  // Persisted order confirmation — recovers confirmation page on refresh
  // (initialized above via activeLookup = confirmLookup ?? persistedOrder)
  // ==========================================================================

  // ==========================================================================
  // Order Success State
  // ==========================================================================

  if (orderSuccess) {
    // Outside-area orders use the backend-driven confirmation page
    if (effectiveDeliveryType === "outside_area") {
      return <OutsideAreaConfirmation orderNumber={orderSuccess.orderNumber} phone={form.customerPhone.trim()} />;
    }

    // Non-outside-area: backend-driven confirmation screen.
    // Uses the authoritative order record from Convex so totals are always
    // correct even after clearCart(), on browser refresh, or after admin
    // payment verification.

    // Loading state while Convex query resolves
    if (confirmedOrder === undefined) {
      return (
        <div className="min-h-screen culinary-canvas">
          <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8 text-center space-y-4">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading your order...</p>
          </div>
        </div>
      );
    }

    return (
      <OrderConfirmationCard
        orderNumber={orderSuccess.orderNumber ?? "Processing..."}
        title="Payment Submitted for Verification"
        subtitle="Your payment has been recorded. We'll start preparing your order shortly."
        businessName={selectedBU?.name}
        order={confirmedOrder?.order}
      />
    );
  }

  // ==========================================================================
  // Empty Cart Redirect / Persisted Order Recovery
  // ==========================================================================

  if (cart.items.length === 0) {
    // Backend-driven confirmation: show the order from Convex subscription.
    // This handles fresh orders (after clearCart) AND browser refresh recovery
    // (orderSuccess state is lost but persistedOrder + confirmedOrder work).
    if (confirmedOrder?.order) {
      const order = confirmedOrder.order;
      return (
        <OrderConfirmationCard
          orderNumber={order.orderNumber}
          title={order.paymentStatus === "paid" ? "Order Confirmed" : "Payment Recorded"}
          subtitle={
            order.paymentStatus === "paid"
              ? "Your payment has been verified. We're preparing your order."
              : "Your payment has been recorded. We'll start preparing your order shortly."
          }
          businessName={selectedBU?.name}
          order={order}
        />
      );
    }

    // Persisted order exists but Convex query is still loading
    if (persistedOrder) {
      return (
        <div className="min-h-screen culinary-canvas">
          <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8 text-center space-y-4">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading your order...</p>
          </div>
        </div>
      );
    }

    // Genuinely empty cart
    return (
      <div className="min-h-screen culinary-canvas flex items-center justify-center">
        <EmptyState
          title="Your cart is empty"
          description="Add some items before checking out."
          icon={ShoppingCart}
          action={
            <Link to="/">
              <Button size="sm">Browse Stores</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // ==========================================================================
  // Checkout Form
  // ==========================================================================

  return (
    <div className="min-h-screen culinary-canvas">
      {/* Frosted breadcrumb strip — real checkout info only */}
      <div className="border-b border-white/60 bg-white/40 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link
              to={ROUTES.CART}
              className="transition-colors hover:text-foreground"
            >
              Cart
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-foreground">Checkout</span>
            {selectedBU && (
              <span className="ml-1 max-w-[160px] truncate rounded-full border border-culinary-outline-variant/60 bg-white/60 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md">
                {selectedBU.name}
              </span>
            )}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Inner frame preserves the established form/summary layout */}
        <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={ROUTES.CART}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Cart
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">Checkout</span>
          </div>
          <h1 className="font-culinary-heading text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your order details below
          </p>
        </motion.div>

        {/* Loading State — settings still loading */}
        {buSettings === undefined && primaryBusinessUnitId && !isMixedCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-12"
          >
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading checkout details...</span>
            </div>
          </motion.div>
        )}

        {/* Store Closed Banner */}
        {buSettings && !storeIsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Store is currently closed
                </p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  {nextOpenTime
                    ? `Orders can be placed starting ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}.`
                    : "Please try again during business hours."}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Kitchen Delivery Serviceability Warning */}
        {kitchenServiceability && form.orderType === "delivery" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
          >
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  {kitchenServiceability.buName} does not deliver to this location
                </p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {kitchenServiceability.reason === "NO_CUSTOMER_COORDINATES"
                    ? "Set your delivery location to check availability."
                    : kitchenServiceability.reason === "NEAR_BOUNDARY_APPROXIMATE"
                      ? "Your PIN is near our delivery boundary. Please use GPS or enter your full address for precise availability."
                      : kitchenServiceability.distanceKm !== null && kitchenServiceability.radiusKm !== null
                        ? `Approx. ${kitchenServiceability.distanceKm} km away — delivery radius is ${kitchenServiceability.radiusKm} km.`
                        : "Choose pickup or change your delivery location."}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Payment Pending Banner — order created but payment not confirmed */}
        {pendingOrder && !orderSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Payment pending for order {pendingOrder.orderNumber}
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Your order is reserved for{" "}
                    {formatCurrency(pendingOrder.amount)}. Complete the UPI
                    payment to confirm it.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleRetryPayment}
                  className="gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Pay Now
                </Button>
                <Link to={ROUTES.TRACK_ORDER}>
                  <Button size="sm" variant="ghost" className="gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    Track Order
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            {/* ================================================================ */}
            {/* MIXED CART — BU SELECTION                                         */}
            {/* ================================================================ */}

            {isMixedCart && !selectedCheckoutBU && (
              <div className="lg:col-span-2 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-3xl glass-tier-1 border border-border/60 p-5 sm:p-6 space-y-4"
                >
                  <div>
                    <h2 className="font-culinary-heading text-lg font-bold tracking-tight">Choose Store to Checkout</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your cart contains items from different stores. Please checkout each store separately.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {cart.businessUnitIds.map((buId) => {
                      const bu = activeBUs?.find((b) => b._id === buId);
                      const buItemCount = cart.items
                        .filter((item) => item.businessUnitId === buId)
                        .reduce((sum, item) => sum + item.quantity, 0);
                      const buSubtotal = cart.items
                        .filter((item) => item.businessUnitId === buId)
                        .reduce((sum, item) => sum + item.totalPrice, 0);
                      return (
                        <button
                          key={buId}
                          type="button"
                          onClick={() => setSelectedCheckoutBU(buId)}
                          className="flex items-start gap-4 rounded-2xl glass-tier-1 border border-border/60 p-5 text-left transition-all hover:border-primary hover:bg-primary/5 hover:ring-1 hover:ring-primary cursor-pointer"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            {bu?.serviceabilityMode === "pincode_region" ? (
                              <ShoppingCart className="h-5 w-5" />
                            ) : (
                              <Store className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-culinary-heading font-bold">{bu?.name ?? "Store"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {buItemCount} item{buItemCount !== 1 ? "s" : ""} · <span className="font-semibold text-foreground">{formatCurrency(buSubtotal)}</span>
                            </p>
                          </div>
                          <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0 mt-1" />
                        </button>
                      );
                    })}
                  </div>

                  <Link
                    to={ROUTES.CART}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Cart
                  </Link>
                </motion.div>
              </div>
            )}

            {/* ================================================================ */}
            {/* CHECKOUT FORM                                                   */}
            {/* ================================================================ */}

            {(!isMixedCart || selectedCheckoutBU) && (
            <div className="space-y-6">
              {/* Contact Information */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="rounded-2xl glass-tier-1 border border-border/60 p-5 sm:p-6"
              >
                <h2 className="font-culinary-heading font-bold mb-4">Contact Information</h2>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="customerName"
                      placeholder="John Doe"
                      value={form.customerName}
                      onChange={(e) => updateField("customerName", e.target.value)}
                      className={cn(errors.customerName && "border-destructive")}
                    />
                    {errors.customerName && (
                      <p className="text-xs text-destructive">{errors.customerName}</p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">
                        Phone Number <span className="text-destructive">*</span>
                      </Label>
                      <PhoneInput
                        id="customerPhone"
                        value={form.customerPhone}
                        onChange={(val) => updateField("customerPhone", val)}
                        error={!!errors.customerPhone}
                      />
                      {errors.customerPhone && (
                        <p className="text-xs text-destructive">{errors.customerPhone}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="customerEmail">Email (optional)</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        placeholder="john@example.com"
                        value={form.customerEmail}
                        onChange={(e) => updateField("customerEmail", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Order Type */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="rounded-2xl glass-tier-1 border border-border/60 p-5 sm:p-6"
              >
                <h2 className="font-culinary-heading font-bold mb-4">Order Type</h2>

                <RadioGroup
                  value={form.orderType}
                  onValueChange={(val) =>
                    updateField("orderType", val as "delivery" | "pickup")
                  }
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all",
                      form.orderType === "delivery"
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                        : "border-border/60 bg-card hover:border-border"
                    )}
                  >
                    <RadioGroupItem value="delivery" className="sr-only" />
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        form.orderType === "delivery"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Truck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-culinary-heading text-sm font-bold">Delivery</p>
                      <p className="text-xs text-muted-foreground">
                        Delivered to your door
                      </p>
                    </div>
                  </label>

                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all",
                      form.orderType === "pickup"
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                        : "border-border/60 bg-card hover:border-border"
                    )}
                  >
                    <RadioGroupItem value="pickup" className="sr-only" />
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        form.orderType === "pickup"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Store className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-culinary-heading text-sm font-bold">Pickup</p>
                      <p className="text-xs text-muted-foreground">
                        Collect from store
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </motion.div>

              {/* Delivery Address (conditional) */}
              <AnimatePresence mode="wait">
                {form.orderType === "delivery" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-2xl glass-tier-1 border border-border/60 p-5 sm:p-6 space-y-4">
                      <h2 className="font-culinary-heading font-bold">Delivery Details</h2>

                      {/* Mart Pincode Delivery — when BU uses pincode_region mode */}
                      {isMartPincodeMode ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-primary" />
                            <Label className="text-sm font-medium">Home Delivery</Label>
                          </div>
                          <div className="grid gap-2 sm:max-w-xs">
                            <Label htmlFor="destinationPincode">Destination Pincode *</Label>
                            <Input
                              id="destinationPincode"
                              value={form.destinationPincode}
                              onChange={(e) => updateField("destinationPincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6-digit pincode"
                              maxLength={6}
                              required
                            />
                            {errors.destinationPincode && (
                              <p className="text-xs text-destructive">{errors.destinationPincode}</p>
                            )}
                          </div>
                          {form.destinationPincode.length === 6 && (
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              {martDelivery !== undefined ? (martDelivery.available ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  <span>Delivery available</span>
                                </>
                              ) : true && martDelivery.reason ? (
                                <span>{getMartDeliveryErrorMessage(martDelivery.reason)}</span>
                              ) : martDelivery === undefined && form.destinationPincode.length > 0 ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <span>Enter a valid 6-digit pincode</span>
                              )) : null}
                            </div>
                          )}
                          {form.destinationPincode && checkMartPincodeFormat(form.destinationPincode) && martDelivery !== undefined && (
                            <div className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                              martDelivery.available
                                ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200"
                            )}>
                              {martDelivery.available ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Delivery available to {form.destinationPincode}</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>{getMartDeliveryErrorMessage(martDelivery.reason)}</span>
                                </>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Shipping charges will be calculated at checkout based on your location.
                          </p>
                        </div>
                      ) : (
                      /* Kitchen Delivery Type Selection — Local vs Outside Area */
                      <div className="space-y-2">
                        <Label>Delivery Area</Label>
                        <RadioGroup
                          value={effectiveDeliveryType ?? "local"}
                          onValueChange={(val) =>
                            updateField("deliveryType", val as "local" | "outside_area")
                          }
                          className="space-y-2"
                        >
                           {/* Local Delivery */}
                            <label
                              className={cn(
                                "flex items-center gap-3 rounded-xl border p-3 transition-all sm:p-4",
                                localDeliveryUnavailable
                                  ? "border-border/40 bg-secondary/30 opacity-60 cursor-not-allowed"
                                  : effectiveDeliveryType === "local"
                                    ? "cursor-pointer border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "cursor-pointer border-border/60 bg-card hover:border-border"
                              )}
                            >
                            <RadioGroupItem value="local" className="sr-only" />
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                localDeliveryUnavailable
                                  ? "bg-secondary text-muted-foreground/50"
                                  : effectiveDeliveryType === "local"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-secondary text-muted-foreground"
                              )}
                            >
                              <Truck className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">Local Delivery</p>
                              {localDeliveryUnavailable ? (
                                <p className="text-xs text-muted-foreground">
                                  {kitchenServiceability?.reason === "NO_CUSTOMER_COORDINATES"
                                    ? "Not available until a delivery location is set."
                                    : kitchenServiceability?.reason === "NEAR_BOUNDARY_APPROXIMATE"
                                      ? "PIN near boundary — use GPS or full address for precise availability."
                                      : kitchenServiceability?.reason === "NO_BU_ORIGIN" ||
                                          kitchenServiceability?.reason === "NO_RADIUS_CONFIGURED"
                                        ? `${kitchenServiceability?.buName ?? "Store"} delivery is currently unavailable.`
                                        : kitchenServiceability?.distanceKm !== null &&
                                            kitchenServiceability?.radiusKm !== null
                                          ? `Not available for your location \u00B7 ${kitchenServiceability?.buName ?? "Store"} radius: ${kitchenServiceability.radiusKm} km`
                                          : "Not available for your current location"}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {deliveryPolicy?.fixedFee !== undefined
                                    ? `${formatCurrency(deliveryPolicy.fixedFee)}${deliveryPolicy.estimatedMinutes ? ` \u00B7 ~${deliveryPolicy.estimatedMinutes} min` : ""}`
                                    : "Delivery available"}
                                  {deliveryPolicy?.minimumOrder ? ` \u00B7 Min ${formatCurrency(deliveryPolicy.minimumOrder)}` : ""}
                                  {deliveryPolicy?.freeDeliveryThreshold ? ` \u00B7 Free above ${formatCurrency(deliveryPolicy.freeDeliveryThreshold)}` : ""}
                                </p>
                              )}
                            </div>
                            {deliveryPolicy?.fixedFee !== undefined && (
                              <span className="text-sm font-semibold">
                                {pricing.freeDelivery ? "Free" : formatCurrency(deliveryPolicy.fixedFee)}
                              </span>
                            )}
                          </label>

                           {/* Outside Local Area */}
                           <label
                             className={cn(
                               "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all sm:p-4",
                               effectiveDeliveryType === "outside_area"
                                 ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                 : "border-border/60 bg-card hover:border-border"
                             )}
                           >
                            <RadioGroupItem value="outside_area" className="sr-only" />
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                effectiveDeliveryType === "outside_area"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-secondary text-muted-foreground"
                              )}
                            >
                              <MapPin className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">Outside Local Area</p>
                              <p className="text-xs text-muted-foreground">
                                Delivery charge confirmed separately \u00B7 We&apos;ll arrange delivery
                              </p>
                            </div>
                            <span className="text-sm text-muted-foreground">Quote</span>
                          </label>
                        </RadioGroup>
                      </div>
                      )}

                      {/* Local Delivery Info — Kitchen only */}
                      {effectiveDeliveryType === "local" && deliveryPolicy && !localDeliveryUnavailable && (
                        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Truck className="h-4 w-4 text-primary" />
                            <span>{deliveryPolicy.name}</span>
                          </div>
                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Delivery fee</span>
                              <span className={cn("font-medium", pricing.freeDelivery ? "text-emerald-600" : "text-foreground")}>
                                {pricing.freeDelivery ? "Free" : formatCurrency(deliveryPolicy.fixedFee ?? 0)}
                              </span>
                            </div>
                            {deliveryPolicy.estimatedMinutes && (
                              <div className="flex justify-between">
                                <span>Estimated time</span>
                                <span className="font-medium text-foreground">~{deliveryPolicy.estimatedMinutes} min</span>
                              </div>
                            )}
                            {deliveryPolicy.minimumOrder && (
                              <div className="flex justify-between">
                                <span>Minimum order</span>
                                <span className={cn("font-medium", pricing.afterDiscount >= deliveryPolicy.minimumOrder ? "text-emerald-600" : "text-foreground")}>
                                  {formatCurrency(deliveryPolicy.minimumOrder)}
                                  {pricing.afterDiscount >= deliveryPolicy.minimumOrder ? " (met)" : ""}
                                </span>
                              </div>
                            )}
                            {deliveryPolicy.freeDeliveryThreshold && (
                              <div className="flex justify-between">
                                <span>Free delivery above</span>
                                <span className="font-medium text-foreground">{formatCurrency(deliveryPolicy.freeDeliveryThreshold)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Outside Area Info */}
                      {effectiveDeliveryType === "outside_area" && (
                        <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium">Outside our local delivery area</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                We currently provide local delivery in our service area. If you&apos;re outside our local area, we may still be able to arrange delivery through a delivery partner. Delivery charges will be confirmed based on your location.
                              </p>
                            </div>
                          </div>
                          <a
                            href={`https://wa.me/${whatsappPhone}?text=Hi%20MB%20Crunchy%2C%20I%27d%20like%20to%20arrange%20delivery%20for%20my%20order.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                          >
                            <MessageCircle className="h-4 w-4" />
                            Request Delivery Assistance
                          </a>
                        </div>
                      )}

                      {/* Saved Addresses */}
                      {savedAddresses && savedAddresses.length > 0 && (
                        <div className="space-y-2">
                          <Label>Saved Addresses</Label>
                          <div className="space-y-2">
                            {savedAddresses.map((addr) => (
                              <label
                                key={addr._id}
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all sm:p-4",
                                  selectedAddressId === addr._id
                                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "border-border/60 bg-card hover:border-border"
                                )}
                                onClick={() => {
                                  setSelectedAddressId(addr._id);
                                  setForm((prev) => ({
                                    ...prev,
                                    deliveryAddress: addr.address,
                                    deliveryNotes: addr.landmark
                                      ? `Landmark: ${addr.landmark}`
                                      : addr.deliveryInstructions || prev.deliveryNotes,
                                    destinationPincode: addr.zipCode || prev.destinationPincode,
                                    destinationCity: addr.city?.trim() || "",
                                    destinationState: addr.state?.trim() || "",
                                  }));
                                }}
                              >
                                <div
                                  className={cn(
                                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                                    selectedAddressId === addr._id
                                      ? "border-primary"
                                      : "border-muted-foreground/30"
                                  )}
                                >
                                  {selectedAddressId === addr._id && (
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{addr.label}</span>
                                    {addr.isDefault && (
                                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                        Default
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {addr.address}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                          <Separator className="my-2" />
                          <p className="text-xs text-muted-foreground">
                            Or enter a custom address below:
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="deliveryAddress">Delivery Address *</Label>
                        <Textarea
                          id="deliveryAddress"
                          placeholder="Enter your full delivery address..."
                          value={form.deliveryAddress}
                          onChange={(e) =>
                            updateField("deliveryAddress", e.target.value)
                          }
                          className={cn(
                            "min-h-[80px]",
                            errors.deliveryAddress && "border-destructive"
                          )}
                        />
                        {errors.deliveryAddress && (
                          <p className="text-xs text-destructive">
                            {errors.deliveryAddress}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="deliveryNotes">
                          Delivery Notes (optional)
                        </Label>
                        <Textarea
                          id="deliveryNotes"
                          placeholder="Apartment number, gate code, special instructions..."
                          value={form.deliveryNotes}
                          onChange={(e) =>
                            updateField("deliveryNotes", e.target.value)
                          }
                          className="min-h-[60px]"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pickup note */}
              {form.orderType === "pickup" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl glass-tier-1 border border-border/60 bg-secondary/30 p-5 sm:p-6"
                >
                  <h2 className="font-culinary-heading font-bold mb-2">Pickup Information</h2>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Your order will be ready for pickup at the store. We&apos;ll
                      notify you when it&apos;s ready.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Ready for pickup in: {DEFAULT_PICKUP_ESTIMATE}</span>
                    </div>
                    {buSettings && (
                      <StoreStatusDot
                        isOpen={buSettings.isOpen}
                        openingHours={buSettings.openingHours}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </div>
            )}

            {/* ================================================================ */}
            {/* ORDER SUMMARY                                                   */}
            {/* ================================================================ */}

            {(!isMixedCart || selectedCheckoutBU) && (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                // Culinary Glass Tier 3 (Phase 3, receipt treatment in 6B).
                // Contents, pricing, and behavior unchanged.
                className="rounded-3xl glass-tier-3 border border-border/60 p-5 sm:p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-culinary-heading text-lg font-bold tracking-tight">Order Summary</h2>
                  <span className="text-xs text-muted-foreground">
                    {checkoutItems.reduce((sum, item) => sum + item.quantity, 0)} item{checkoutItems.reduce((sum, item) => sum + item.quantity, 0) !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* One-time notice: stale cart references were removed on load */}
                {cart.notice?.type === "items_removed" && cart.notice.itemNames.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="flex-1 text-xs text-amber-800">
                      {cart.notice.itemNames.join(", ")}{" "}
                      {cart.notice.itemNames.length === 1 ? "was" : "were"} removed
                      because {cart.notice.itemNames.length === 1 ? "it is" : "they are"} no
                      longer available.
                    </p>
                    <button
                      type="button"
                      onClick={dismissNotice}
                      className="shrink-0 text-amber-600 hover:text-amber-800"
                      aria-label="Dismiss notice"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Items */}
                <div className="max-h-48 space-y-3 overflow-y-auto">
                  {checkoutItems.map((item) => {
                    // Phase 21D-D — stale-price state for this line (mirrors
                    // the 21D-C CartPage indicator: same resolution, same
                    // threshold, same updateVariant remedy).
                    const catalogEntry = checkoutCatalogById.get(item.catalogItemId);
                    const productDoc =
                      item.itemType === "product" && catalogEntry?.sourceId
                        ? checkoutProductById.get(catalogEntry.sourceId)
                        : undefined;
                    const currentPrice = resolveCurrentLinePrice(
                      item,
                      catalogEntry,
                      productDoc,
                    );
                    const stalePrice =
                      currentPrice !== null &&
                      Math.abs(currentPrice - item.unitPrice) > STALE_PRICE_THRESHOLD
                        ? currentPrice
                        : null;
                    const lineQtyLocked =
                      checkoutQtyLocked || pendingQtyIds.has(item.cartItemId ?? "cl_0");
                    return (
                      <div
                        key={item.cartItemId ?? `${item.catalogItemId}-${item.variantName}`}
                        className="flex items-center gap-3"
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <ImageOff className="h-4 w-4 text-muted-foreground/30" />
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {item.quantity}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.name}
                          </p>
                          {item.bundleItems && item.bundleItems.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {item.bundleItems.map((bi, i) => (
                                <span key={i}>
                                  {bi.quantity}× {bi.name}{i < item.bundleItems!.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {item.variantName}
                            </p>
                          )}
                          {stalePrice !== null && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/30">
                              <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                                Price changed
                              </span>
                              <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                Now {formatCurrency(stalePrice)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={lineQtyLocked}
                                onClick={() => {
                                  const applied = updateVariant(
                                    item.cartItemId ?? "cl_0",
                                    {
                                      variantName: item.variantName,
                                      unitPrice: stalePrice,
                                    },
                                  );
                                  if (!applied) {
                                    toast.error("Couldn't update price", {
                                      description: `${item.name} could not be updated. Your cart was not changed.`,
                                    });
                                  }
                                }}
                                className="h-5 px-1.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-100 dark:hover:bg-amber-900/40"
                                aria-label={`Update price of ${item.name}`}
                              >
                                Update price
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-sm font-medium">
                            {formatCurrency(item.totalPrice)}
                          </span>
                          {/* Phase 21D-D — checkout quantity: keyed to this
                              line's cartItemId, min 1, store is the only
                              authority, locked across the payment boundary. */}
                          <QuantitySelector
                            value={item.quantity}
                            onChange={(qty) =>
                              handleCheckoutQuantityChange(
                                item.cartItemId ?? "cl_0",
                                qty,
                              )
                            }
                            min={1}
                            max={99}
                            size="sm"
                            disabled={lineQtyLocked}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                {/* Coupon Code */}
                <div className="space-y-2 rounded-2xl border border-border/50 bg-white/50 p-3 dark:bg-white/5">
                  <Label htmlFor="couponCode" className="font-culinary-heading text-sm font-bold">
                    Coupon Code
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="couponCode"
                      placeholder="Enter code"
                      value={form.couponCode}
                      onChange={(e) => {
                        updateField("couponCode", e.target.value.toUpperCase());
                        if (couponApplied?.valid) setCouponApplied(null);
                      }}
                      className={cn(
                        "flex-1",
                        couponApplied?.valid && "border-emerald-500",
                        couponApplied && !couponApplied.valid && "border-destructive"
                      )}
                    />
                    {couponApplied?.valid ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveCoupon}
                        className="shrink-0 text-destructive"
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleApplyCoupon}
                        disabled={!form.couponCode.trim() || couponValidation === undefined}
                        className="shrink-0"
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                  {couponApplied?.valid && couponApplied.discount && (
                    <p className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      {couponApplied.title} — {formatCurrency(couponApplied.discount)} off
                    </p>
                  )}
                  {couponApplied && !couponApplied.valid && couponApplied.error && (
                    <p className="text-xs text-destructive">{couponApplied.error}</p>
                  )}
                </div>

                {/* Loyalty Points Redemption */}
                {customer && loyaltyAccount && loyaltyAccount.pointsBalance > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-500" />
                          Loyalty Points
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {loyaltyAccount.pointsBalance} available
                        </span>
                      </div>
                      {maxRedeemable && maxRedeemable.maxPoints > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={maxRedeemable.maxPoints}
                              value={redeemPoints || ""}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Math.min(
                                    maxRedeemable.maxPoints,
                                    parseInt(e.target.value) || 0,
                                  ),
                                );
                                setRedeemPoints(val);
                              }}
                              placeholder="0"
                              className="h-8 text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              onClick={() => setRedeemPoints(maxRedeemable.maxPoints)}
                            >
                              Use Max
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Up to {maxRedeemable.maxPoints} points ({formatCurrency(maxRedeemable.maxValue)} value)
                          </p>
                        </div>
                      )}
                      {!maxRedeemable && (
                        <p className="text-xs text-muted-foreground">
                          Checking redeemable points...
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* Totals */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(pricing.subtotal)}
                    </span>
                  </div>
                  {pricing.discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span>
                      <span className="font-medium">
                        -{formatCurrency(pricing.discount)}
                      </span>
                    </div>
                  )}
                  {loyaltyDiscount > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Points Redeemed
                      </span>
                      <span className="font-medium">
                        -{formatCurrency(loyaltyDiscount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {form.orderType === "delivery" ? "Delivery Fee" : "Pickup"}
                    </span>
                    <span className={cn("font-medium", pricing.freeDelivery && "text-emerald-600")}>
                      {form.orderType === "delivery"
                        ? effectiveDeliveryType === "outside_area"
                          ? "To be confirmed"
                          : isMartPincodeMode
                            ? martDelivery === undefined
                              ? "Calculating..."
                              : !martDelivery.available
                                ? "Unavailable"
                                : pricing.freeDelivery
                                  ? "Free"
                                  : formatCurrency(pricing.deliveryFee)
                            : pricing.freeDelivery
                              ? "Free"
                              : formatCurrency(pricing.deliveryFee)
                        : "Free"}
                    </span>
                  </div>
                  {isMartPincodeMode && form.orderType === "delivery" && martDelivery?.available && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Shipping</span>
                      <span>{martDelivery.shippingZoneName || "Standard"}</span>
                    </div>
                  )}
                  {pricing.tax > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Tax ({(pricing.taxRate * 100).toFixed(1)}%)
                      </span>
                      <span className="font-medium">
                        {formatCurrency(pricing.tax)}
                      </span>
                    </div>
                  )}
                  {pricing.estimatedMinutes && form.orderType === "delivery" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <Clock className="h-3 w-3" />
                      <span>Estimated delivery: ~{pricing.estimatedMinutes} min</span>
                    </div>
                  )}
                  {form.orderType === "pickup" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <Clock className="h-3 w-3" />
                      <span>Ready for pickup in: {DEFAULT_PICKUP_ESTIMATE}</span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Delivery/Pickup Estimate Badge */}
                {form.orderType === "delivery" && pricing.estimatedMinutes && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs font-medium">
                      Estimated delivery: ~{pricing.estimatedMinutes} minutes
                    </p>
                  </div>
                )}
                {form.orderType === "pickup" && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs font-medium">
                      Ready for pickup in: {DEFAULT_PICKUP_ESTIMATE}
                    </p>
                  </div>
                )}

                <div className="flex items-baseline justify-between">
                  <span className="font-culinary-heading text-lg font-bold">{effectiveDeliveryType === "outside_area" ? "Amount Due Now" : "Total"}</span>
                  <span className="font-culinary-heading text-xl font-extrabold tracking-tight tabular-nums">{effectiveDeliveryType === "outside_area" ? formatCurrency(pricing.subtotal - pricing.discount + pricing.tax) : formatCurrency(pricing.total)}</span>
                </div>
                {effectiveDeliveryType === "outside_area" && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Delivery charge will be confirmed separately via WhatsApp
                  </p>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  variant="crunch"
                  className={cn(
                    "h-12 w-full font-culinary-heading text-base transition-all",
                    isSubmitting && "opacity-80"
                  )}
                  disabled={
                    isSubmitting || !storeIsOpen || !canPlaceDelivery ||
                    // Mart: disable while delivery resolution loads or if unavailable
                    (isMartPincodeMode && form.orderType === "delivery" && (
                      martDelivery === undefined ||
                      !martDelivery.available
                    ))
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {paymentStatus === "processing_payment"
                        ? "Processing Payment..."
                        : paymentStatus === "creating_order"
                          ? "Creating Order..."
                          : "Processing..."}
                    </>
                  ) : !storeIsOpen ? (
                    "Store is Closed"
                  ) : !canPlaceDelivery ? (
                    !canPlaceKitchenDelivery ? `${kitchenServiceability?.buName ?? "Store"} Delivery Not Available` : "Delivery Not Available"
                  ) : isMartPincodeMode && form.orderType === "delivery" && martDelivery === undefined ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Calculating Shipping...
                    </>
                  ) : isMartPincodeMode && form.orderType === "delivery" && martDelivery && !martDelivery.available ? (
                    getMartDeliveryErrorMessage(martDelivery.reason)
                  ) : effectiveDeliveryType === "outside_area" ? (
                    <>
                      <MessageCircle className="mr-2 h-5 w-5" />
                      Request Delivery Quote
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Pay {formatCurrency(pricing.total)}
                    </>
                  )}
                </Button>

                {!canPlaceKitchenDelivery && (
                  <p className="text-center text-xs text-red-600">
                    {kitchenServiceability?.reason === "NO_CUSTOMER_COORDINATES"
                      ? "Please set your delivery location to continue."
                      : kitchenServiceability?.reason === "NEAR_BOUNDARY_APPROXIMATE"
                        ? "Your PIN is near the delivery boundary. Please use GPS or enter your full address."
                        : `${kitchenServiceability?.buName ?? "Store"} does not deliver to this location. Change location, choose pickup, or remove ${kitchenServiceability?.buName ?? "Store"} items.`}
                  </p>
                )}

                {isMartPincodeMode && !canPlaceMartDelivery && form.orderType === "delivery" && (
                  <p className="text-center text-xs text-red-600">
                    {!form.destinationPincode
                      ? "Enter a destination pincode to check delivery availability."
                      : !checkMartPincodeFormat(form.destinationPincode)
                        ? "Enter a valid 6-digit pincode."
                        : martDelivery && !martDelivery.available
                          ? getMartDeliveryErrorMessage(martDelivery.reason)
                          : "Checking delivery availability..."}
                  </p>
                )}

                {!storeIsOpen && (
                  <p className="text-center text-xs text-amber-600">
                    {nextOpenTime
                      ? `Orders resume ${nextOpenTime.dayLabel} at ${nextOpenTime.timeFormatted}`
                      : "Ordering is temporarily unavailable"}
                  </p>
                )}

                <p className="text-center text-[10px] text-muted-foreground">
                  By placing this order, you agree to our terms of service.
                </p>
              </motion.div>
            </div>
            )}
          </div>
        </form>
        </div>
      </div>

    </div>
  );
}
