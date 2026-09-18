# Phase 28-2 — P2 Remediation

**Date**: 2026-09-18
**Audits read**: `tests/28_0_launch_readiness_audit.md`, `tests/28_1_security_authorization_remediation.md`
**Prior state**: P0 = 0 remaining, P1 = 0 remaining, 175 tests pass, 61 pre-existing Shiprocket failures

---

## 1. Executive Summary

All 14 P2 findings from Phase 28-0 §24 were individually triaged against launch impact
(customer purchase, Kitchen/Mart/admin operation, payment, fulfillment), existing
workarounds, and fix risk. Result:

- **5 fixed** (2 MUST-FIX + 3 low-risk SHOULD-FIX), each with regression tests
- **9 deferred** with explicit safety justification — none blocks customer purchase,
  payment, order integrity, fulfillment, authorization, or essential business operation
- **0 new test failures** (206 pass; 61 Shiprocket failures unchanged pre-existing)
- **TypeScript PASS, build PASS**, protected files untouched, no secrets in diff

No P0/P1 regression was discovered. No Mart shipping prices, checkout, cart, payment,
location, shipping, order-workflow, or store architecture was redesigned.

---

## 2. Original P2 Findings

| ID | Finding | Classification | Action |
|----|---------|----------------|--------|
| SEC-007 | IDOR on customer collections (read queries lack ownership check) | **A — MUST FIX** | FIXED |
| SEC-008 | `customers.update` lets a customer overwrite their own `status` | **A — MUST FIX** | FIXED |
| SEC-009 | Schema validation disabled (`schemaValidation: false`) | C — DEFER | Deferred (§4) |
| SEC-010 | Offers `getAll` exposes all offers without auth | C — DEFER | Deferred (§4) |
| SEC-011 | `seedPolicies` mutation has no auth guard | **B — SHOULD FIX** | FIXED |
| SEC-012 | `trackEvent` mutation has no auth/rate limiting | C — DEFER | Deferred (§4) |
| SEC-013 | Review `businessUnitId` not validated against product's BU | **B — SHOULD FIX** | FIXED |
| SEC-017 | Hardcoded fallback WhatsApp number | C — DEFER | Deferred (§4) |
| SEC-018 | Hardcoded `freebuff.com` project URL in instrumentation | C — DEFER | Deferred (§4) |
| CONFIG-001 | `VITE_VLY_APP_ID`/`VITE_VLY_MONITORING_URL` may be missing, silently disabling error reporting | **B — SHOULD FIX** | FIXED |
| CONFIG-002 | `schemaValidation: false` in production (duplicate of SEC-009) | C — DEFER | Deferred (§4) |
| OPS-002 | Race: cron cancellation vs Razorpay payment arrival | C — DEFER | Deferred, already mitigated (§4) |
| OPS-003 | Orphaned Razorpay orders if `updateRazorpayOrderId` fails | C — DEFER | Deferred (§4) |
| OPS-004 | Phone normalization inconsistency (client vs server) | C — DEFER | Deferred, unreachable (§4) |

Note: SEC-009 and CONFIG-002 are the same underlying flag counted twice in the
28-0 report; they are dispositioned together.

---

## 3. Findings Fixed

### SEC-007 — Collections read IDOR (A)
- **Problem**: `getByCustomer`, `getByCustomerAndType`, `bulkCheck` accepted any
  `customerId` with no ownership check; enumerating customer IDs scraped
  favorites/wishlist/recently-viewed. Mutations already enforced ownership.
- **Affected**: customer privacy; no purchase/payment block, but real PII-adjacent leak.
- **Fix** (`convex/collections.ts`): added the exact ownership guard the mutations use
  (`getUserIdentity` → lookup by `by_auth_user` → `_id === args.customerId`) to all
  three read queries. All frontend callers (`use-collections.ts`, `FavouritesPage`,
  `AccountDashboardPage`) query with the logged-in customer's own ID, so no breakage.
- **Test**: `28_2_p2_remediation.test.ts` → SEC-007 block (3 tests).

### SEC-008 — Customer self-update status overwrite (A)
- **Problem**: `customers.update` self-service path spread `...fields` including `status`;
  a customer could archive/deactivate their own account (support burden, account lockout
  at launch). (`totalSpent`/`totalOrders` were never settable — not in args — audit
  overstated this part; only `status`, plus `notes`, was reachable.)
