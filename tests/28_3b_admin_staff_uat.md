# Phase 28-3b — Admin / Staff UAT Supplement

**Date**: 2026-09-18
**Parent audit**: `tests/28_3_e2e_uat_audit.md` (§§8, 9, 12, 16)
**Production**: `https://mb-crunchy-store.pages.dev` + `prod:wry-cobra-318`
**Method**: headless Chrome, logged in as owner-supplied `Admin` account.
**Strictly read-only**: no order created/updated/cancelled/refunded, no catalog,
price, inventory, staff, or settings change. The auditor's own session was
server-invalidated afterwards (`adminAuth:logout` → success) and the dead token
verified to bounce to login. Password never written to disk or commits.

---

## 1. Credentials

- `admin` / supplied password → **rejected twice** ("Invalid username or password");
  stopped to protect the 5-attempt DB-persisted lockout. No lockout triggered.
- `Admin` / same password → **login PASS**, landed `/admin/dashboard` as Administrator.

## 2. Admin Results — PASS (all read-only)

| # | Check | Result |
|---|-------|--------|
| 1 | Login | PASS — clean redirect to dashboard, zero errors |
| 2 | Dashboard | PASS — overview, revenue cards render |
| 3 | View orders | PASS — 47 total (Pending 0, In Progress 0, Out for Delivery 0, Delivered 1, Cancelled 46), Today's Paid Revenue ₹0, Avg Order Value ₹188, 20 rows/page, 3 pages |
| 4 | Filter by store | PASS — "All business units / MB Kitchen / MB Mart" menu; Kitchen filter returns Kitchen rows |
| 5 | Order details | PASS — row click opens dialog: invoice/packing-slip/kitchen-ticket print, customer (name/phone/email), delivery type + address, items + variant + price, subtotal/delivery/tax/total, WhatsApp Customer, payment (Paid/Razorpay), full timeline (created→reserved→verified→Cancelled by Admin with inventory release) |
| 6 | Update status | NOT EXECUTED (production mutation) — bulk bar (Update Status/Cancel/Refund/Export CSV) and per-order actions render; Timeline on MB-EB2DM3 proves the status flow works in production history |
| 7 | Customer-facing state | N/A (no status changed) |
| 8-11 | Products / Categories / Variants / Offers / Meal deals | PASS — all pages render with data |
| 12 | Business-unit management | PASS — page renders |
| 13 | Serviceability config | PASS — Serviceable Areas (mart pincodes) renders |
| 14 | Shipping config | PASS — zones, weight-slab rates, shipping config all render |
| 15 | Customer/order visibility | PASS — Customers page renders; orders show name + phone |
| 16 | Logout | PARTIAL — **no global logout control** (see F-08); session terminated via API for hygiene |
| 17 | Re-login/session | PASS — fresh context bounces `/admin/dashboard` and `/admin/orders` to `/admin/login`; dead token auto-cleared and bounced (expiry/invalid-session path verified live) |
| 18 | Session expiry behavior | PASS (via invalidated token) |

Zero console/page/HTTP errors on every admin page visited.

## 3. Staff Results — PARTIAL

- Kitchen Staff Accounts section (Settings) lists **`MBSwapna`, Active, assigned MB Kitchen + MB Mart**, created/last-login 8/14/2026. Role/BU management UI present.
- Staff login (`/kitchen/login` renders) and live cross-store denial **NOT TESTABLE** —
  no staff password available, and resetting a real user's password is a production
  mutation (refused).
- `/kitchen/dashboard` unauthenticated shows **infinite "Loading..."** instead of
  redirecting to login — **F-07** (root-caused, no data exposed).
- Code-level 28-1 kitchen BU filter intact (untouched files).

## 4. Owner Operations — now fully answered

1 See new orders? **YES** (stat cards + table). 2 Which store? **YES** (BU filter;
row-level store column absent — filter + details compensate; note F-09).
3 Customer? **YES** (name/phone/email). 4 Items? **YES**. 5 Quantities? **YES**.
6 Amount? **YES** (subtotal/delivery/tax/total). 7 Payment status? **YES**
(Paid/Pending badges + method). 8 Delivery/pickup? **YES** (type + address).
9/10 Process Kitchen/Mart order? **UI present** (Update Status/Cancel/Refund,
print flows, WhatsApp Customer) — not executed on production data.
11 Shipping info? **YES** (zones/rates/config + per-order delivery fee).
12 Update status? **UI present, timeline proves it works** — not executed.
13 Failed-payment recovery? Timeline on MB-EB2DM3 shows paid→admin-cancelled with
inventory release; refund path UI present — not executed.
14 Contact customer? **YES** (phone/email + WhatsApp Customer button).
15 Prevent cross-store mistakes? **YES** (BU filter + server-side mixed-BU rejection).

## 5. Findings

| ID | Severity | Flow | Finding | Evidence | Reproduction |
|----|----------|------|---------|----------|--------------|
| F-07 | P3 | Staff auth UX | `/kitchen/dashboard` logged-out hangs on "Loading..." forever instead of redirecting to `/kitchen/login`. Root cause: `use-kitchen-auth` `isLoading: isChecking \|\| serverVerifySession === undefined` — skipped query leaves it `undefined` forever (admin hook handles null-token correctly). No data exposed; recoverable via direct `/kitchen/login` navigation. | logged-out headless visit: title set, body "Loading...", 0 inputs, no redirect | visit `/kitchen/dashboard` with no session |
| F-08 | P3 | Admin session UX | No global logout control: `AdminLayout` destructures `logout` but never renders it; sign-out exists only in Settings → Session Management ("Sign Out"/"Sign Out Others"). Admins stay signed in unless they dig. Compare: Kitchen dashboard HAS a visible Logout button. | code (`AdminLayout.tsx:15` unused) + UI hunt (admin menu = Profile settings + View storefront only) | log in, look for logout outside Settings |
| F-09 | P4 | Owner UX | Orders table has no store/BU column — store attribution requires the BU filter or opening details. Minor next to F-08/F-07. | table headers: Order/Customer/Items/Total/Type/Status/Payment/Time/Actions | view `/admin/orders` |

Production data note (not a finding): 46/47 orders Cancelled, 1 Delivered, all under
one customer — consistent with pilot testing, not customer impact.

## 6. Data Integrity

Only reads plus: 2 failed `login` (wrong username), 1 successful `login`, 1 `logout`
(own session). No order/catalog/customer/settings/staff mutation of any kind. No
lockout triggered on any account. Harness and session file deleted.

---

## Verdict

**ADMIN UAT PASS** (read-only; status-changing operations verified present + proven
by production timeline history, not executed). **STAFF UAT PARTIAL** (F-07 logged-out
hang; live staff denial needs staff credentials). Two P3s (F-07, F-08) recommended
for the next fix phase — neither blocks purchase, payment, fulfillment, or data safety.
