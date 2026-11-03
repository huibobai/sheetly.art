# Staging Supabase settings for the guest flow

Nothing in this file has been applied. The agent environment cannot change the Supabase dashboard, and no project setting, email template, or redirect URL was edited. Huibo (or whoever owns the staging project) does these steps by hand, on **staging first**.

The app code only reads environment variable **names**. It does not contain keys.

## What the code cannot do

These all live in the Supabase dashboard (Authentication). They are not in this repo and cannot be set from a migration:

- Enable anonymous sign-ins
- Enable manual linking (needed for `linkIdentity({ provider: 'google' })`)
- Email OTP length and expiry
- The text of the auth emails
- Site URL and redirect URLs
- Auth rate limits
- CAPTCHA

Run the new SQL file on staging **before** deploying this branch, or AI styles will fail closed until the function exists:

`supabase/migrations/20261103143000_guest_and_ip_quota.sql`

That file was written only. It was not executed.

## 1. Anonymous sign-ins

Authentication → Providers (or Sign In / Providers) → **Anonymous sign-ins**: turn this **on**.

`signInAnonymously()` then creates a real user. In Postgres that user is `authenticated`, `auth.uid()` is set, and the JWT claim `is_anonymous` is `true`. Guest photos go to the private bucket at `uploads_private/{that uid}/...`.

Supabase already rate-limits anonymous sign-ins **per IP** (the platform default is 30 requests per hour; the number is on Authentication → Rate Limits). That is the main brake on someone calling `signInAnonymously()` in a loop. This app does **not** add CAPTCHA. If staging is being abused, turn on CAPTCHA there (Authentication → Bot and Abuse Protection, or Attack Protection → CAPTCHA). Leave it off until you want it. The app does not send a CAPTCHA token.

## 2. Manual linking

Authentication → Sign In / Providers → **Manual linking**: turn this **on**.

Google sign-in from a guest session calls `linkIdentity({ provider: 'google' })`. That keeps the same user id, so the photos do not need to be copied. If manual linking is off, or that Google account already belongs to someone else, the app signs in to the existing account and copies the guest's files with the two users' own tokens. There is no service-role key in this repo.

## 3. Email OTP

Authentication → Providers → Email:

- OTP length: **6**
- OTP expiry: pick a short window, for example **3600** seconds (1 hour). Supabase does not allow more than 86400 seconds.
- Prefer to leave **Secure email change** off on staging. An anonymous user has no old address. If secure email change is on, Supabase may also ask the old address to confirm, and the guest cannot finish adding an email.

The in-app code uses a 6-digit code in the same dialog (`verifyOtp`). It does not open a new tab for email.

## 4. Email templates

Authentication → Emails (or Email Templates).

Put `{{ .Token }}` in each template below. Do **not** rely on `{{ .ConfirmationURL }}` alone. A link can be prefetched by the mail provider and then the code is already used. These templates show the code and skip the magic link on purpose, so the person stays on the sheet and types the code.

`{{ .Email }}` is empty when an anonymous user adds an address. The Change Email template should use `{{ .NewEmail }}`.

### Magic Link

Used when `signInWithOtp` signs in an email that already has an account.

Subject: `Your Sheetly code`

```html
<h2>Your Sheetly code</h2>
<p>Enter this code on the sheet page. It expires soon and works once.</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>If you didn't ask for this, you can ignore the email.</p>
```

Text version:

```text
Your Sheetly code is {{ .Token }}

Enter it on the sheet page. It expires soon and works once.
If you didn't ask for this, you can ignore the email.
```

### Confirm signup

Used when `signInWithOtp` creates a new email account.

Subject: `Confirm your Sheetly email`

```html
<h2>Confirm your email</h2>
<p>Enter this code on the sheet page to finish creating your Sheetly account.</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>If you didn't ask for this, you can ignore the email.</p>
```

Text version:

```text
Your Sheetly code is {{ .Token }}

Enter it on the sheet page to finish creating your account.
If you didn't ask for this, you can ignore the email.
```

### Change email address

This is the message Supabase sends when an anonymous session calls `updateUser({ email })`. The app then calls `verifyOtp({ email, token, type: 'email_change' })`, which keeps the same user id.

Subject: `Your Sheetly code`

```html
<h2>Confirm this email for Sheetly</h2>
<p>Enter this code on the sheet page to keep your photos on {{ .NewEmail }}.</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>If you didn't ask for this, you can ignore the email.</p>
```

Text version:

```text
Your Sheetly code is {{ .Token }}

Enter it on the sheet page to keep your photos on {{ .NewEmail }}.
If you didn't ask for this, you can ignore the email.
```

## 5. Site URL and redirect URLs

Authentication → URL Configuration.

- Site URL: the staging origin, for example `https://staging.sheetly.art`
- Redirect URLs, each ending in `/auth/callback`:
  - `http://localhost:3000/auth/callback`
  - the staging origin's `/auth/callback`
  - the Vercel preview pattern you actually use, for example `https://*-<team>.vercel.app/auth/callback`

Google sign-in returns to `/auth/callback` on the same host. Add the real preview host if wildcards are not accepted. The code does not register these URLs.

## 6. Rate limits to review

Authentication → Rate Limits. Do not turn them off. Worth a look on staging:

- Anonymous sign-ins (per IP; platform default is often 30 per hour)
- Emails sent (magic link / OTP)
- Token verifications (wrong-code attempts)

The app adds its own guest AI caps on top of these. They do not replace them.

## 7. Environment variables

Set these on the Vercel project for Preview (and later Production), **names only** here:

| Name | Default | Who |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | none, required | browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | none, required | browser and server |
| `FAL_KEY` | none, required for AI styles | server only |
| `GENERATE_DAILY_LIMIT` | 20 | server only, signed-in users |
| `GENERATE_PER_MINUTE_LIMIT` | 3 | server only, every user |
| `GUEST_GENERATE_DAILY_LIMIT` | 3 | server only, anonymous visitors |
| `GUEST_IP_DAILY_LIMIT` | 9 | server only, anonymous visitors on one IP |
| `GUEST_IP_PER_MINUTE_LIMIT` | 6 | server only, anonymous visitors on one IP |

No new secret was added. Do not create a service-role variable for this flow. Guest photo moves use the anonymous token and the new account's token, each limited by the existing storage and row policies.

Signed-in daily and per-minute defaults are unchanged.

## 8. IP header assumption

Guest IP caps read `x-forwarded-for` (first hop) and then `x-real-ip`. That matches Vercel, which sets those headers itself. If the app is reached without that proxy, the header can be spoofed. In production a missing IP refuses the guest AI call. Local dev uses `127.0.0.1` so one shared bucket still applies.