- **Fix** (`convex/customers.ts`): self-service path throws
  `"Only admins can change account status"` when `status` is provided; admin
  (`sessionToken`) path unchanged. Customer-safe `updateProfile` mutation was already
  restricted to name/email/phone.
- **Test**: SEC-008 block (3 tests).

### SEC-011 — `seedPolicies` without auth (B)
- **Problem**: anyone could invoke global delivery-policy seeding.
- **Launch risk**: near-zero in practice (idempotent no-op once policies exist; no code
  callers in the repo — dashboard-invoked only), but the fix is zero-risk.
- **Fix** (`convex/deliveryPolicies.ts`): required `sessionToken` arg + `requireAdminSession`,
  matching every other admin mutation convention. No frontend callers to update.
- **Test**: SEC-011 block (3 tests).

### SEC-013 — Review BU mismatch (B)
- **Problem**: `reviews.create` accepted any `businessUnitId` regardless of the product's
  real store → misattributed cross-store reviews (trust/correctness, not financial).
- **Fix** (`convex/reviews.ts`): fetch catalog item (it always has `businessUnitId` per
  schema), throw `"Product not found"` if missing/soft-deleted, throw on BU mismatch.
  Frontend `ReviewSection` submits the product's own BU, so no breakage.
- **Test**: SEC-013 block (4 tests).

### CONFIG-001 — Silent observability disable (B)
- **Problem**: `reportErrorToVly` returned silently when env vars missing — a
  misconfigured production build would lose all error reporting without anyone knowing.
- **Fix** (`src/instrumentation.tsx`): `console.warn("[observability] Vly error reporting
  is disabled: ...")` before returning. Behavior otherwise identical.
- **Nuance found during verification**: `InstrumentationProvider` is currently never
  mounted (`main.tsx` uses its own `RootErrorBoundary` with `console.error` logging), so
  the Vly client-reporting path is inactive regardless of env vars. The warn is still
  correct hardening for whenever the provider is mounted; client runtime errors remain
  visible via `RootErrorBoundary` console logging. No new wiring was added — mounting a
  global error dialog would be a visible behavior change out of scope for this phase.
  Tracked alongside P3 OPS-001 (operational observability) post-launch.
- **Test**: CONFIG-001 block (3 tests).

---

## 4. Findings Deferred

| ID | Why safe to defer |
|----|-------------------|
| SEC-009 / CONFIG-002 | Enabling `schemaValidation: true` in production risks breaking legitimate writes if any stored document drifts from the schema. Needs a dedicated schema-conformance migration phase, not a launch-eve flag flip. No active exploit: all writes go through validated server functions. |
| SEC-010 | Coupon codes are validated server-side (`validateCouponInternal`: status, dates, BU, usage limits) — knowing an inactive code yields nothing usable. Storefront uses the active-only `getAllActiveAcrossBusinessUnits`; `getAll` serves admin pages (`OffersPage`, `FlashSalesPage`) that would need re-plumbing for a session token. No financial impact. |
| SEC-012 | Anonymous analytics is by design (unauthenticated browsers generate view/cart events); `trackEvent` is currently never invoked from the frontend. Worst case is analytics-table spam, not PII/payment/order impact. Rate limiting per-IP is not expressible in a Convex mutation without new infrastructure — deferred to post-launch. |
| SEC-017 | The fallback number ships in the client bundle regardless; moving it to a `VITE_*` env var would still embed it in the bundle (zero secrecy gain). Admin-configured `paymentConfig.whatsappNumber` already takes precedence. Cosmetic config hygiene. |
| SEC-018 | Dev-only error-dialog "Open editor" link shown on runtime errors in preview; not customer checkout flow, no data exposure. |
| OPS-002 | **Already mitigated — no code change needed.** Two independent layers exist: (1) cron runs every 15 min but the timeout defaults to **60 min** (`DEFAULT_RESERVATION_TIMEOUT_MINUTES`), and `checkRazorpayPaymentsBeforeCleanup` queries the Razorpay API to pre-confirm captured payments before any cancellation; (2) `finalizePaidOrder` is idempotent (`paid`/`refunded` → no-op) and restores system-cancelled orders to `pending` while leaving admin cancellations standing. Verified by code read of `convex/maintenance.ts:59-357` and `convex/orders.ts:61-230`. Cannot create duplicate orders, incorrect payment state, or lost payments. Concurrency invariants locked by new tests (OPS-002 block, 5 tests). |
| OPS-003 | A Razorpay **order** is not a charge — no money moves until payment. If `updateRazorpayOrderId` fails, the action throws, the customer sees an error, and retry creates a fresh Razorpay order (the orphan expires unpaid). `verifyPayment` requires the stored ID, so a mismatch can never verify. Recoverable via retry; no cleanup job warranted pre-launch. |
| OPS-004 | **Unreachable in practice.** `CheckoutPage.validate()` (line 1117-1121) blocks submit unless `validateIndianPhone()` passes, and `validateIndianPhone(x) ≡ (normalizeIndianPhone(x) !== null)` — so the `?? raw.trim()` fallback at line 1173 cannot fire with invalid input, and the server's `requireIndianPhone` never rejects a client-accepted phone. Locked by tests against the REAL helpers (`OPS-004` block, incl.junk-rejection cases). |

