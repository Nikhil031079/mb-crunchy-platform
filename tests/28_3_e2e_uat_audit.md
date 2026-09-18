# Phase 28-3 — E2E / UAT Audit

**Date**: 2026-09-18
**Production**: `https://mb-crunchy-store.pages.dev` (Cloudflare `81c11021`, commit `026976f`)
**Backend**: `prod:wry-cobra-318` (`https://wry-cobra-318.convex.cloud`)
**Method**: headless system Chrome (Playwright-driven, real rendering) + live production
read-only Convex queries. **No orders placed, no payments made, no shipments created,
no production data modified.** Screenshots in `.uat-tmp/shots/` (local evidence only).

---

## 1. Environment

| Item | Value |
|------|-------|
| Storefront | `mb-crunchy-store.pages.dev` — HTTP 200 on `/`, `/mb-kitchen`, `/mb-mart`, `/cart`, `/track-order`, `/admin/login`, `/kitchen/login` |
| Backend | `wry-cobra-318.convex.cloud` — public queries respond `{"status":"success"}` |
| Browser | System Chrome headless, 1440px + emulated 320/375/390/414px widths, GPS stubbing |
| Stores live | MB Kitchen (`mb-kitchen`, 35 items, local delivery) · MB Mart (`mb-mart`, 21 items, pincode courier) |
| Razorpay | TEST key `rzp_test_TUQGcw92ZBUcWg`; checkout.js loads; no transaction attempted |

---

## 2. Browser Capability

**AVAILABLE** — real headless Chrome drove the production site: navigation, category
filter, product dialogs, variant selection, add-to-cart, quantity steppers, location
dialog (GPS/PIN), cart, checkout render, refresh persistence, mobile widths, console +
network capture. Screenshots captured per flow. Admin/staff sessions NOT TESTABLE —
no credentials provided at audit time (offered follow-up on receipt).

---

## 3. Kitchen Customer Journey

**PASS** (all steps observable without transacting verified working):

1. Open site — PASS (homepage renders: stores, categories, combos, offers sections)
2. Identify Kitchen — PASS (`/mb-kitchen`, dynamic title "MB Kitchen | MB CRUNCHY")
3. Browse categories — PASS (10 categories with counts, e.g. "Pizza 1", "Mojitos 7")
4. Search — PASS (`/search`: "pizza" → 1 result, sort/filter controls render)
5. Product details — PASS (dialog: description, variant, price ₹129.00 vs ₹155.00, "You save ₹26.00")
6. Variant — PASS ("Variant: Default"; single-variant product)
7. Add-ons — N/A on this product (0 add-on controls; correctly absent, not broken)
8. Add to cart — PASS (localStorage `mb-crunchy-cart` written, navbar badge "Track Order 1")
9. Second product — PASS (cross-sell "You might also like" + quick-add buttons render)
10. Open cart — PASS (item, variant, qty, order summary, "Proceed to Checkout")
11. Change quantity — PASS (aria-labelled steppers; 1→2 recomputes: 129×2=258, subtotal ₹558 with ₹300 mart item)
12. Subtotal — PASS (exact math observed)
13. Discount — PASS ("17% OFF", compare-at strikethrough, free-delivery progress "Add ₹370.00 more")
14. Select location — PASS (dialog: GPS / PIN / manual address)
15. Kitchen serviceability — PASS (GPS at origin: "Delivery available — approx. 0.01 km away"; zone: 5 km radius, ₹30 fee, free ≥₹500, min order ₹259)
16. Checkout — PASS (renders contact, order-type, address, coupon, summary; "Delivery Fee Calculating...")
17. Customer details form — PASS (name/phone/email fields render)
18. Delivery charge — PARTIAL (shows "Calculating..." pre-pincode; server-authoritative at submit — not submittable in UAT)
19. Final total — PARTIAL (same reason; cart math verified exact)
20-22. Payment/order state — NOT TESTABLE (transaction forbidden)
23. Confirmation — NOT TESTABLE (no order placed)
24. Refresh confirmation — NOT TESTABLE (same)
25. Order history/tracking page — PASS (page renders "Track Your Order" + lookup form; guest lookup untested — needs real order)

---

## 4. Mart Customer Journey

**PASS** (up to payment, which is forbidden):

