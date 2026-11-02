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

Google sign-in sends the visitor back to `/auth/callback` on the host they are using, including a Vercel domain. In Supabase, under Authentication → URL Configuration, add that callback to Redirect URLs, for example `https://<your-domain>/auth/callback`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production server
- `npm run lint` — run ESLint
