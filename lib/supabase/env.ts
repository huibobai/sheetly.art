/**
 * Set these in the Vercel project for Production and Preview, before the build:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - FAL_KEY (server only, read in app/api/generate/route.ts)
 * Optional, server only (see lib/generation-quota.ts):
 * - GENERATE_DAILY_LIMIT (AI styles per user per rolling 24 h, default 20)
 * - GENERATE_PER_MINUTE_LIMIT (AI styles per user per rolling minute, default 3)
 */

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL.");
  }
  return url;
}

export function supabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return key;
}
