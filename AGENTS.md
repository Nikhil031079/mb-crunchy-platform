# MB Crunchy - AI Development Guide

## Project Overview

MB Crunchy is a multi-business commerce platform.

Business Units:
- MB Kitchen
- MB Mart

Technology:
- React
- TypeScript
- Vite
- Convex
- Tailwind CSS
- React Router
- Shadcn UI

---

## Development Principles

- Build production-quality code.
- Prefer reusable components.
- Keep components modular.
- Avoid duplicate logic.
- Maintain strict TypeScript.
- Never use `any` unless absolutely unavoidable.
- Follow existing project architecture.

---

## Backend Rules

- Do not modify the Convex schema unless the task requires it. Schema changes
  must be additive (optional fields first) and the plan must say so.
- Do not rename existing Convex functions.
- Preserve backwards compatibility.
- Use soft deletes where already established.

---

## Frontend Rules

- Mobile-first.
- Responsive.
- Accessible.
- Premium UI.
- Use Lucide icons.
- Use existing design system.
- Avoid unnecessary dependencies.

---

## Before Changing Code

Always:

1. Analyze existing implementation.
2. Explain the proposed approach.
3. Implement.
4. Self-review.
5. Verify the project builds successfully.

---

## Money, Payment and Webhook Rules (non-negotiable)

- Amounts are integers in the smallest unit (paise). Never use floats for money.
- The amount charged is always derived on the server from the stored order.
  Never trust an amount sent by the client.
- Payment is confirmed only by a signature-verified Razorpay call or webhook,
  never by a client redirect or a client-side "success" flag.
- Webhook handlers must verify the signature (timing-safe compare), be
  idempotent (replay-safe via `webhookEvents`), and never log secrets.
- Any change to pricing, tax, stock, payment, refund or webhook code needs a
  behavioral test that fails before the change and passes after.

## Security and Secrets

- Never print, log, commit or paste secrets (`.env*`, API keys, webhook
  secrets). Only `.env.example` is tracked, and it holds names, not values.
- Do not add a fallback for a missing secret; fail loudly instead.
- Validate all inputs in Convex functions with validators; check the caller's
  role server-side. Hiding something in the UI is not access control.

## Business Rules

- Kitchen (MB Kitchen) is local delivery only (zone / radius check).
  Mart (MB Mart) ships pan-India via courier. A cart must never silently mix
  the two; split it or block it.
- "Kitchen closed" must be enforced on the server when an order is created.
- Product labels shown to customers need FSSAI number, veg/non-veg mark,
  ingredients, allergens, net weight and shelf life. "Organic" may only be
  shown for products with a stored certificate number.
- A GST invoice needs: seller GSTIN, sequential invoice number, HSN, CGST+SGST
  (same state) or IGST (other state) per line. A plain receipt is not a GST
  invoice.

## Safety Rules for Agents

- One small task per prompt. If it touches more than ~5 files, propose a plan
  and wait for approval.
- Never run destructive commands (`rm -rf`, `git reset --hard`, force push,
  deleting Convex data, `convex deploy` to production) without asking first.
- Do not add dependencies without saying why.
- Do not change code outside the task's scope; report unrelated problems.
- Read the current official docs for Razorpay, Shiprocket and Convex before
  changing integrations; do not rely on memory.
- Do not add anything new that depends on the Vly platform
  (`@vly-ai/*`, `VLY_*`); it is being removed.

---

## Definition of Done

`npx tsc -b` passes, `npx vite build` passes, relevant tests pass, and the
task summary lists the manual steps to verify.

---

## Deployment History

| Date | Commit | Frontend | Cloudflare | Notes |
|------|--------|----------|------------|-------|
| 2026-08-31 | `fb5d19a` | `fb5d19ae` | `d97925f3` | Phase 25C: Kitchen delivery serviceability (Haversine origin-radius check) |
| 2026-09-01 | `81ef7c8` | — | — | Phase 25C-UI: Align checkout Delivery Area RadioGroup with Kitchen serviceability (pending deploy) |
| 2026-09-21 | `90ee7a9` | `90ee7a9` | `convex deploy` | Phases 34-45: Customer identity, auth/OTP, cart/catalog, courier integration, accessibility polish |