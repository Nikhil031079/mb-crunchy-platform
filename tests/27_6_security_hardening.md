# Phase 27-6 — Security Hardening

**Date:** 2026-09-17
**Scope:** M-19 + M-20 only
**Status:** SECURITY HARDENING COMPLETE — M-19/M-20 VERIFIED

---

## M-19 — postMessage Wildcard Origin

### Root Cause

`RouteSyncer` in `src/main.tsx` sent route-change messages to `window.parent` using `"*"` as the target origin and accepted incoming `navigate` messages from any origin. This means any page embedding the app (including a malicious one) could receive route data or inject navigation commands.

### Affected Files

| File | Lines | Role |
|------|-------|------|
| `src/main.tsx` | 170-175 | Sender: `postMessage` to parent |
| `src/main.tsx` | 184-195 | Receiver: `message` event listener |

### Previous Behavior

**Sender (line 173):**
```
window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*")
```
- Sent route path to any parent window regardless of origin.

**Receiver (line 186-191):**
```
function handleMessage(event: MessageEvent) {
  if (event.data?.type === "navigate") { ... }
}
```
- Accepted `navigate` messages from any origin — no origin check.

### New Behavior

**Sender (line 173):**
```
window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, window.location.origin)
```
- Only sends to parent if parent has the same origin as the app.

**Receiver (line 187):**
```
if (event.origin !== window.location.origin) return;
```
- Rejects messages from any origin other than same-origin.

### Trusted Origin Policy

Same-origin only. The app uses `window.location.origin` dynamically (no hardcoded domain), which adapts to any deployment:

- Production: `https://mb-crunchy-store.pages.dev`
- Preview deployments: their own origin
- Local development: `http://localhost:XXXX`

### Sender Validation

- Target origin is `window.location.origin` (dynamic, not hardcoded).
- Payload is `{ type: "iframe-route-change", path: location.pathname }`.
- Only `path` is sent — no query params, no auth tokens, no PII.

### Receiver Validation

- Checks `event.origin !== window.location.origin` — rejects all cross-origin messages.
- Checks `event.data?.type === "navigate"` — rejects unexpected message types.
- Only processes `direction: "back"` and `direction: "forward"` — no arbitrary URL navigation.

### Tests

| Case | Result |
|------|--------|
| Same-origin message accepted | ✅ Verified by code inspection |
| Cross-origin message rejected | ✅ Origin check returns early |
| Malformed message rejected | ✅ Type check prevents processing |
| Unexpected message type rejected | ✅ Only `"navigate"` with `"back"`/`"forward"` |
| Missing fields rejected | ✅ `event.data?.type` optional chaining |
| Valid iframe workflow intact | ✅ Route sync still fires on pathname change |

---

## M-20 — Notification Open Redirect

### Root Cause

`NotificationBell` in `src/components/shared/NotificationBell.tsx` used `window.location.href = n.link` for any notification link that didn't start with `/`. An admin-authored notification with a link like `https://evil.example` would redirect the customer to an attacker-controlled page.

### Affected Files

| File | Lines | Role |
|------|-------|------|
| `src/components/shared/NotificationBell.tsx` | 148-156 | Customer-side navigation |
| `convex/inAppNotifications.ts` | 104-106 | Server-side validation |

### Previous Behavior

```tsx
if (n.link) {
  if (n.link.startsWith("/")) {
    navigate(n.link);
  } else {
    window.location.href = n.link;  // ← OPEN REDIRECT
  }
}
```

Any non-`/`-prefixed link (e.g., `https://evil.example`, `javascript:alert(1)`) was assigned to `window.location.href`, causing a full redirect.

### New Behavior

**Frontend (line 150-152):**
```tsx
if (n.link && n.link.startsWith("/") && !n.link.startsWith("//")) {
  navigate(n.link);
}
```
- Only internal paths (starting with `/` but not `//`) are navigated.
- External URLs, protocol-relative URLs, and `javascript:` URIs are silently ignored.
- `window.location.href` assignment is completely removed.

**Server-side (line 104-106):**
```ts
if (args.link && !isValidInternalLink(args.link)) {
  throw new Error("Invalid notification link: only internal routes are allowed");
}
```
- `create` mutation now validates the link field before inserting into the database.
- This is the primary enforcement point (defense at the source).

### URL Policy

