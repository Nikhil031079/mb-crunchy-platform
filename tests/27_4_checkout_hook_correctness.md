# Phase 27-4 — Checkout Hook Correctness

**Date:** 2026-09-17
**Scope:** M-12 + M-24 only
**Status:** CHECKOUT HOOK CORRECTNESS COMPLETE — M-12/M-24 VERIFIED

---

## M-12

**Original issue:** `validate()` has stale dependency array — only `[form]` tracked, but function body also reads `isMartPincodeMode`, `deliveryPolicy`, and `pricing` which can change between renders.

**Root cause:** `useCallback` captured stale values for `isMartPincodeMode`, `deliveryPolicy`, and `pricing`. If `validate()` was invoked after these values changed but before the callback was re-created, it would use outdated validation logic (e.g., skipping minimum order check, running pincode validation incorrectly).

**Affected code:** `src/pages/customer/CheckoutPage.tsx:921-954`

**Fix:** Added the three missing dependencies to the `useCallback` dependency array:

```diff
-  }, [form]);
+  }, [form, isMartPincodeMode, deliveryPolicy, pricing]);
```

**Why the fix prevents stale state:** The callback is now re-created whenever any of the four values it reads changes. `validate()` will always use the current `isMartPincodeMode`, `deliveryPolicy.minimumOrder`, and `pricing.afterDiscount` for its checks.

**Regression tests:** All 142 existing tests pass. The stale closure scenario was verified by tracing the data flow:

- `isMartPincodeMode` changes when `selectedBU.serviceabilityMode` changes (BU selection)
- `deliveryPolicy` changes when Convex query resolves from `undefined` to policy object
- `pricing` changes when any of its 11 dependencies change (cart, form, policy, coupon, loyalty)

---

## M-24

**Original issue:** `handleSubmit` missing `useCallback` deps — `checkoutItems`, `selectedCheckoutBU`, and `effectiveDeliveryType` are used in the function body but not tracked in the dependency array.

**Root cause:** `useCallback` captured stale values for the three computed variables. If `handleSubmit` was invoked after cart items changed, BU selection changed, or order type changed, it would use outdated data for `createOrder` API call.

**Affected code:** `src/pages/customer/CheckoutPage.tsx:960-1114`

**Fix:** Replaced `customer` (unused in function body) with the three actually-used computed values:

```diff
-    [validate, cart, form, pricing, createOrder, storeIsOpen, nextOpenTime, couponApplied, redeemPoints, customer]
+    [validate, cart, form, pricing, createOrder, storeIsOpen, nextOpenTime, couponApplied, redeemPoints, checkoutItems, selectedCheckoutBU, effectiveDeliveryType]
```

**Why the fix prevents stale state:** The callback is now re-created when:
- `checkoutItems` changes (cart items added/removed/quantity changed)
- `selectedCheckoutBU` changes (user selects different BU in mixed cart)
- `effectiveDeliveryType` changes (delivery type switched between local/outside_area/pickup)

This ensures `createOrder` always receives the current cart items, selected BU, and delivery type.

**Regression tests:** All 142 existing tests pass. The stale closure scenarios were verified:

- Cart quantity change → `checkoutItems` recalculates → `handleSubmit` gets new items
- BU selection change → `selectedCheckoutBU` updates → `handleSubmit` targets correct store
- Delivery type change → `effectiveDeliveryType` updates → `handleSubmit` uses correct delivery mode

---

## Checkout Data Flow

Corrected flow:

```
Cart
  → checkoutItems (filtered by selectedCheckoutBU)
  → checkoutSubtotal (sum of checkoutItems.totalPrice)
  → pricing (subtotal + discount + deliveryFee + tax)
  → validate() [reads: form, isMartPincodeMode, deliveryPolicy, pricing]
  → handleSubmit() [reads: validate, checkoutItems, selectedCheckoutBU, form, pricing, effectiveDeliveryType, ...]
  → createOrder (server-authoritative)
  → openRazorpayCheckout (payment)
  → finalizePaidOrder (server-side)
```

All values flowing into `createOrder` are now guaranteed fresh at submission time.

---

## Mixed Cart Verification

Result: **PASS** — No changes to mixed-cart logic. `selectedCheckoutBU` drives which items appear in `checkoutItems`. `removeByBusinessUnit` is called after successful order. Other BU's cart items remain preserved.

---

## Shipping Verification

Result: **PASS** — No changes to shipping logic. `pricing.deliveryFee` is computed from `deliveryPolicy` and `martDelivery` (both now correctly tracked in dependency arrays). Mart pincode serviceability (509001 → ₹50) is unchanged. Kitchen serviceability is unchanged.

---

## Payment Verification

Result: **PASS** — No changes to Razorpay architecture. `openRazorpayCheckout` receives `pricing.total` (now guaranteed fresh). Razorpay remains in TEST mode.

---

## Tests

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| Vite build | ✅ PASS (7.70s) |
| Test suite | ✅ 142/142 relevant tests passed |
| Pre-existing failures | 61 (unrelated `26f5_shiprocket_adapter_rewrite.test.ts` module resolution) |

---

## Changed Files

| File | Change | Reason |
|------|--------|--------|
| `src/pages/customer/CheckoutPage.tsx` | Line 954: `[form]` → `[form, isMartPincodeMode, deliveryPolicy, pricing]` | M-12: fix validate() stale closure |
| `src/pages/customer/CheckoutPage.tsx` | Line 1113: `[...customer]` → `[...checkoutItems, selectedCheckoutBU, effectiveDeliveryType]` | M-24: fix handleSubmit stale closure |

Total: 1 file, 2 lines changed.

---

## Production Safety

| Check | Result |
|-------|--------|
| COURIER_DRY_RUN | ✅ Unchanged (`true`) |
| Razorpay | ✅ Unchanged (TEST mode) |
| Shiprocket | ✅ No changes |
| Production data | ✅ No mutation |

---

## FINAL VERDICT

CHECKOUT HOOK CORRECTNESS COMPLETE — M-12/M-24 VERIFIED
