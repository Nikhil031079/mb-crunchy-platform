import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
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
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";

// Hooks
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

// Customer components
import { StoreStatusDot } from "@/components/customer/StoreStatusBadge";
import { PaymentQR } from "@/components/customer/PaymentQR";
import { PaymentPendingCard } from "@/components/customer/PaymentPendingCard";

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
  Customer,
  CustomerAddress,
  LoyaltySettings,
  LoyaltyAccount,
} from "@/types";
import type { Id } from "@convex/_generated/dataModel";

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
// Outside-area order persistence — survives browser refresh so the
// confirmation page can recover the order via a reactive Convex query.
// ============================================================================

const OUTSIDE_AREA_ORDER_KEY = "mb_outside_area_order";

function persistOutsideAreaOrder(orderNumber: string, phone: string) {
  try {
    localStorage.setItem(
      OUTSIDE_AREA_ORDER_KEY,
      JSON.stringify({ orderNumber, phone })
    );
  } catch {
    // localStorage unavailable — non-critical, fallback to fresh state
  }
}

function loadPersistedOutsideAreaOrder(): { orderNumber: string; phone: string } | null {
  try {
    const raw = localStorage.getItem(OUTSIDE_AREA_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.orderNumber && parsed?.phone) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearPersistedOutsideAreaOrder() {
  try {
    localStorage.removeItem(OUTSIDE_AREA_ORDER_KEY);
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
      clearPersistedOutsideAreaOrder();
    }
  }, [order?.status]);

  // Loading state
  if (tracked === undefined) {
    return (
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background">
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
    clearPersistedOutsideAreaOrder();
    return (
      <div className="min-h-screen bg-background">
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

  const whatsappPhone = (globalSettings?.paymentConfig?.whatsappNumber ?? "").replace(/[^0-9]/g, "");
  const orderSubtotal = order.subtotal - order.discount;
  const whatsappMsg = encodeURIComponent(
    `Hi MB Crunchy,\n\nI have requested outside-area delivery.\n\nOrder: ${order.orderNumber}\nOrder value: ${formatCurrency(orderSubtotal)}\n\nPlease check delivery availability and confirm the delivery charge.`
  );

  // ── QUOTE PENDING ────────────────────────────────────────────────────────
  if (quoteStatus === "pending") {
    return (
      <div className="min-h-screen bg-background">
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
                <li>We&apos;ll confirm the courier/delivery charge with you.</li>
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
    <div className="min-h-screen bg-background">
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
  const { cart, clearCart, itemCount, dismissNotice } = useCart();
  const createOrder = useMutation(api.orders.create);
  const claimPayment = useMutation(api.orders.claimPayment);
  const redeemPointsMutation = useMutation(api.loyalty.redeemPoints);

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
  const [showPaymentQR, setShowPaymentQR] = useState(false);
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
  // Data Fetching — BU settings + global delivery policy
  // ==========================================================================

  // Use the first business unit from cart for settings queries
  const primaryBusinessUnitId = cart.businessUnitIds[0];

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

  // ==========================================================================
  // Store Open Status
  // ==========================================================================

  const storeIsOpen = buSettings ? isStoreCurrentlyOpen(buSettings) : true;
  const nextOpenTime = buSettings && !storeIsOpen ? getNextOpenTime(buSettings) : null;

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
  const loyaltyAccount = useQuery(
    api.loyalty.getBalance,
    customer?._id ? { customerId: customer._id as Id<"customers"> } : "skip",
  ) as LoyaltyAccount | undefined;

  const maxRedeemable = useQuery(
    api.loyalty.getMaxRedeemable,
    customer?._id && loyaltySettings
      ? {
          customerId: customer._id as Id<"customers">,
          orderTotal: cart.subtotal,
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
      customerPhone: prev.customerPhone || customer.phone || "",
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
    const maxDiscountByPercent = cart.subtotal * (loyaltySettings.maxRedeemPercentOfOrder / 100);
    const rawDiscount = redeemPoints * valuePerPoint;
    return Math.min(rawDiscount, maxDiscountByPercent, cart.subtotal);
  }, [loyaltySettings, redeemPoints, cart.subtotal]);

  // ==========================================================================
  // Pricing Calculation
  // ==========================================================================

  const pricing = useMemo(() => {
    const subtotal = cart.subtotal;
    const couponDiscount = couponApplied?.valid ? (couponApplied.discount ?? 0) : 0;
    const discount = cart.discount + couponDiscount + loyaltyDiscount;
    const afterDiscount = Math.max(0, subtotal - discount);

    // Tax
    const taxRate = buSettings?.taxRate ?? 0;
    const tax = Math.round(afterDiscount * taxRate * 100) / 100;

    // Delivery fee
    let deliveryFee = 0;
    let freeDelivery = false;
    let estimatedMinutes: number | undefined;

    if (form.orderType === "delivery" && form.deliveryType === "local" && deliveryPolicy) {
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
  }, [cart.subtotal, cart.discount, form.orderType, form.deliveryType, buSettings, deliveryPolicy, couponApplied, loyaltyDiscount]);

  // ==========================================================================
  // Defensive normalization — deliveryType is only meaningful for delivery orders.
  // When orderType is "pickup", effectiveDeliveryType is undefined so stale
  // outside_area state can never leak into pricing, validation, or submission.
  // ==========================================================================
  const effectiveDeliveryType =
    form.orderType === "delivery" ? form.deliveryType : undefined;

  // ==========================================================================
  // Coupon Validation
  // ==========================================================================

  const couponValidation = useQuery(
    api.offers.validateCoupon,
    form.couponCode.trim() && primaryBusinessUnitId
      ? {
          code: form.couponCode.trim(),
          businessUnitId: primaryBusinessUnitId as any,
          subtotal: cart.subtotal,
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
    if (cart.items.length === 0 && !orderSuccess) {
      // Small delay to avoid flash redirect
      const timer = setTimeout(() => {
        navigate(ROUTES.CART);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cart.items.length, navigate, orderSuccess]);

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
    } else if (form.customerPhone.trim().length < 7) {
      newErrors.customerPhone = "Please enter a valid phone number";
    }
    if (form.orderType === "delivery" && !form.deliveryAddress.trim()) {
      newErrors.deliveryAddress = "Delivery address is required";
    }

    // Local delivery minimum order check
    if (form.orderType === "delivery" && form.deliveryType === "local" && deliveryPolicy?.minimumOrder) {
      if (pricing.afterDiscount < deliveryPolicy.minimumOrder) {
        newErrors.deliveryAddress = `Minimum order for local delivery is ${formatCurrency(deliveryPolicy.minimumOrder)}. Add ${formatCurrency(deliveryPolicy.minimumOrder - pricing.afterDiscount)} more to your cart.`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // ==========================================================================
  // Submit Order
  // ==========================================================================

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) return;
      if (cart.items.length === 0) return;
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
        const primaryBusinessUnitId = cart.items[0]?.businessUnitId;
        const orderResult = await createOrder({
          businessUnitId: primaryBusinessUnitId! as any,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          items: cart.items.map((item) => ({
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
          offerCode: couponApplied?.valid ? form.couponCode.trim() : undefined,
          paymentMethod: "upi_qr",
          idempotencyKey: getOrCreateIdempotencyKey(),
        });

        const { orderId: newOrderId, orderNumber: newOrderNumber } = orderResult as { orderId: string; orderNumber: string };

        clearIdempotencyKey();

        if (redeemPoints > 0 && customer?._id && effectiveDeliveryType !== "outside_area") {
          redeemPointsMutation({
            customerId: customer._id as Id<"customers">,
            orderId: newOrderId as unknown as Id<"orders">,
            points: redeemPoints,
          }).catch((err) => {
            console.error("Loyalty redemption failed:", err);
          });
        }

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
          clearCart();
          clearIdempotencyKey();
          toast.success("Delivery request submitted!", {
            description: "We'll contact you with a delivery quote shortly.",
          });
        } else {
          setShowPaymentQR(true);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Order creation failed";
        console.error("Checkout failed:", error);
        const isAvailabilityError =
          message.includes("stock") ||
          message.includes("catalogItems") ||
          message.includes("does not match the expected Convex");
        toast.error("Checkout failed", {
          description: isAvailabilityError
            ? "Some items in your cart are no longer available. Please review your cart."
            : "Please try again or contact support.",
        });
      } finally {
        setIsSubmitting(false);
        setPaymentStatus("idle");
      }
    },
    [validate, cart, form, pricing, createOrder, storeIsOpen, nextOpenTime, couponApplied, redeemPoints, customer, redeemPointsMutation]
  );

  // ==========================================================================
  // Payment Claimed — order is placed and the customer says they've paid.
  // Show the confirmation only here; closing the QR modal without paying
  // must never look like a successful order.
  // ==========================================================================

  const handlePaymentClaimed = useCallback(async (reference?: string) => {
    if (!pendingOrder) return;
    setShowPaymentQR(false);
    setOrderSuccess({
      orderNumber: pendingOrder.orderNumber,
      orderId: pendingOrder.orderId,
    });
    clearCart();
    clearIdempotencyKey();
    toast.success("Order placed!", {
      description: "Payment is under verification. We'll confirm shortly.",
    });

    // Record the "I've Paid" claim server-side so the kitchen can see it.
    // This is a light, idempotent call — it never creates a new order and
    // never changes payment status on its own.
    try {
      await claimPayment({
        orderId: pendingOrder.orderId as Id<"orders">,
        phone: pendingOrder.phone,
        reference: reference?.trim() || undefined,
      });
    } catch {
      // The success screen is already shown; a failed claim is non-blocking.
    }
  }, [pendingOrder, clearCart, claimPayment]);

  // ==========================================================================
  // Persisted outside-area order — recovers confirmation page on refresh
  // ==========================================================================

  const [persistedOrder] = useState(() => loadPersistedOutsideAreaOrder());

  // ==========================================================================
  // Order Success State
  // ==========================================================================

  if (orderSuccess) {
    // Outside-area orders use the backend-driven confirmation page
    if (effectiveDeliveryType === "outside_area") {
      persistOutsideAreaOrder(orderSuccess.orderNumber, form.customerPhone.trim());
      return <OutsideAreaConfirmation orderNumber={orderSuccess.orderNumber} phone={form.customerPhone.trim()} />;
    }

    // Non-outside-area: show the existing payment-submitted success screen
    return (
      <div className="min-h-screen bg-background">
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
              <h1 className="text-2xl font-bold tracking-tight">
                Payment Submitted for Verification
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Payment recorded — we&apos;ll verify it and start preparing your order shortly.
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
                <span className="font-mono font-semibold">
                  {orderSuccess.orderNumber ?? "Processing..."}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Subtotal</span>
                <span className="font-medium">{formatCurrency(pricing.subtotal - pricing.discount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium">
                  {pricing.freeDelivery ? "Free" : formatCurrency(pricing.deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment</span>
                <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Pending Verification
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order</span>
                <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Awaiting Payment Verification
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

  // ==========================================================================
  // Empty Cart Redirect
  // ==========================================================================

  // If cart is empty but we have a persisted outside-area order, show the
  // confirmation page instead of the empty cart state (survives browser refresh).
  if (cart.items.length === 0 && persistedOrder) {
    return <OutsideAreaConfirmation orderNumber={persistedOrder.orderNumber} phone={persistedOrder.phone} />;
  }

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
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
          <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your order details below
          </p>
        </motion.div>

        {/* Loading State — settings still loading */}
        {buSettings === undefined && cart.businessUnitIds[0] && (
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

        {/* Payment Pending Banner — order created but payment not confirmed */}
        {pendingOrder && !showPaymentQR && !orderSuccess && (
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
                  onClick={() => setShowPaymentQR(true)}
                  className="gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Pay Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePaymentClaimed()}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  I&apos;ve Paid
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
            {/* CHECKOUT FORM                                                   */}
            {/* ================================================================ */}

            <div className="space-y-6">
              {/* Contact Information */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="rounded-xl border border-border/60 p-6"
              >
                <h2 className="font-semibold mb-4">Contact Information</h2>

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
                      <Input
                        id="customerPhone"
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={form.customerPhone}
                        onChange={(e) => updateField("customerPhone", e.target.value)}
                        className={cn(errors.customerPhone && "border-destructive")}
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
                className="rounded-xl border border-border/60 p-6"
              >
                <h2 className="font-semibold mb-4">Order Type</h2>

                <RadioGroup
                  value={form.orderType}
                  onValueChange={(val) =>
                    updateField("orderType", val as "delivery" | "pickup")
                  }
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all",
                      form.orderType === "delivery"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 bg-card hover:border-border"
                    )}
                  >
                    <RadioGroupItem value="delivery" className="sr-only" />
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        form.orderType === "delivery"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Delivery</p>
                      <p className="text-xs text-muted-foreground">
                        Delivered to your door
                      </p>
                    </div>
                  </label>

                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all",
                      form.orderType === "pickup"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 bg-card hover:border-border"
                    )}
                  >
                    <RadioGroupItem value="pickup" className="sr-only" />
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        form.orderType === "pickup"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Pickup</p>
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
                    <div className="rounded-xl border border-border/60 p-6 space-y-4">
                      <h2 className="font-semibold">Delivery Details</h2>

                      {/* Delivery Type Selection — Local vs Outside Area */}
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
                              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                              effectiveDeliveryType === "local"
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border/60 bg-card hover:border-border"
                            )}
                          >
                            <RadioGroupItem value="local" className="sr-only" />
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                effectiveDeliveryType === "local"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-secondary text-muted-foreground"
                              )}
                            >
                              <Truck className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">Local Delivery</p>
                              <p className="text-xs text-muted-foreground">
                                {deliveryPolicy?.fixedFee !== undefined
                                  ? `${formatCurrency(deliveryPolicy.fixedFee)}${deliveryPolicy.estimatedMinutes ? ` \u00B7 ~${deliveryPolicy.estimatedMinutes} min` : ""}`
                                  : "Delivery available"}
                                {deliveryPolicy?.minimumOrder ? ` \u00B7 Min ${formatCurrency(deliveryPolicy.minimumOrder)}` : ""}
                                {deliveryPolicy?.freeDeliveryThreshold ? ` \u00B7 Free above ${formatCurrency(deliveryPolicy.freeDeliveryThreshold)}` : ""}
                              </p>
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
                              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                              effectiveDeliveryType === "outside_area"
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
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
                                Delivery charge confirmed separately \u00B7 Courier/delivery partner may be used
                              </p>
                            </div>
                            <span className="text-sm text-muted-foreground">Quote</span>
                          </label>
                        </RadioGroup>
                      </div>

                      {/* Local Delivery Info */}
                      {effectiveDeliveryType === "local" && deliveryPolicy && (
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
                                We currently provide local delivery in our service area. If you&apos;re outside our local area, we may still be able to arrange delivery through a courier or delivery partner. Delivery charges will be confirmed based on your location.
                              </p>
                            </div>
                          </div>
                          <a
                            href="https://wa.me/7842032879?text=Hi%20MB%20Crunchy%2C%20I%27d%20like%20to%20arrange%20delivery%20for%20my%20order."
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
                                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all",
                                  selectedAddressId === addr._id
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
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
                  className="rounded-xl border border-border/60 bg-secondary/30 p-6"
                >
                  <h2 className="font-semibold mb-2">Pickup Information</h2>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Your order will be ready for pickup at the store. We&apos;ll
                      notify you when it&apos;s ready.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Ready for pickup in: 15-20 minutes</span>
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

            {/* ================================================================ */}
            {/* ORDER SUMMARY                                                   */}
            {/* ================================================================ */}

            <div className="lg:sticky lg:top-24 lg:self-start">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                className="rounded-xl border border-border/60 bg-card p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Order Summary</h2>
                  <span className="text-xs text-muted-foreground">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
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
                  {cart.items.map((item) => (
                    <div
                      key={`${item.catalogItemId}-${item.variantName}`}
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
                        <p className="text-xs text-muted-foreground">
                          {item.variantName}
                        </p>
                      </div>
                      <span className="text-sm font-medium shrink-0">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Coupon Code */}
                <div className="space-y-2">
                  <Label htmlFor="couponCode" className="text-sm font-medium">
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
                    <p className="text-xs text-emerald-600">
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
                    <span className="font-medium">
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
                          : pricing.freeDelivery
                            ? "Free"
                            : formatCurrency(pricing.deliveryFee)
                        : "Free"}
                    </span>
                  </div>
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
                      <span>Ready for pickup in: 15-20 min</span>
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
                      Ready for pickup in: 15-20 minutes
                    </p>
                  </div>
                )}

                <div className="flex justify-between text-lg font-bold">
                  <span>{effectiveDeliveryType === "outside_area" ? "Payable Now" : "Total"}</span>
                  <span>{effectiveDeliveryType === "outside_area" ? formatCurrency(pricing.subtotal - pricing.discount + pricing.tax) : formatCurrency(pricing.total)}</span>
                </div>
                {effectiveDeliveryType === "outside_area" && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Delivery charge will be confirmed separately
                  </p>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  className={cn(
                    "w-full text-base font-semibold h-12 transition-all",
                    isSubmitting && "opacity-80"
                  )}
                  disabled={isSubmitting || !storeIsOpen}
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
          </div>
        </form>
      </div>

      {/* UPI Payment QR Modal */}
      {showPaymentQR && pendingOrder && (
        <PaymentQR
          upiId={globalSettings?.paymentConfig?.upiId ?? ""}
          merchantName={globalSettings?.paymentConfig?.merchantName ?? SITE_NAME}
          amount={pricing.total}
          orderNumber={pendingOrder.orderNumber}
          whatsappNumber={globalSettings?.paymentConfig?.whatsappNumber}
          onPaid={handlePaymentClaimed}
          onWhatsApp={() => {
            const phone = (globalSettings?.paymentConfig?.whatsappNumber ?? "").replace(/[^0-9]/g, "");
            const msg = encodeURIComponent(
              `Hi! I've placed order #${pendingOrder.orderNumber} for ${formatCurrency(pricing.total)}. Please confirm my payment.`
            );
            window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
          }}
          onClose={() => {
            setShowPaymentQR(false);
            toast.info("Payment pending", {
              description:
                "Your order is reserved. Pay now or complete it later from Track Order.",
            });
          }}
        />
      )}
    </div>
  );
}
