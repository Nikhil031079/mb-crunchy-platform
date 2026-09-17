# Phase 27-10 — Business Configuration Remediation

**Date:** 2026-09-17
**Scope:** M-9 + M-10 only
**Status:** BUSINESS CONFIGURATION REMEDIATION COMPLETE — M-9/M-10 VERIFIED

---

## M-9 — WhatsApp Number

### Existing Architecture

| Layer | Status | Location |
|-------|--------|----------|
| Schema field | ✅ Exists | `convex/schema.ts:877` — `paymentConfig.whatsappNumber` |
| Backend mutation | ✅ Exists | `convex/settings.ts:104,120-123` — validates via `requireIndianPhone` |
| Frontend dynamic read | ✅ Exists | `CheckoutPage.tsx:485`, `PaymentPendingCard.tsx:181` |
| Admin UI | ✅ **NOW ADDED** | `SettingsPage.tsx` — PhoneInput under Payment Settings |

### Admin UI

Added `whatsappNumber` to `GlobalSettingsSection` in `SettingsPage.tsx`:
- Form state: `whatsappNumber: ""`
- Loads from `globalSettings.paymentConfig?.whatsappNumber` via `extractDigitsForInput`
- Saves via `upsertGlobal` with `paymentConfig.whatsappNumber` validated by `normalizeIndianPhone`
- UI: `PhoneInput` component under "Payment Settings" section with descriptive helper text
- Existing backend validation remains authoritative (rejects invalid Indian phone numbers)

### Frontend Source

| File | Before | After |
|------|--------|-------|
| `CheckoutPage.tsx:485` | `globalSettings?.paymentConfig?.whatsappNumber ?? ""` | `globalSettings?.paymentConfig?.whatsappNumber ?? FALLBACK_WHATSAPP_NUMBER` |
| `CheckoutPage.tsx:791` | N/A (no variable) | `whatsappPhone` defined with fallback |
| `CheckoutPage.tsx:1997` | Hardcoded `href="https://wa.me/7842032879?..."` | Dynamic `href={`https://wa.me/${whatsappPhone}?...`}` |
| `PaymentPendingCard.tsx:181` | `settings?.paymentConfig?.whatsappNumber ?? ""` | `settings?.paymentConfig?.whatsappNumber ?? FALLBACK_WHATSAPP_NUMBER` |

### Fallback

Added `FALLBACK_WHATSAPP_NUMBER = "7842032879"` to `src/constants/index.ts`. This is the single source of truth for the fallback value. Both CheckoutPage and PaymentPendingCard use this constant when the admin-configured value is undefined.

**Precedence:** Admin-configured value → `FALLBACK_WHATSAPP_NUMBER` constant

### Validation

- Backend: `requireIndianPhone()` in `convex/settings.ts:123` — rejects invalid numbers
- Frontend: `normalizeIndianPhone()` in `SettingsPage.tsx` handleSave — normalizes before saving
- Admin UI: `PhoneInput` component — provides formatted input with country code

### Tests

| Check | Result |
|-------|--------|
| TypeScript | ✅ PASS |
| Build | ✅ PASS |
| Tests | ✅ 142/142 PASS |

---

## M-10 — Delivery Estimates

### Cart

**Before:** `CartPage.tsx:773` — hardcoded `"30-45 minutes"`

**After:** Dynamic from `deliveryPolicy.estimatedMinutes`:
```tsx
deliveryPolicy?.estimatedMinutes ? `~${deliveryPolicy.estimatedMinutes} min` : "30-45 minutes"
```

**Fallback:** If `deliveryPolicy.estimatedMinutes` is undefined, falls back to `"30-45 minutes"` (preserving existing behavior).

**Source of truth:** `deliveryPolicies.estimatedMinutes` — already queried in CartPage at line 157-159, just unused for display until now.

### Checkout

**Already working:** `CheckoutPage.tsx:2404-2425` uses `pricing.estimatedMinutes` from `deliveryPolicy` for delivery orders. **No changes needed.**

### Pickup

