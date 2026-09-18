# Phase 28-3c — Staff Authorization UAT

**Date**: 2026-09-18
**Parent audits**: `tests/28_3_e2e_uat_audit.md`, `tests/28_3b_admin_staff_uat.md`
**Production**: `https://mb-crunchy-store.pages.dev` + `prod:wry-cobra-318`
**Account**: `MBSwapna` (Active, assigned MB Kitchen + MB Mart), owner-supplied credentials.
**Strictly read-only**: no password change, no order/status/catalog/price/inventory/
customer/config mutation, no orders, no payments. Password never written to disk or
commits (env-only). Auditor sessions terminated afterwards (kitchen logout ×2 server-
verified; one orphan staff session from a closed headless profile left to natural
expiry — token unrecoverable by anyone; documented in §9).

---

## 1. Credentials availability

AVAILABLE (owner-supplied). One careful `/kitchen/login` attempt → success. No
lockout risk taken (first attempt on this username).

## 2. Staff login — PASS

Lands `/kitchen/dashboard` with zero errors. Header shows **"Assigned: MB Kitchen +
MB Mart"**, role lanes (New/Preparing/Ready/Completed Today, all 0 — consistent with
admin view: no active orders), and a visible **Logout** button. Session created
(`mb-crunchy-kitchen-session`).

## 3. Kitchen access — PASS

Dashboard queries per assigned BU with staff session token (code + live):
`orders.getByBusinessUnit{kitchen}` → **40 orders**. Lanes render; no admin nav
exposed in kitchen shell (only `/kitchen/dashboard` link + Logout).

## 4. Mart access — PASS

`orders.getByBusinessUnit{mart}` → **7 orders** (40 + 7 = 47 = admin total ✓).
Dashboard combines both assigned BUs (code: per-BU queries merged). No Kitchen-only
assumption made — dual assignment honored.

## 5. Unauthorized BU test — PASS (server authoritative)

- Fabricated BU id in request body → **REJECTED** (server error, no data).
- Dead/invalid token → **REJECTED**.
- No third BU exists in prod; no BU URL param exists on the dashboard (assignment
  comes from the verified session, never from client input) — nothing to manipulate.
- 28-1 BU filter verified live: unassigned BU returns nothing for kitchen role.

## 6. Admin-only operation test — FAIL (finding F-10)

- Staff credentials at **`/admin/login` → GRANTED full admin dashboard**
  ("AD Administrator"). Admin entry point performs **no role check**.
- With the staff session token, read-only probes returned:
  - `customers:getAll` → **array[3]** (full customer records incl. PII)
  - `products:getAll` → **array[51]** (full admin catalog)
- So kitchen staff can read all customers and the full catalog — the SEC-005
  residual from 28-1 (`requireAdminRole` built but, per 28-1 §9, left "for future
  privileged operations") is live-proven, not theoretical. Mutations were NOT
  attempted (would violate read-only rule) but they share the same `requireAdminSession`
  gate, so the gap presumptively extends to writes.
- Mitigating context: separate localStorage keys mean casual URL visits to `/admin/*`
  with only a kitchen session bounce to login; the gap requires deliberate admin-login
  with staff creds. Staff already sees customer PII on orders they fulfill — marginal
  exposure is bulk customer list + catalog internals, not a new data class.

## 7. Session behavior — PASS with UX gap (F-11)

- Refresh/reuse: PASS. Logout button → server session invalidated (verified: old
  token subsequently shows the login form).
- Dead/invalid token → correct redirect to `/kitchen/login` with auto-clear. PASS.
- BUT post-logout UI hangs on infinite **"Loading..."** instead of navigating to
  login (F-11, same root cause as F-07).

## 8. Cross-store isolation — PASS

Authorized Kitchen (40) + Mart (7) accessible; fabricated BU rejected; invalid token
rejected. Server-side authorization authoritative; frontend derives assignment from
the verified session.

## 9. Data mutation verification

Zero mutations performed. Only reads + 3 staff `login` (2 via UI incl. admin-entry
probe, 1 implicit) + 2 `logout` (own sessions). One orphan session (closed profile,
token unrecoverable) left to natural `SESSION_EXPIRY_MS` expiry — no action needed;
deliberately did NOT call `logoutAllSessions` (would sign out the real user).
No lockout triggered on any account. Harness + session files deleted.

## 10. Findings

| ID | Severity | Finding | Evidence | Reproduction |
|----|----------|---------|----------|--------------|
| F-10 | **P2** | Staff → full admin surface: kitchen credentials accepted at `/admin/login`; staff token reads `customers.getAll` (3, PII) and `products.getAll` (51). SEC-005 residual live-proven. Fix: roll out 28-1's `requireAdminRole` to admin queries/mutations + role-gate admin login/UI. | live probes + admin-entry screenshot (`st4-admin-entry.png`, local only) | log into `/admin/login` as `MBSwapna`; query `customers:getAll` with staff token |
| F-11 | P3 | Staff logout hangs UI on "Loading..." (server logout works). Same root cause as F-07. | post-logout URL stays `/kitchen/dashboard`, body "Loading..." at T+2s and T+7s | log into kitchen dashboard → Logout |
| F-07 refined | P3 (unchanged) | No-token case hangs forever; invalid-token case correctly redirects. Fix: when `!sessionToken`, skip loading and redirect (mirror `use-admin-auth`). | logged-out dashboard vs dead-token redirect | visit `/kitchen/dashboard` with empty storage |

---

## Final Verdict

**BLOCKED — STAFF AUTHORIZATION ISSUE FOUND**

Scope precisely: BU isolation (the 28-1 P1 fix) is **enforced live** — PASS.
What fails is admin-surface role enforcement (F-10, P2): any kitchen staff can obtain
a full admin session and bulk-read customers/catalog. This is the documented 28-1
residual, now proven exploitable through the normal login UI rather than theoretical.
Recommend a focused 28-4: enforce `requireAdminRole(["superadmin","admin"])` on admin
queries/mutations (or an explicit allowlist for kitchen), role-gate `/admin/login`
and `AdminLayout`, fix F-07/F-11/F-08. No customer purchase/payment/fulfillment flow
is affected; do not conflate with checkout readiness.
