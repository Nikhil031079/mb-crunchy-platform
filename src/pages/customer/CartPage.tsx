import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  ImageOff,
} from "lucide-react";

import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";

// Hooks
import { useCart } from "@/stores/cart";

// Customer components
import { QuantitySelector } from "@/components/customer";

// Shared components
import { EmptyState } from "@/components/shared/EmptyState";

// UI components
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ============================================================================
// CartPage — Cart items, quantity editing, totals, checkout CTA
// ============================================================================

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeItem, clearCart, itemCount } = useCart();

  // Page title
  useEffect(() => {
    document.title = `Cart${itemCount > 0 ? ` (${itemCount})` : ""} | ${SITE_NAME}`;
  }, [itemCount]);

  // ==========================================================================
  // Empty Cart
  // ==========================================================================

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <EmptyState
            title="Your cart is empty"
            description="Browse our stores and add some delicious items to your cart."
            icon={ShoppingCart}
            action={
              <Link to="/">
                <Button size="sm" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Browse Stores
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Cart with items
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shopping Cart</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {itemCount} item{itemCount !== 1 ? "s" : ""} in your cart
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear Cart
          </Button>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* ================================================================ */}
          {/* CART ITEMS                                                      */}
          {/* ================================================================ */}

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {cart.items.map((item) => {
                const itemKey = `${item.catalogItemId}-${item.variantName}`;
                return (
                  <motion.div
                    key={itemKey}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    className="flex gap-4 rounded-xl border border-border/60 bg-card p-4"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageOff className="h-5 w-5 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate">
                          {item.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.variantName}
                        </p>
                        <p className="text-sm font-semibold mt-2">
                          {formatCurrency(item.unitPrice)}
                        </p>
                      </div>

                      {/* Quantity + Remove */}
                      <div className="flex flex-col items-end justify-between ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.catalogItemId, item.variantName)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <QuantitySelector
                          value={item.quantity}
                          onChange={(qty) =>
                            updateQuantity(item.catalogItemId, item.variantName, qty)
                          }
                          min={1}
                          max={99}
                          size="sm"
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Continue Shopping */}
            <div className="pt-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>

          {/* ================================================================ */}
          {/* ORDER SUMMARY                                                   */}
          {/* ================================================================ */}

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
              <h2 className="font-semibold">Order Summary</h2>

              <Separator />

              {/* Line items summary */}
              <div className="space-y-2">
                {cart.items.map((item) => (
                  <div
                    key={`${item.catalogItemId}-${item.variantName}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-muted-foreground mr-2">
                      {item.name} ({item.variantName}) x{item.quantity}
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(cart.subtotal)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(cart.discount)}</span>
                  </div>
                )}
                {cart.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span className="font-medium">{formatCurrency(cart.deliveryFee)}</span>
                  </div>
                )}
                {cart.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">{formatCurrency(cart.tax)}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(cart.subtotal)}</span>
              </div>

              {/* Checkout CTA */}
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => navigate(ROUTES.CHECKOUT)}
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-[10px] text-muted-foreground">
                Tax and delivery fees calculated at checkout
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
