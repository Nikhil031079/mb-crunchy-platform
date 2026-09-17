# Phase 27-5 — Error Boundary Hardening

**Date:** 2026-09-17
**Scope:** M-4 only
**Status:** M-4 ERROR BOUNDARY HARDENED — VERIFIED

---

## M-4 Original Finding

The `RootErrorBoundary` in `src/main.tsx:108-143` exposes full JavaScript stack traces, source file paths, and component stack traces to production customers. The label says "Preview runtime error" (a Vly/Freebuff dev tooling artifact). The error boundary was originally designed for a development preview tool and was never adapted for production use.

## Root Cause

The error boundary had no environment-conditional logic. It captured `error.message` and `error.stack` in `getDerivedStateFromError` and rendered both directly to the DOM in all environments.

## Current Error Flow

```
React render error
  → getDerivedStateFromError captures error.message + error.stack
  → componentDidCatch logs to console.error
  → render() checks import.meta.env.DEV:
      DEV:  shows "Development error" + message + stack trace
      PROD: shows "Something went wrong" + generic message
```

## Production Behavior Before

Customer saw:
- Header: "Preview runtime error"
- Error message (may contain internal path/file info)
- Full stack trace in `<pre>` block (file paths, line numbers, component names)

## Production Behavior After

Customer sees:
- Header: "Something went wrong"
- Message: "Please try again. If the problem persists, contact support."
- No stack trace, no error message, no internal details

## Development Behavior

Developers see:
- Header: "Development error"
- Error message (for debugging)
- Full stack trace (for debugging)

## Diagnostic Preservation

- `console.error("[RootErrorBoundary] Uncaught error:", err)` still fires in all environments
- Development mode retains full error display for debugging
- No external monitoring service added (consistent with existing architecture)

## Security Verification

Information no longer exposed in production:

| Before | After |
|--------|-------|
| `error.message` (may contain internal paths) | Not shown |
| `error.stack` (full JS stack trace) | Not shown |
| Source file paths (e.g., `CheckoutPage.tsx:1099`) | Not shown |
| Function names (e.g., `handleSubmit`) | Not shown |
| "Preview runtime error" (dev tooling artifact) | Replaced with "Something went wrong" |

## Tests

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| Vite build | ✅ PASS (3.37s) |
| Test suite | ✅ 142/142 relevant tests passed |
| Pre-existing failures | 61 (unrelated `26f5_shiprocket_adapter_rewrite.test.ts`) |

## Regression Verification

| System | Result |
|--------|--------|
| Checkout | ✅ No changes |
| Payment | ✅ No changes |
| Location | ✅ No changes |
| Mart shipping | ✅ No changes |
| Kitchen serviceability | ✅ No changes |
| Mixed cart | ✅ No changes |
| Shipment | ✅ No changes |
| Shiprocket | ✅ No changes |
| Admin authentication | ✅ No changes |

## Changed Files

| File | Change | Reason |
|------|--------|--------|
| `src/main.tsx` | Environment-conditional error boundary UI | M-4: Remove stack traces from production |

Total: 1 file, 23 insertions, 11 deletions.

Note: `src/pages/customer/CheckoutPage.tsx` also shows in diff but is from Phase 27-4 (uncommitted M-12/M-24 fix).

## Production Safety

| Check | Result |
|-------|--------|
| COURIER_DRY_RUN | ✅ Unchanged |
| Razorpay | ✅ Unchanged (TEST mode) |
| Shiprocket | ✅ No changes |
| Production data mutation | ✅ None |

---

## FINAL VERDICT

M-4 ERROR BOUNDARY HARDENED — VERIFIED
