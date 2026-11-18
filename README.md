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

## Pre-launch

The site is in pre-launch mode until launch day. People can still make a sticker sheet, sign in, and download it. Search engines are asked not to index the site. There is no way to pay or order a printed sheet.

Leave `NEXT_PUBLIC_PRELAUNCH_MODE` unset. Unset means on. `PRELAUNCH_MODE` is a server-only fallback used only when the public variable is unset or blank.

Accepted off values are `false`, `0`, `off`, and `no`. Any other value leaves pre-launch on, so a typo cannot open the site to indexing or orders.

Launch day is one switch:

1. Set `NEXT_PUBLIC_PRELAUNCH_MODE` to `false`.
2. Redeploy. The public value is read when the site is built, so saving it in the dashboard is not enough on its own.

Optional:

- `NEXT_PUBLIC_SITE_URL` — origin written into `sitemap.xml` (default `https://sheetly.art`). A server-only `SITE_URL` is used when the public variable is blank. While pre-launch is on, `robots.txt` does not point at the sitemap.
- `WAITLIST_IP_PER_MINUTE_LIMIT` (6) and `WAITLIST_IP_DAILY_LIMIT` (9) — waitlist attempts per IP, same idea as the guest IP caps

The homepage and `/waitlist` post to `/api/waitlist`. Rows go in `public.waitlist` (email, created_at, source, consent). The route does not send email. Apply `supabase/migrations/20261112090000_create_waitlist.sql` on staging first. Production only with Huibo's OK. Until that file has been run, the form answers that the waitlist is not ready yet.

No checkout exists yet. `assertNotPrelaunch()` in `lib/launch.ts` is the guard to call at the start of a future order route. While pre-launch is on, `/order`, `/checkout`, and those paths under `/api` respond with “Opening soon”.

Guest sign-in also needs settings on the Supabase project. See `docs/supabase-staging-auth-setup.md`. Those settings are not applied from this repo.

Google sign-in sends the visitor back to `/auth/callback` on the host they are using, including a Vercel domain. In Supabase, under Authentication → URL Configuration, add that callback to Redirect URLs, for example `https://<your-domain>/auth/callback`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production server
- `npm run lint` — run ESLint
