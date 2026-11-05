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

Guest sign-in also needs settings on the Supabase project. See `docs/supabase-staging-auth-setup.md`. Those settings are not applied from this repo.

Google sign-in sends the visitor back to `/auth/callback` on the host they are using, including a Vercel domain. In Supabase, under Authentication → URL Configuration, add that callback to Redirect URLs, for example `https://<your-domain>/auth/callback`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production server
- `npm run lint` — run ESLint