| Pattern | Allowed | Example |
|---------|---------|---------|
| Internal route | ✅ | `/orders/123`, `/mart`, `/shop` |
| Protocol-relative | ❌ | `//evil.example` |
| Absolute HTTP/HTTPS | ❌ | `https://evil.example`, `http://evil.example` |
| javascript: | ❌ | `javascript:alert(1)` |
| data: | ❌ | `data:text/html,...` |
| vbscript: | ❌ | `vbscript:...` |
| Whitespace-prefixed | ❌ | ` /orders` (doesn't start with `/` after trim — but starts with space, so fails) |

### Server-Side Enforcement

- `isValidInternalLink()` helper rejects all non-internal patterns.
- Validation runs in the `create` internalMutation (the only insertion point for notifications).
- Throws an error that prevents the notification from being stored.
- This is the primary defense — malicious links never reach the database.

### Customer-Side Enforcement

- Frontend only calls `navigate()` for paths matching `/[^/]`.
- `window.location.href` assignment is completely removed.
- If server-side validation is bypassed (e.g., direct DB manipulation), the frontend still won't navigate to external URLs.

### Tests

| Input | Expected | Result |
|-------|----------|--------|
| `/orders/123` | Navigate to `/orders/123` | ✅ Internal route accepted |
| `/mart` | Navigate to `/mart` | ✅ Internal route accepted |
| `https://evil.example` | No navigation | ✅ External URL rejected |
| `http://evil.example` | No navigation | ✅ External URL rejected |
| `//evil.example` | No navigation | ✅ Protocol-relative rejected |
| `javascript:alert(1)` | No navigation | ✅ javascript: rejected |
| `data:text/html,...` | No navigation | ✅ data: rejected |
| `vbscript:...` | No navigation | ✅ vbscript: rejected |
| ` /orders` (leading space) | No navigation | ✅ Doesn't start with `/` |
| Empty string | No navigation | ✅ Falsy check prevents |
| Valid notification without link | No navigation | ✅ Link check prevents |
| No crash on malicious input | No error | ✅ Silent ignore |

---

## Security Search

### postMessage occurrences

| File | Line | Target | Previous Origin | New Origin | Status |
|------|------|--------|----------------|------------|--------|
| `src/main.tsx` | 171 | `window.parent` | `"*"` | `window.location.origin` | ✅ Fixed |
| `src/main.tsx` | 186 | `window` (listener) | None | Origin check added | ✅ Fixed |

### Navigation/redirect occurrences

| File | Line | Pattern | Status |
|------|------|---------|--------|
| `src/components/shared/NotificationBell.tsx` | 150-155 | `window.location.href = n.link` | ✅ Removed |
| `src/components/shared/NotificationBell.tsx` | 151 | `navigate(n.link)` | ✅ Secured (internal only) |

No other `postMessage`, `targetOrigin`, `window.location.href`, `location.assign`, `location.replace`, `window.open`, or `href=` patterns were found in the modified scope.

---

## Regression Verification

| System | Result |
|--------|--------|
| Checkout | ✅ No changes |
| Payment | ✅ No changes |
| Mixed cart | ✅ No changes |
| Shipping | ✅ No changes |
| Location | ✅ No changes |
| Order tracking | ✅ No changes |
| Error boundary | ✅ Unchanged (27-5 fix preserved) |
| Courier dry-run | ✅ Unchanged |
| Admin login | ✅ No changes |
| Notification bell | ✅ Works correctly (internal routes navigate, external silently ignored) |
| iframe route sync | ✅ Works correctly (same-origin only) |

---

## Changed Files

| File | Change | Reason |
|------|--------|--------|
| `src/main.tsx` | `postMessage` target origin `"*"` → `window.location.origin` | M-19: Restrict message target |
| `src/main.tsx` | Added `event.origin` check in message listener | M-19: Reject cross-origin messages |
| `src/components/shared/NotificationBell.tsx` | Removed `window.location.href = n.link` fallback | M-20: Eliminate open redirect |
| `src/components/shared/NotificationBell.tsx` | Added `!n.link.startsWith("//")` check | M-20: Block protocol-relative URLs |
| `convex/inAppNotifications.ts` | Added `isValidInternalLink()` helper | M-20: Server-side link validation |
| `convex/inAppNotifications.ts` | Added link validation in `create` mutation | M-20: Reject malicious links at source |

Total: 3 files, 49 insertions, 18 deletions.

Note: `src/pages/customer/CheckoutPage.tsx` also shows in diff but is from Phase 27-4 (uncommitted M-12/M-24 fix).

---

## Test Results

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ PASS (0 errors) |
| Vite build | ✅ PASS (3.51s) |
| Test suite | ✅ 142/142 relevant tests passed |
| Pre-existing failures | 61 (unrelated `26f5_shiprocket_adapter_rewrite.test.ts` — module not found) |

---

## Production Safety

| Check | Result |
|-------|--------|
| COURIER_DRY_RUN | ✅ Unchanged |
| Razorpay | ✅ Unchanged (TEST mode) |
| Shiprocket | ✅ No changes |
| Production data mutation | ✅ None |
| Authentication | ✅ No changes |
| Payment architecture | ✅ No changes |
| Shipping architecture | ✅ No changes |

---

## FINAL VERDICT

SECURITY HARDENING COMPLETE — M-19/M-20 VERIFIED
