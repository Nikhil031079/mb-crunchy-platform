# Phase 28-3b — Admin / Staff UAT Supplement

**Date**: 2026-09-18
**Parent audit**: `tests/28_3_e2e_uat_audit.md` (§§8, 9, 12, 16)
**Production**: `https://mb-crunchy-store.pages.dev` + `prod:wry-cobra-318`

---

## 1. Objective

Complete the NOT TESTABLE admin/staff/owner sections of 28-3 using owner-provided
credentials, strictly read-only (no orders, no status changes, no data modifications).

## 2. Credentials Supplied

Owner supplied `username: admin` / `password: MBcrunchy0328` with read-only intent.
Password value is NOT recorded in any file, script, or commit (passed via process
environment only; no session file was created; harness deleted after use).

## 3. Attempts (2 total — then STOPPED to protect the account)

| # | Method | Result |
|---|--------|--------|
| 1 | Headless Chrome, `/admin/login`, fill + submit | **"Invalid username or password."** (server response, URL stays `/admin/login`) |
| 2 | Retry by element ID (`#username`, `#password`), values verified pre-submit (`admin` 5 chars exact, password 13 chars) | **"Invalid username or password."** again |

Pre-checks confirming the failure is credential-side, not app-side:

- Login form renders correctly (2 inputs, Sign In button, forgot-password link).
- `adminAuth:hasAdmins` (public, read-only) returns `true` — a production admin exists.
- No console/page/HTTP errors during login; the rejection is a clean server `login` result.
- Account is NOT locked (no "temporarily locked" message) and NOT disabled (disabled
  accounts get a distinct "This account has been disabled." message) — so either the
  username is not `admin`, or the password differs.
- Stopped at 2/5 attempts: the DB-persisted brute-force guard (28-1) locks after 5.

## 4. Not Tested (unchanged from 28-3 §16)

Admin login session, dashboard, order view/filter/details/status, catalog/offer/
meal-deal/config management, customer visibility, logout/re-login/expiry, kitchen
staff cross-store denial, and owner order processing — all still require a working
session. No guessing was performed (guessing risks locking the real owner account).

## 5. What Owner Should Do (pick one)

1. Verify the exact admin username (case-sensitive `by_username` lookup) and re-issue.
2. Or confirm the password (13 chars received; verify no транслит/whitespace issues).
3. Or create a dedicated read-only UAT staff account and share those credentials.
4. Or run the 28-3 §§8/9/12 checklist interactively and report results.

On receipt, this supplement will be re-executed (read-only) and §§8/9/12 closed.

## 6. Data Integrity

Zero production mutations: only page loads, two `login` mutations (expected,
failed-clean), and read-only public queries. No lockout triggered. Harness
(`.uat-tmp/`, incl. `node_modules`) deleted; nothing credential-bearing committed.

---

## Verdict

**ADMIN/STFF UAT STILL BLOCKED — VALID CREDENTIALS REQUIRED.** Customer-side 28-3
verdict is unaffected.