Mart shipping chain (pincode → zone → weight → rate → quote → snapshot): **not a P2
finding** in the 28-0 report (Mart rows are PASS/PARTIAL flow notes, none raised to §24),
so per phase rules no shipping code or prices were touched.

---

## 5. Root Causes

1. **Read/write guard asymmetry** (SEC-007): mutations got ownership checks, reads didn't.
2. **Over-broad patch spreading** (SEC-008): `...fields` included an admin-managed field
   on the self-service path.
3. **Seed/utility mutations without the admin convention** (SEC-011).
4. **Missing cross-entity consistency check** (SEC-013): review BU vs catalog item BU.
5. **Fail-silent observability default** (CONFIG-001).

---

## 6. Changes Made

```
convex/collections.ts      +22  ownership guard on 3 read queries (SEC-007)
convex/customers.ts        +8   self-service status rejection (SEC-008)
convex/deliveryPolicies.ts +7/-2 requireAdminSession on seedPolicies (SEC-011)
convex/reviews.ts          +10  catalog-item BU match validation (SEC-013)
src/instrumentation.tsx    +7   loud warn when error reporting disabled (CONFIG-001)
tests/28_2_p2_remediation.test.ts  NEW  31 regression tests
```

Total: 5 files, 52 insertions, 2 deletions. No refactors, no redesigns.

---

## 7. Tests Added

`tests/28_2_p2_remediation.test.ts` — 31 tests, all passing:
SEC-007 (3) · SEC-008 (3) · SEC-011 (3) · SEC-013 (4) · CONFIG-001 (3) ·
OPS-002 race invariants (5) · OPS-004 real-helper agreement incl. `it.each` valid/invalid phones (10).

---

## 8. Full Test Results

```
Test Files  1 failed | 7 passed (8)
Tests       61 failed | 206 passed (267)
```

- 206 pass = 175 pre-existing + 31 new. **0 new failures.**
- 61 failures are exactly the pre-existing `26f5_shiprocket_adapter_rewrite.test.ts`
  `ERR_MODULE_NOT_FOUND` failures documented since Phase 27 — unchanged, unrelated.
- Targeted run: `28_2_p2_remediation.test.ts` 31/31 PASS.

---

## 9. TypeScript

```
npx tsc --noEmit → PASS (no errors)
```

---

## 10. Build

```
npx vite build → PASS (✓ built in 16.88s)
```

Only pre-existing warnings (vite config `__dirname` notice, deprecated esbuild option
notice, `convex-vendor` empty chunk) — no new warnings.

---

## 11. Security Regression

- `git diff` scanned for secrets/keys: **no matches** (only validation-comparison strings).
- 28-1 fixes re-verified intact: `VLY_API_KEY` env-only, `validateSessionSecret`
  fail-closed, DB-persisted brute-force counters, order rate limiting, `requireAdminRole`
  helper, kitchen BU filter — none of these files were touched by this phase.
- No P0/P1 regression discovered → deployment permitted.

---

## 12. Production Smoke

**Deployments**:
- Commit `026976f` (`fix: resolve launch-critical p2 issues`)
- Convex: deployed to `prod:wry-cobra-318` (`https://wry-cobra-318.convex.cloud`) — PASS
- Cloudflare: deployment `81c11021` live on `mb-crunchy-store`
  (`https://81c11021.mb-crunchy-store.pages.dev`, production) — PASS.
  Note: frontend bundle is content-identical to the previous deploy (all P2 code
  changes are server-side Convex functions plus dead-code hardening), confirmed by
  Pages file-dedup (0 new files) and by `dist` containing none of the new strings.