**Before:** Hardcoded `"15-20 minutes"` in 3 places:
- `CheckoutPage.tsx:2123` (pickup info section)
- `CheckoutPage.tsx:2414` (pickup sidebar)
- `CheckoutPage.tsx:2434` (pickup sidebar)

**After:** All three replaced with `DEFAULT_PICKUP_ESTIMATE` constant from `src/constants/index.ts`.

**Architecture decision:** Pickup estimate is a fixed application constant (not admin-configurable) because:
- No schema field exists for pickup estimate
- Pickup time depends on kitchen operations, not configuration
- Adding a schema field would require new admin UI + mutation — disproportionate for a display constant

### Source of Truth

| Value | Source | Type |
|-------|--------|------|
| Delivery estimate | `deliveryPolicy.estimatedMinutes` | Database (admin-configurable via schema) |
| Pickup estimate | `DEFAULT_PICKUP_ESTIMATE` constant | Application constant |
| WhatsApp number | `globalSettings.paymentConfig.whatsappNumber` | Database (admin-configurable via SettingsPage) |

---

## Duplicate Hardcoded Values

### Before

| Value | Locations | Count |
|-------|-----------|-------|
| `7842032879` | CheckoutPage.tsx:1997 | 1 (hardcoded) |
| `30-45 minutes` | CartPage.tsx:773 | 1 (hardcoded) |
| `15-20 minutes` | CheckoutPage.tsx:2123, 2414, 2434 | 3 (hardcoded) |

### After

| Value | Locations | Count |
|-------|-----------|-------|
| `FALLBACK_WHATSAPP_NUMBER` | constants/index.ts | 1 (constant) |
| `"30-45 minutes"` | CartPage.tsx:774 (fallback only) | 1 (fallback) |
| `DEFAULT_PICKUP_ESTIMATE` | constants/index.ts | 1 (constant) |
| `{DEFAULT_PICKUP_ESTIMATE}` | CheckoutPage.tsx:2124, 2414, 2434 | 3 (references) |

**Result:** No duplicate hardcoded business values. Single source of truth for each.

---

## Regression Verification

| System | Result |
|--------|--------|
| Checkout pricing | ✅ No changes |
| Order creation | ✅ No changes |
| Payment | ✅ No changes |
| Inventory | ✅ No changes |
| Kitchen serviceability | ✅ No changes |
| Mart serviceability | ✅ No changes |
| Shipping zones | ✅ No changes |
| Shipping rates | ✅ No changes |
| Shipping quote | ✅ No changes |
| Mixed cart | ✅ No changes |
| Location | ✅ No changes |
| Shiprocket | ✅ No changes |

---

## Changed Files

| File | Change | Reason |
|------|--------|--------|
| `src/constants/index.ts` | Added `FALLBACK_WHATSAPP_NUMBER` + `DEFAULT_PICKUP_ESTIMATE` | M-9/M-10: shared constants |
| `src/pages/admin/SettingsPage.tsx` | Added `whatsappNumber` form field + save logic | M-9: admin UI wiring |
| `src/pages/customer/CheckoutPage.tsx` | Dynamic WhatsApp link + pickup constant | M-9/M-10: use constants |
| `src/components/customer/PaymentPendingCard.tsx` | Dynamic WhatsApp with fallback | M-9: use constant |
| `src/pages/customer/CartPage.tsx` | Dynamic delivery estimate from policy | M-10: use deliveryPolicy |

Total: 5 files, 47 insertions, 9 deletions.

---

## Test Results

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ PASS (0 errors) |
| Vite build | ✅ PASS (3.54s) |
| Test suite | ✅ 142/142 relevant tests passed |
| Pre-existing failures | 61 (`26f5_shiprocket_adapter_rewrite.test.ts`) |

---

## Production Safety

| Check | Result |
|-------|--------|
| COURIER_DRY_RUN | ✅ Unchanged |
| Razorpay | ✅ Unchanged (TEST mode) |
| Shiprocket | ✅ No changes |
| Production data mutation | ✅ None |

---

## FINAL VERDICT

BUSINESS CONFIGURATION REMEDIATION COMPLETE — M-9/M-10 VERIFIED
