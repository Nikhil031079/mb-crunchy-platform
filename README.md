# MB Crunchy Platform

Commerce platform for two business units on one site:

- **MB Kitchen**: prepared / frozen food, local delivery only (zone and radius check).
- **MB Mart**: organic grocery, pan-India delivery by courier (Shiprocket).

## Stack

React 19, TypeScript, Vite, React Router 7, Tailwind CSS 4, shadcn/ui,
Convex (database, server functions, crons, HTTP webhooks), Razorpay,
Shiprocket. Package manager: **bun**.

## Layout

| Path | What lives there |
|---|---|
| `src/pages/customer`, `src/pages/admin`, `src/pages/kitchen` | Route pages |
| `src/components`, `src/hooks`, `src/utils` | UI and client logic |
| `convex/` | Schema, queries/mutations, auth, Razorpay, courier, crons, HTTP routes |
| `tests/` | Audit notes and script-style checks (see Testing) |
| `public/` | Static assets |

## Run locally

```bash
bun install
cp .env.example .env.local        # fill in VITE_CONVEX_URL etc.
npx convex dev                    # terminal 1: backend
bun run dev                       # terminal 2: frontend
```

Backend secrets are set in Convex, not in `.env.local`:

```bash
npx convex env set SESSION_SECRET "<long-random-value>"
npx convex env set RAZORPAY_KEY_SECRET "<value>"
```

See `.env.example` for every variable. `SESSION_SECRET` is required; the
backend refuses to start without it.

## Commands

```bash
npx tsc -b          # type-check
bun run build       # production build
bun run lint
```

## Testing

```bash
bun run test          # behavioral unit tests (tests/unit) - must stay green
bun run test:legacy   # older suites in tests/ (many assert on source text)
```

`tests/unit` holds real behavioral tests (GST/FSSAI validation, WhatsApp OTP
request). Money, tax, stock and webhook logic should get tests there. The
legacy suites still pass but are weaker evidence; replace them over time.

## Payments and shipping (summary)

- Razorpay: order amount is computed server-side; payment is verified by
  signature on the server and by a signed, replay-protected webhook.
- A cron cancels unpaid orders after `RESERVATION_TIMEOUT_MINUTES`, checking
  Razorpay first, and releases reserved stock.
- Shiprocket: booking, AWB assignment and tracking webhook. Set
  `COURIER_DRY_RUN=true` to avoid creating real shipments while testing.

## Contributing / AI agents

Read `AGENTS.md` first. It lists the rules for money, secrets, webhooks and
destructive commands.