1-2. Open/browse — PASS (21 products, 3 categories: Pickles, Appadalu, Cold Pressed Oils)
3. Product — PASS (Mango Pickle dialog: description, variants **250 g ₹150 / 500 g ₹300 / 1 kg ₹600**, compare-at savings)
4. Variant — PASS (variant switch observed before add)
5-7. Cart — PASS (variant label "250 g" preserved, qty, subtotal)
8. Supported pincode — PASS (location dialog → PIN 509001 → "Location found for PIN 509001, Mahbubnagar, Telangana" + approximate-location notice + "Use This Location"; navbar shows 500001/509001 after accept)
9. Mart serviceability — PASS backend-live: `checkServiceability{509001}=serviceable:true`, `{500001}=PINCODE_NOT_SERVICEABLE` with clear message
10. Shipping charge — PASS backend-live matrix via `quoteForCart` (read-only): 250g→billable 500g ₹50 (RATE1); 500g→₹50; 750g→₹70 (RATE2); 1000g→₹70; 1500g→₹150 (RATE3); min billable 500g confirmed
11. Weight calculation — PASS (`actualWeightGrams`/`billableWeightGrams` exact in every quote)
12. Checkout — PASS (renders; Mart mode shows "Destination Pincode *" + "Shipping charges will be calculated at checkout"; unsupported pin → "Delivery Not Available — Enter a destination pincode to check delivery availability")
13-14. Payment/order — NOT TESTABLE (forbidden)
15. Shipping snapshot — NOT TESTABLE (created at order time; algorithm verified via quote matrix instead)
16. Tracking — page renders (see §3.25)

---

## 5. Mixed Cart

**PASS**: Kitchen (Veg Cheese Pizza) + Mart (Mango Pickle) coexist — localStorage holds
2 items with **2 distinct BU ids** (`k57a…6jas` + `k573…7xst`); cart page lists both with
correct per-store attribution; checkout shows **"Choose Store to Checkout"** + "Your cart
contains..." store-selection gate (server rejects mixed-BU orders per 28-0); empty-cart
`/checkout` redirects to `/cart`; reload preserves both items with correct totals
(₹129 + ₹300 = ₹558). No cross-store totals, no cross-store order constructible from UI.

---

## 6. Location

| Case | Result |
|------|--------|
| A. Kitchen serviceable (GPS at origin 16.7529, 78.0028) | PASS — "Delivery available — approx. 0.01 km away"; cart shows free-delivery progress, no block banner |
| B. Kitchen non-serviceable (no location set) | PASS — "MB Kitchen items are not available for delivery to your current location. You can change your location, choose pickup if available, or remove these items to continue." |
| C. Supported Mart pincode (509001) | PASS — geocoded to Mahbubnagar, accepted, navbar label set |
| D. Unsupported Mart pincode (500001) | PASS backend ("Delivery is not available for this pincode."); UI: geocoder resolves city (Hyderabad) and accepts *location*, gate enforced at checkout ("Delivery Not Available"). Cart shows generic "Estimated delivery: 30-45 minutes" even when unserviceable — cosmetic, recorded as F-03 |
| E. Pickup | NOT OFFERED by either store (`enablePickup:false` on both BUs) — correctly absent, no dead toggle |

Messaging is clear, CTAs correct, no false serviceability, no accidental store switching.

---

## 7. Payment

**NOT TESTABLE — transactions forbidden.** Verified without transacting: Razorpay TEST
key configured; `checkout.js` loads in `<head>`; amounts are server-derived
(`razorpay.createOrder` amount-vs-order-total guard intact in code, untouched since
28-0); idempotency + webhook/cron-race guards verified by code read + 28-2 regression
tests. One observation: pages emit failing third-party prefetch
`checkout-static-next.razorpay.com/build/undefined` (originates from Razorpay's own
script, not app code; no user impact observed) — recorded as F-04 for test-mode
payment verification later.

---

## 8. Admin

**NOT TESTABLE — no credentials provided.** Login pages (`/admin/login`,
`/kitchen/login`) render correctly with Sign In + forgot-password link. Backend
enforcement verified live: `customers:getAll` without token → rejected; 28-1 guards
untouched in code. Offered: repeat this section on receipt of credentials (read-only).

---

## 9. Staff

**NOT TESTABLE — no credentials provided.** Code-level: kitchen BU filter from 28-1
intact (`orders.getByBusinessUnit` filters `admin.businessUnitIds` for kitchen role).
Live verification (kitchen login, Mart/third-store denial, admin-op denial) pending
credentials.

---

## 10. Mobile

**PASS** — emulated 320 / 375 / 390 / 414px on home, Kitchen store, cart, tracking:
**0px horizontal overflow on all 16 combinations**; homepage screenshot captured per
width; touch-sized add-to-cart and nav controls render. No device-lab gestures tested
(marked NOT TESTABLE: physical tap/scroll feel, iOS Safari specifics).

---

## 11. Recovery

| Scenario | Result |
|----------|--------|
| Refresh cart | PASS — items, quantities, totals persist |
| Refresh checkout | PASS — page re-renders with cart intact |
| Refresh confirmation | NOT TESTABLE (no order) |
| Close/reopen browser | PASS equivalent — cart is localStorage-persisted, survives reload |
| Expired session | NOT TESTABLE (no session) |
| Failed/pending payment | NOT TESTABLE (no transaction); code paths + 28-2 tests verify recovery design |
| Unavailable product | PASS by design — server rejects deleted items at order time; weight probe returned clean "no longer available"-style errors for bad variants |
| Unsupported pincode | PASS — clean server + checkout messaging, cart retained, customer can change pin or remove items |

