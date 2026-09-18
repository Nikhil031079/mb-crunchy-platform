# Phase 28-4 — Admin Role-Gate Remediation

**Date**: 2026-09-18
**Trigger**: 28-3c verdict BLOCKED (F-10: staff reached the full admin surface).
**Method**: smallest role-gating layer on the existing session architecture — no auth
rewrite, no checkout/cart/payment/location/shipping/order-workflow changes.

---

## 1. Root Cause F-10

Three compounding gaps, all verified live before the fix:

1. `adminAuth.login` accepted **any role** — staff credentials yielded a valid session
   at `/admin/login` (proven: staff landed on the admin dashboard).
2. 108 backend call sites used `requireAdminSession` (session validity only, **zero**
   `requireAdminRole` usages) — any valid session, incl. kitchen, could call
   `customers.getAll` (3 records, PII) and `products.getAll` (51 records).
3. `AdminLayout` checked only `isAuthenticated` (any verified session) — no role UX gate.
4. Contributing: `orders.getByCustomer` returned **full** documents to any session.

The 28-1 BU filter on `getByBusinessUnit` was working and is preserved.

## 2. Authorization Model

| Identity | Session | Roles | Allowed |
|----------|---------|-------|---------|
| Customer (Convex Auth) | none | — | own data via ownership guards; public storefront reads |
| Staff (`kitchen`) | admin-session token | kitchen + `businessUnitIds` | kitchen login; `getByBusinessUnit` (assigned only); `updateStatus` (assigned-BU orders only); `getByCustomer` sanitized projection; public reads |
| Admin (`admin`/`superadmin`) | admin-session token | full | entire admin surface |

Roles come from the `admins` doc via `verifySession`; the decision is always
server-side. Entry points enforce: `/admin/login` → superadmin/admin only,
`/kitchen/login` → kitchen only (generic "Invalid username or password." preserved,
no enumeration, no brute-force counter burned on role mismatch).

## 3. Admin Login Protection

- `login` accepts optional `allowedRoles`; mismatch returns the generic error.
- `useAdminAuth.login` / `useKitchenAuth.login` forward `allowedRoles?` (optional →
  backwards compatible); pages pass `["superadmin","admin"]` / `["kitchen"]`.
- Live: staff at `/admin/login` → stays on login with generic error; admin → dashboard.

## 4. Admin Route Protection

- `AdminLayout`: authenticated non-admin role → redirect `/kitchen/login` (server
  remains authoritative; all direct-URL navigations covered since every admin route
  renders inside the layout).
- Live: staff session has no path into admin UI even with a token.

## 5. Backend Authorization

- All 108 `requireAdminSession(ctx, args.sessionToken)` sites converted to
  `requireAdminRole(..., ["superadmin","admin"])` across 25 files, EXCEPT:
  - `orders.getByBusinessUnit` — keeps BU filter (28-1).
  - `orders.updateStatus` — keeps session + **new BU scope**: kitchen role may only
    transition orders whose `businessUnitId` ∈ `admin.businessUnitIds`.
  - `orders.getByCustomer` — keeps access check; full docs now superadmin/admin only.
  - `adminAuth.ts` self-ops (logout, changeUsername/changePassword with current-
    password check, recovery-key flows, `logoutAllSessions` already self-constrained,
    superadmin-gated staff management) — verified sound, untouched.
  - Public reads (BU catalog/settings getters) and customer-identity paths — untouched.
- Customer phone-scoped quote accept/reject — untouched (possession-factor, correct).

## 6. Customer PII Protection

- `customers.getAll` (+360/insights/timeline/byPhone/byAuthUserId/update-admin-path/
  softDelete) → role-gated. Live: staff token DENIED, admin token returns 3 records.
- `orders.getByCustomer` → kitchen role receives `sanitizeOrderForCustomer`
  projection (verified live: no `customerPhone`/`deliveryAddress`/`email`/
  `customerName` keys); admin keeps full docs.
- Residual (documented, out of matrix scope): `addresses.*` / `loyalty.*` customer-
  scoped reads via staff token rely on per-customer targeting rather than enumeration;
  staff already sees assigned-order customer data for fulfillment. Recommend covering
  in a future pass if a stricter model is desired.

## 7. Staff Business-Unit Access

Live with real staff session: Kitchen 40 orders, Mart 7 (40+7=47=admin total),
fabricated BU rejected, dead token rejected, kitchen login works. Assignments
unchanged. `updateStatus` BU scope covered by unit matrix (live status mutation
forbidden on production data).

