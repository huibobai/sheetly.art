# Sheetly

A Next.js app for turning photos into sticker sheets.

## Requirements

- Node.js 18.18 or later
- npm

## Run the project

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy on Vercel

Set these environment variables for Production and Preview before the build:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FAL_KEY`

`FAL_KEY` stays on the server. Do not prefix it with `NEXT_PUBLIC_`.

Optional server-only limits (defaults in parentheses):

- `GENERATE_DAILY_LIMIT` (20) — AI styles per signed-in user per rolling 24 hours
- `GENERATE_PER_MINUTE_LIMIT` (3) — AI styles per user per rolling minute
- `GUEST_GENERATE_DAILY_LIMIT` (3) — AI styles per anonymous visitor per rolling 24 hours
- `GUEST_IP_DAILY_LIMIT` (9) — AI styles per IP across anonymous visitors per rolling 24 hours
- `GUEST_IP_PER_MINUTE_LIMIT` (6) — AI styles per IP across anonymous visitors per rolling minute

Checkout is off unless `CHECKOUT_ENABLED` is the exact string `true`. Do not turn it on without approval. These are server-only and are read at request time, not required for the build:

- `CHECKOUT_ENABLED` — `true` shows the price and opens checkout routes. Anything else, including unset, keeps checkout hidden and returns 404 from those routes. Downloads stay free while it is off.
- `PAYMENT_PROVIDER` — `mock` is the only adapter in this repo. It runs a local test checkout and does not take payment.
- `CHECKOUT_MOCK_SECRET` — optional signer for the mock webhook. A built-in test fixture is used when this is unset.
- `CHECKOUT_FROM_EMAIL` — From address for order mail, once that mailbox exists.
- `RESEND_API_KEY` — order mail is only sent when checkout is on and this key is set. Otherwise the send is logged and skipped.
- `SUPABASE_SERVICE_ROLE_KEY` — not in this repo. A provider webhook with no user session needs it to update order status. The local mock purchase can record a mock order without it, after the orders migration is applied. Do not add the key until checkout is approved.

The orders table is `supabase/migrations/20261112120000_orders.sql`. It is not applied from this repo.

Guest sign-in also needs settings on the Supabase project. See `docs/supabase-staging-auth-setup.md`. Those settings are not applied from this repo.

Google sign-in sends the visitor back to `/auth/callback` on the host they are using, including a Vercel domain. In Supabase, under Authentication → URL Configuration, add that callback to Redirect URLs, for example `https://<your-domain>/auth/callback`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production server
- `npm run lint` — run ESLint