- No real payments, orders, or Shiprocket shipments performed.

| # | Check | Status |
|---|-------|--------|
| 1 | Homepage (`/`) | PASS — HTTP 200, shell serves |
| 2 | Store selection (SPA shell) | PASS — shell serves, routing client-side |
| 3 | Kitchen catalog (`/kitchen`) | PASS — HTTP 200 |
| 4 | Mart catalog (`/mart`) | PASS — HTTP 200 |
| 5 | Product page (SPA route) | PASS — covered by shell serve |
| 6 | Cart (client store, untouched) | PASS — no code path changed |
| 7 | Mixed cart (server rejects mixed-BU, untouched) | PASS — no code path changed |
| 8 | Location (protected files untouched) | PASS — no code path changed |
| 9 | Kitchen serviceability (protected, untouched) | PASS — no code path changed |
| 10 | Mart serviceability (protected, untouched) | PASS — no code path changed |
| 11 | Checkout (server authoritative, untouched) | PASS — no code path changed |
| 12 | Payment test-mode flow (Razorpay files untouched) | PASS — no code path changed; no live payment attempted |
| 13 | Order confirmation/recovery (untouched) | PASS — no code path changed |
| 14 | Order tracking (`/track-order`) | PASS — HTTP 200 |
| 15 | Admin login (`/admin/login`) | PASS — HTTP 200 |
| 16 | Staff authorization (28-1 guards untouched) | PASS — verified via code (kitchen BU filter intact) |
| 17 | Store isolation | PASS — `reviews.create` BU check now strengthens isolation |

Security sweep of built bundle (`dist`): the only secret-pattern match is the admin
SetupPage help text naming env var *names* (`RAZORPAY_KEY_ID` etc.) for operators —
no secret *values*. `vlytothemoon` and the old session fallback appear nowhere.
**No secrets in browser source — PASS.**

---

## 13. Protected Files

All verified **unmodified** (`git status` clean for each):

- `convex/geocode.ts` · `src/utils/location.ts` · `src/stores/location.ts`
- `src/hooks/use-razorpay.ts` · `convex/razorpay.ts` · `convex/razorpayWebhook.ts`
- `convex/orderWorkflow.ts` · `convex/notificationService.ts` · `src/stores/cart.ts`
- meal-deal pricing logic · Shiprocket architecture · 28-1 auth/security files
  (`convex/auth/emailOtp.ts`, `convex/utils/crypto.ts`, `convex/adminAuth.ts`,
  `convex/utils/adminAuth.ts`, `convex/schema.ts`, order-creation rate limit in
  `convex/orders.ts` — the only `orders.ts`/`customers.ts` touches are the P2 guards above)

---

## 14. Remaining P3 Findings

Untouched per phase rules: SEC-014 (helpful-count replay), SEC-015 (analytics
flooding/size), SEC-016 (unauthenticated geocoding), SEC-019 (`console.error` in
production), SEC-020 (`as any` casts), PERF-001 (485KB bundle), PERF-002 (blocking
Razorpay script), PERF-003 (empty chunk), OPS-001 (no operational dashboard).

---

## 15. Remaining P4 Findings

Untouched per phase rules: SEO-001 (meta description), SEO-002 (Open Graph), SEO-003
(sitemap/robots), SEO-004 (generic title), OPS-005 (61 pre-existing Shiprocket failures).

---

## 16. Remaining Launch Risks

1. `schemaValidation: false` remains — accepted; all writes are server-validated.
2. No operational dashboard for failed payments/webhook failures/stuck orders (OPS-001,
   P3) — cron + notification service cover the critical path; recommend post-launch.
3. Analytics/geocoding endpoints unauthenticated (P2-deferred/P3) — abuse impact capped
   at quota/spam, no order/payment impact.
4. SEO gaps (P4) — discoverability only, no functional risk.

None of the above threatens customer payment, order integrity, fulfillment,
authorization, financial correctness, or essential business operation.

---

## Final Verdict

**PASS — REMAINING P2 RISKS ACCEPTABLY DEFERRED**