No dead ends observed: every failure state has a visible next action.

---

## 12. Owner Operations

Answerable without credentials (storefront + backend evidence): YES to 1–8, 11, 15
(order data model carries store, customer, items, quantities, amounts, payment status,
delivery/pickup, shipping snapshot; store isolation enforced). CANNOT VERIFY by UI:
9–10 (processing orders), 12 (status updates), 13 (failed-payment recovery), 14
(customer contact) — require admin session. No evidence of inability; pending
credential-based pass.

---

## 13. Console/Network

- `pageerror` / console-error / HTTP ≥400 across 8 recon pages + all flow pages:
  **zero app errors**.
- `requestfailed`: only the Razorpay third-party `/build/undefined` prefetch (F-04).
- No exposed secrets in traffic or DOM (28-2 bundle sweep: only env-var *names* in
  admin help text).
- No failed images, no broken routes, no request storms (Convex dedup normal).

---

## 14. Data Integrity

Production untouched: only read-only queries executed (`getAll`, `getByBusinessUnit`,
`checkServiceability`, `quoteForCart`, rejected unauth calls). No test orders exist to
duplicate; no cross-store writes performed; cart operations were localStorage-only.
**Zero production mutations.**

---

## 15. Findings

| ID | Severity | Flow | Finding | Evidence | Reproduction |
|----|----------|------|---------|----------|--------------|
| F-01 | P3 (minor) | Mart heavy carts | No shipping slab above 1500g: 2kg quote returns clean "No shipping rate is available for 2000g weight" | live `quoteForCart` matrix | quote 2×1kg to 509001 |
| F-02 | P4 (nit) | Checkout | Checkout "Destination Pincode" does not inherit the pincode already set via location dialog; customer re-types it | probe9 screenshot/text | set 500001 via location → checkout pincode field empty |
| F-03 | P4 (nit) | Cart | Generic "Estimated delivery: 30-45 minutes" shown for Mart items even when location is unserviceable | probe9 cart text | mart item + 500001 → cart |
| F-04 | P3 (verify later) | Payment asset | Third-party `checkout-static-next.razorpay.com/build/undefined` prefetch fails on every page (Razorpay script's own probe; no user impact seen) | network log ×7 | load any page, watch failed requests |
| F-05 | P4 (nit) | Config | `enableCheckout:false` on both BUs but flag is never read by customer flow (dormant); BU `deliveryRadiusKm:15` vs active zone radius 5 (zone governs) | live BU docs + code grep | `businessUnits:getAll` vs `deliveryZones` |
| F-06 | Note (positive) | SEO | Store pages already set dynamic titles ("MB Kitchen \| MB CRUNCHY"), partially addressing P4 SEO-004 | recon titles | load `/mb-kitchen` |

No P0/P1/P2-grade finding. Nothing blocks purchase, payment integrity, fulfillment,
authorization, or essential operations among testable flows.

---

## 16. NOT TESTABLE Items

1. Real order placement, payment success/failure/pending/retry, refresh/close during payment (forbidden).
2. Order confirmation, order history with real orders, guest tracking lookup against real orders.
3. Admin login, dashboard, order view/filter/update, catalog/offer/config management.
4. Staff login, cross-store denial, admin-op denial (live).
5. Owner order processing, status updates, failed-payment recovery, customer-contact handling (live).
6. Pickup flow (no store offers pickup).
7. Physical-device feel, iOS Safari, tap targets under finger (emulation only).
8. Razorpay end-to-end even in test mode (needs a transactable checkout).

Items 3–5 unblock on receipt of test credentials (read-only pass offered).

---

## 17. Recommended Fixes

Do not implement in this phase. Suggested next phase (28-4 or backlog):

1. F-01: add a >1500g Mart slab (or explicit "contact us for bulk" rate) — owner decision, **do not change prices without approval**.
2. F-02: prefill checkout pincode from location store when present.
3. F-03: suppress generic delivery ETA until serviceability resolves.
4. F-04: re-verify during a safe test-mode payment; if Razorpay probe still fails, confirm checkout modal unaffected.
5. F-05: either wire `enableCheckout` into checkout gating or remove the flag; align BU radius display with zone radius.
6. Credential-based admin/staff/owner pass (28-3b) covering §§8, 9, 12 fully.

---

## Final Verdict

**AUDIT INCOMPLETE — BROWSER/ENVIRONMENT LIMITATION**

All browser-testable critical customer flows (Kitchen, Mart, mixed cart, location,
cart, checkout render, mobile, recovery) PASS with zero app errors; backend
serviceability, shipping matrix, pricing math, and auth enforcement verified live.
But order placement, payment, confirmation, tracking-against-real-orders, and the
entire admin/staff/owner operation surface could not be exercised (forbidden
transactions + no credentials), so E2E completeness cannot be claimed. No blocking
defect was found in anything testable.
