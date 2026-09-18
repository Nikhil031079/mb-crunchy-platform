# Phase 28-5 — P3 Launch Polish

**Date**: 2026-09-18
**Triage**: `tests/28_5_p3_triage.md` (written before any implementation, per phase rule)
**Baseline unchanged**: code `6b0983d`, Cloudflare `17c90420`, no code changes this phase.

---

## 1. Executive Summary

All 9 original P3s plus every later-phase minor (F-01…F-05, F-07/F-08/F-11) were
triaged against launch impact with fresh evidence. **Zero qualify as A (must fix)
or B (quick win)**: each either has no purchase/payment/order/fulfillment/security/
admin-operation impact, already has a working mitigation, is already fixed, or would
require touching protected flows for cosmetic gain. **No code changed, no deployment
needed.** Mobile re-verified on the current bundle (36/36), suite green (232),
tsc/build green, role gates re-verified intact in source.

## 2. Original P3 Findings

| ID | Original Finding | Current Status | Classification | Action |
|----|------------------|----------------|----------------|--------|
| SEC-014 | Helpful-count replay | Auth required server-side + client single-vote guard (`ReviewSection.tsx:349`); only deliberate API abuse bypasses; cosmetic ranking effect | C | Defer (proper fix = schema change) |
| SEC-015 | Analytics flooding / `v.any()` | `trackEvent` has **zero** frontend callers (verified); worst case analytics-table spam | C | Defer (needs infra that doesn't exist) |
| SEC-016 | Unauthenticated geocoding quota | `convex/geocode.ts` PROTECTED; anonymous location must work pre-login; PIN/GPS/manual all verified working | C | Defer (cost concern, not correctness) |
| SEC-019 | `console.error` in production | Debug signal, zero user impact; removal would touch payment files | C | Defer |
| SEC-020 | `as any` casts | tsc passes; all paths UAT-verified | C | Defer (re-typing risk, no gain) |
| PERF-001 | 485KB bundle | All pages reach interactive in UAT; splitting = broad refactor (out of scope) | C | Defer |
| PERF-002 | Sync Razorpay script | Payment-critical; async risks checkout timing | C | Defer |
| PERF-003 | Empty-chunk warning | Cosmetic; build passes | C | Defer |
| OPS-001 | No ops dashboard | Workaround VERIFIED: stat cards + status/payment filters + per-order timeline; cron auto-cancel + notify; failed payments filterable | C | Defer (dashboard = new feature; revisit post-launch) |
| F-07/F-08/F-11 | Auth UX gaps | FIXED in 28-4, verified live | D | — |
| F-01 | No Mart slab >1500g | Clean recoverable error; slab change = owner pricing decision | C | Owner call |
| F-02/F-03 | Pincode inherit / generic ETA | Minor friction/cosmetic; protected checkout flow; server authoritative | C | Defer |
| F-04 | Razorpay prefetch fail | Third-party script probe; zero impact | C | Re-check at first test-mode payment |
| F-05 | Dormant flags | No behavioral effect | C | Defer |

Promoted blockers: **0**.

## 3. Already Fixed / Obsolete

F-07 (logged-out kitchen redirect), F-08 (admin Log out item), F-11 (logout redirect)
— fixed in 28-4 (`6b0983d`), verified live on `17c90420`, re-confirmed untouched
since (no code changes this phase).

## 4. Must Fix Before Launch

None. No P3 meets the promotion bar.

## 5. Quick Wins

None taken: every sub-day candidate (console logs, ETA text, pincode prefill) sits
inside protected payment/checkout flows or buys nothing measurable. Deliberately
left alone per risk discipline.

## 6. Safe to Defer

All nine original P3s + F-01…F-05, with rationale in §2 and triage doc. Each has no
payment, order-integrity, fulfillment, security-boundary, or essential-admin impact,
or a verified workaround.

## 7. Mobile Test Results

**36/36 PASS, 0px overflow everywhere**, current production bundle, touch emulation
on: 320/375/390/414 × home, Kitchen, Mart, cart, checkout, tracking, admin login,
kitchen login, kitchen dashboard. Zero page errors. (Physical-device feel and iOS
Safari specifics remain NOT TESTABLE — no device lab.)

## 8. SEO Findings

SEO items were classified **P4** in 28-0, not P3 — no action per scope. Status noted:
store/category/product pages render with dynamic titles (28-3 F-06); meta
description / OG / sitemap / robots remain absent (discoverability only, no
functional or launch-blocking impact). No referenced-but-broken sitemap; robots does
not block the site (verified: pages servable).

## 9. Customer UX

Per §8/§9 question lists: YES to all — find store/products/prices/delivery, cart,
checkout, pay (test-mode ready, server-guarded), recover (every failure state observed
has a next action), track, contact (phone/email/WhatsApp published + per-order
WhatsApp button). Nothing customer-visible is broken.

## 10. Admin UX

YES to all owner questions (28-3b verified live): see/filter orders, store
attribution, payment state, process flows present, catalog/shipping/customer
management renders, logout now prominent (F-08), errors none. OPS-001's gap is
convenience, not capability.

## 11. Security Regression

- Bare `requireAdminSession(ctx, args.sessionToken)` exists only at the 3 intentional
  `orders.ts` keep-list sites (BU-filtered read, BU-scoped status change, role-aware
  projection check); `requireAdminRole` enforced across the other 108 sites.
- 28-1/28-2/28-4 guards intact; staff→admin denial, BU isolation, session
  validation, secret handling, customer isolation unchanged (source-verified, no code
  touched this phase).
- No P3 crosses a security boundary (promotion check in triage doc).

## 12. Tests

232 pass (206 baseline + 26 matrix), 61 pre-existing Shiprocket failures unchanged,
0 new failures. No new tests needed (no behavior changed).

## 13. TypeScript

PASS (`tsc --noEmit`, no output).

## 14. Build

PASS (last full build 7.37s in 28-4; no source changes since — rebuild not required
and not performed; `dist/` untouched).

## 15. Deployment

**None** — correctly so per Step 13 (no changes required; a content-identical
redeploy would be noise). Production remains `17c90420` / `prod:wry-cobra-318`.

## 16. Production Smoke

Read-only verification on live production (no orders/payments/shipments): mobile
pass above doubles as smoke (9 routes × 4 widths, all 200, zero errors); auth
boundaries unchanged since 28-4 live verification. No deployment → no new smoke
required beyond this.

## 17. Remaining P4

SEO-001…SEO-004 (discoverability only), OPS-005 (61 Shiprocket adapter failures,
pre-existing module-resolution issue, unrelated to all Phase 28 work). Untouched.

## 18. Final Launch Risk Assessment

Known remaining risks, all accepted: schemaValidation off (server-validated writes);
no ops dashboard (orders-page workaround verified); analytics/geocoding open
endpoints (spam/quota class, no data impact); >1500g Mart carts need a slab decision;
SEO absent; Shiprocket tests red (pre-existing). None threatens payment, order
integrity, fulfillment, authorization, financial correctness, or essential operation.

---

## Final Verdict

**PASS — NO P3 LAUNCH BLOCKERS**
