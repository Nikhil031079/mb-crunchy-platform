# Phase 28-5 — P3 Triage (before any implementation)

**Date**: 2026-09-18
**Baseline**: commit `1a59dc6` (docs) / code `6b0983d`, 232 tests pass, tsc+build PASS.

## Source P3s

9 original from 28-0 §25 + 3 from 28-3c/28-4 cycle (F-07, F-08, F-11) + 5 minors
from 28-3 (F-01…F-05; F-06 was a positive note, not a finding).

## Classification

| ID | Finding | Evidence of current state | Class | Rationale |
|----|---------|---------------------------|-------|-----------|
| SEC-014 | `markHelpful` replay inflates count | `reviews.ts:275` authed increment, no voter record | C | Cosmetic ranking distortion only. Proper fix needs a voter table = schema change; disproportionate for launch. No purchase/payment/order impact. |
| SEC-015 | `trackEvent` flooding / `v.any()` metadata | Never invoked from frontend (26f9); per-IP limits not expressible in a mutation without new infra | C | Worst case analytics-table spam. No customer/admin/payment impact. |
| SEC-016 | Unauthenticated geocoding quota burn | `convex/geocode.ts` is PROTECTED architecture; anonymous location must work pre-login so auth can't simply be added | C | Cost/quota concern, not correctness; PIN+GPS+manual fallbacks verified working in 28-3. Touching the protected file for this is out of scope. |
| SEC-019 | `console.error` in production | Present in instrumentation/razorpay/webhook; aids debugging, zero user impact | C | Removing logs from payment files for cosmetics adds risk, removes signal. |
| SEC-020 | `as any` casts | Present in webhook/checkout/orders; tsc passes; all covered paths UAT-verified | C | Re-typing payment/checkout code pre-launch risks regression for zero behavior gain. |
| PERF-001 | 485KB bundle | Loads fine in UAT (all pages <networkidle OK); splitting = broad refactor (explicitly out of scope) | C | No measured user harm. |
| PERF-002 | Sync Razorpay `<script>` in head | Payment-critical script; async/defer risks checkout timing at the worst moment | C | Risk/benefit strongly against touching. |
| PERF-003 | Empty-chunk warning | Build cosmetic only; build passes | C | — |
| OPS-001 | No ops dashboard | Workaround verified: admin Orders has status/payment filters + stat cards + per-order timeline; cron auto-cancels + notifies; failed payments filterable by payment status | C | New dashboard = new feature (out of scope). Adequate for initial (low) order volume; revisit post-launch. |
| F-07 | Kitchen logged-out hang | FIXED 28-4, verified live on `17c90420` | D | — |
| F-08 | No global admin logout | FIXED 28-4, verified live (menu item + redirect) | D | — |
| F-11 | Post-logout hang | FIXED 28-4, verified live | D | — |
| F-01 | No Mart slab above 1500g | Clean server error, recoverable (reduce qty); changing slabs = pricing decision for owner | C | Owner decision, not engineering. |
| F-02 | Checkout pincode not inherited | Minor re-typing friction; server still authoritative; touches protected checkout flow | C | — |
| F-03 | Generic ETA when unserviceable | Cosmetic text; correct gate at checkout | C | — |
| F-04 | Razorpay third-party prefetch fail | Originates in Razorpay's own script; zero observed impact | C | Re-verify during first safe test-mode payment. |
| F-05 | Dormant `enableCheckout` / radius display | Flag unread; zone radius governs correctly | C | Config hygiene post-launch. |

## Promotion check

None meets the bar (purchase / payment / order integrity / fulfillment / customer
data / authorization / essential owner operation). The only authorization-adjacent
items (SEC-014/015/016) are abuse-of-convenience issues with no data boundary
crossed: markHelpful requires auth, trackEvent writes analytics only, geocoding
returns public geo data. **Promoted blockers: 0.**

## Decision

**No A, no B. No code changes. No deployment.** Remaining work for this phase:
mobile re-verification on current bundle, security-regression re-check, test-suite
confirmation, final report.