## 8. F-07 Fix

`use-kitchen-auth` `isLoading` now mirrors `use-admin-auth`
(`isChecking || (sessionToken !== null && verified === undefined)`), so the skipped-
query state resolves. `KitchenLayout` redirects to `/kitchen/login`. Live: logged-out
`/kitchen/dashboard` → login URL (was infinite "Loading...").

## 9. F-11 Fix

Same root cause: post-logout token clear now resolves auth state and redirects.
Live: staff Logout → `/kitchen/login` with login form (was stuck "Loading..." while
the server session was already dead).

## 10. F-08 Fix

`AdminTopbar` user menu gains a **Log out** item (LogOut icon) on every admin page:
calls existing `logout()` then navigates to `/admin/login`. Live: item present,
click → server session destroyed → lands login; dead token auto-clears and bounces.
No visual redesign (one menu item).

## 11. Tests

- New `tests/28_4_admin_role_gate.test.ts`: **26/26 PASS** — login gate (7),
  backend role gate (4), updateStatus BU scope (5), PII projection (3), route
  decisions (3), kitchen loading resolution (4).
- Full suite: **232 pass** (206 + 26), 61 pre-existing Shiprocket failures unchanged,
  **0 new failures**.

## 12. Security Regression

- Post-fix grep: bare `requireAdminSession(ctx, args.sessionToken)` remains only at
  the 3 intentional keep-list sites in `orders.ts`; `requireAdminRole` used
  everywhere else on the admin surface; no `requireAdminSession` import left unused
  (tsc clean).
- 28-1/28-2 guards intact (VLY env key, session-secret fail-closed, brute-force DB
  counters, order rate limiting, SEC-007/008/011/013, CONFIG-001 warn).
- No P0/P1 regression. No secrets in diff (scanned). Live: admin→admin allowed,
  staff→admin denied at login, layout, and every probed backend function.

## 13. TypeScript

`npx tsc --noEmit` → PASS.

## 14. Build

`npx vite build` → PASS (7.37s, no new warnings).

## 15. Production Smoke

- Commit `6b0983d` → Convex `prod:wry-cobra-318` PASS.
- `dist` → Cloudflare `17c90420` live PASS (150 files).
- Read-only/security smoke (new deployment): homepage, Kitchen, Mart, cart,
  track-order, admin login, kitchen login — all 200, titles correct, **zero**
  console/page/HTTP errors.
- Matrix on new deployment: staff→admin-login DENIED (generic) · admin login OK ·
  staff kitchen login OK · staff Kitchen/Mart reads OK · staff customers/products
  DENIED · staff fake-BU DENIED · staff projection sanitized · admin projection full ·
  F-07/F-08/F-11 redirect+logout verified in browser.
- No orders, payments, shipments, or production data changes (only auditor's own
  login/logout sessions, all terminated; dead-token bounce verified).

## 16. Files Changed

35 files: `convex/adminAuth.ts` (login `allowedRoles`); 24 convex files
(session→role gate); `convex/orders.ts` (4 role gates + updateStatus BU scope +
getByCustomer projection); `src/hooks/use-{admin,kitchen}-auth.tsx`;
`src/pages/{admin/AdminLoginPage,kitchen/KitchenLoginPage}.tsx`;
`src/layouts/admin/AdminLayout.tsx`; `src/components/admin/AdminTopbar.tsx`;
`src/hooks/use-kitchen-auth.tsx` (loading); `tests/28_4_admin_role_gate.test.ts`.

## 17. Protected Files

Untouched: geocode, location utils/store, use-razorpay, razorpay(+webhook),
orderWorkflow, notificationService, cart store, meal-deal pricing, Shiprocket,
checkout/cart/payment/shipping/serviceability logic. `updateStatus` state-machine
and payment guards byte-identical apart from the added BU-scope block.

## 18. Remaining Findings

- F-02/F-03/F-04/F-05 (28-3 cosmetic/config notes) — untouched per scope.
- addresses/loyalty staff-token path (§6 residual) — future hardening candidate.
- P3 OPS-001 (no ops dashboard), P4 SEO gaps — untouched per scope.
- One orphan staff test session (closed headless profile, token unrecoverable)
  left to natural expiry — no action needed.

---

## Final Verdict

**PASS — ADMIN ROLE BOUNDARY VERIFIED**
