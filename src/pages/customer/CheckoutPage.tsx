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
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { isStoreCurrentlyOpen, getNextOpenTime } from "@/utils/store-hours";

// Hooks
import { useCart } from "@/stores/cart";
import { useRazorpay } from "@/hooks/use-razorpay";
import { useAuth } from "@/hooks/use-auth";

// Customer components
import { StoreStatusDot } from "@/components/customer/StoreStatusBadge";

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
  DeliveryZone,
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
  deliveryAddress: "",
  deliveryNotes: "",
  selectedZoneId: "",
  couponCode: "",
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, clearCart } = useCart();
  const createOrder = useMutation(api.orders.create);
  const redeemPointsMutation = useMutation(api.loyalty.redeemPoints);
  const { openCheckout } = useRazorpay();

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
  const [couponApplied, setCouponApplied] = useState<{
    valid: boolean;
    error?: string;
    discount?: number;
    title?: string;
  } | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // ==========================================================================
  // Data Fetching — BU settings + delivery zones
  // ==========================================================================

  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    cart.businessUnitId
      ? { businessUnitId: cart.businessUnitId as any }
      : "skip"
  ) as BusinessUnitSettings | null | undefined;

  const deliveryZones = useQuery(
    api.deliveryZones.getActive,
    cart.businessUnitId
      ? { businessUnitId: cart.businessUnitId as any }
      : "skip"
  ) as DeliveryZone[] | undefined;

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

    if (form.orderType === "delivery" && deliveryZones) {
      const selectedZone = deliveryZones.find((z) => z._id === form.selectedZoneId);
      const zone = selectedZone ?? deliveryZones[0];

      if (zone) {
        // Check free delivery threshold
        const threshold = zone.freeDeliveryThreshold ?? buSettings?.freeDeliveryThreshold;
        if (threshold && afterDiscount >= threshold) {
          freeDelivery = true;
          deliveryFee = 0;
        } else {
          deliveryFee = zone.charge ?? buSettings?.deliveryFee ?? 0;
        }
        estimatedMinutes = zone.estimatedMinutes;
      } else {
        deliveryFee = buSettings?.deliveryFee ?? 0;
      }
    }

    const total = afterDiscount + deliveryFee + tax;

    return { subtotal, discount, afterDiscount, tax, taxRate, deliveryFee, freeDelivery, estimatedMinutes, total };
  }, [cart.subtotal, cart.discount, form.orderType, form.selectedZoneId, buSettings, deliveryZones, couponApplied, loyaltyDiscount]);

  // ==========================================================================
  // Coupon Validation
  // ==========================================================================

  const couponValidation = useQuery(
    api.offers.validateCoupon,
    form.couponCode.trim() && cart.businessUnitId
      ? {
          code: form.couponCode.trim(),
          businessUnitId: cart.businessUnitId as any,
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
  // Auto-select first delivery zone
  // ==========================================================================

  useEffect(() => {
    if (deliveryZones && deliveryZones.length > 0 && !form.selectedZoneId) {
      setForm((prev) => ({ ...prev, selectedZoneId: deliveryZones[0]._id }));
    }
  }, [deliveryZones, form.selectedZoneId]);

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
      setForm((prev) => ({ ...prev, [field]: value }));
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
    if (form.orderType === "delivery" && deliveryZones && deliveryZones.length > 0 && !form.selectedZoneId) {
      newErrors.selectedZoneId = "Please select a delivery zone";
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

      try {
        // Initiate Razorpay payment
        const paymentResponse = await openCheckout({
          amount: pricing.total,
          currency: buSettings?.currency === "USD" ? "USD" : "INR",
          name: SITE_NAME,
          description: `Order from ${SITE_NAME} (${form.orderType === "delivery" ? "Delivery" : "Pickup"})`,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
        });

        // Payment succeeded — create order
        const result = await createOrder({
          businessUnitId: cart.businessUnitId! as any,
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
          deliveryAddress:
            form.orderType === "delivery"
              ? form.deliveryAddress.trim()
              : undefined,
          deliveryNotes: form.deliveryNotes.trim() || undefined,
          offerCode: couponApplied?.valid ? form.couponCode.trim() : undefined,
          razorpayPaymentId: paymentResponse.razorpay_payment_id,
        });

        setOrderSuccess({
          orderNumber: result as unknown as string,
          orderId: result as unknown as string,
        });

        // Redeem loyalty points after order creation
        if (redeemPoints > 0 && customer?._id) {
          redeemPointsMutation({
            customerId: customer._id as Id<"customers">,
            orderId: result as unknown as Id<"orders">,
            points: redeemPoints,
          }).catch((err) => {
            console.error("Loyalty redemption failed:", err);
          });
        }

        clearCart();

        toast.success("Payment successful!", {
          description: `Order #${(result as unknown as string).slice(0, 8)} confirmed.`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Payment or order failed";
        console.error("Checkout failed:", error);
        toast.error("Checkout failed", {
          description: message.includes("cancelled")
            ? "Payment was cancelled."
            : "Please try again or contact support.",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, cart, form, pricing, createOrder, clearCart, openCheckout, storeIsOpen, nextOpenTime, couponApplied, buSettings, redeemPoints, customer, redeemPointsMutation]
  );

  // ==========================================================================
  // Order Success State
  // ==========================================================================

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center space-y-6"
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Order Placed!
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Thank you for your order. We&apos;ll start preparing it right
                away.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Number</span>
                <span className="font-mono font-semibold">
                  {orderSuccess.orderNumber?.slice(0, 12) ?? "Processing..."}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="text-emerald-600 font-medium">Pending</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">
                  {form.orderType}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              You&apos;ll receive updates on your order status. For any
              questions, please contact support.
            </p>

            <div className="flex gap-3 justify-center">
              <Link to={ROUTES.TRACK_ORDER}>
                <Button variant="outline" size="sm">
                  <Package className="mr-1.5 h-3.5 w-3.5" />
                  Track Order
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back to Home
                </Button>
              </Link>
              {cart.businessUnitId && (
                <Link to={`/${cart.businessUnitId}`}>
                  <Button size="sm">Order More</Button>
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Empty Cart Redirect
  // ==========================================================================

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
          className="mb-8"
        >
          <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your order details below
          </p>
        </motion.div>

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

                      {/* Delivery Zone Selection */}
                      {deliveryZones && deliveryZones.length > 0 && (
                        <div className="space-y-2">
                          <Label>Delivery Zone</Label>
                          <RadioGroup
                            value={form.selectedZoneId}
                            onValueChange={(val) =>
                              updateField("selectedZoneId", val)
                            }
                            className="space-y-2"
                          >
                            {deliveryZones.map((zone) => (
                              <label
                                key={zone._id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                                  form.selectedZoneId === zone._id
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border/60 bg-card hover:border-border"
                                )}
                              >
                                <RadioGroupItem
                                  value={zone._id}
                                  className="sr-only"
                                />
                                <div
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                    form.selectedZoneId === zone._id
                                      ? "bg-primary/10 text-primary"
                                      : "bg-secondary text-muted-foreground"
                                  )}
                                >
                                  <MapPin className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {zone.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {zone.estimatedMinutes
                                      ? `~${zone.estimatedMinutes} min delivery`
                                      : "Delivery available"}
                                  </p>
                                </div>
                                <span className="text-sm font-semibold">
                                  {zone.freeDeliveryThreshold &&
                                  pricing.afterDiscount >= zone.freeDeliveryThreshold
                                    ? "Free"
                                    : formatCurrency(zone.charge)}
                                </span>
                              </label>
                            ))}
                          </RadioGroup>
                        </div>
                      )}

                      {/* No zones configured fallback */}
                      {deliveryZones && deliveryZones.length === 0 && (
                        <div className="rounded-lg bg-secondary/50 p-3">
                          <p className="text-xs text-muted-foreground">
                            Delivery zones not configured. A default fee may
                            apply.
                          </p>
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
                  className="rounded-xl border border-border/60 bg-secondary/30 p-6"
                >
                  <h2 className="font-semibold mb-2">Pickup Information</h2>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Your order will be ready for pickup at the store. We&apos;ll
                      notify you when it&apos;s ready.
                    </p>
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
                <h2 className="font-semibold">Order Summary</h2>

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
                        ? pricing.freeDelivery
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
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(pricing.total)}</span>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting || !storeIsOpen}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Payment...
                    </>
                  ) : !storeIsOpen ? (
                    "Store is Closed"
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
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
    </div>
  );
}
