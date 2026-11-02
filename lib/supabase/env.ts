/**
 * Set these in the Vercel project for Production and Preview, before the build:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - FAL_KEY (server only, read in app/api/generate/route.ts)
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
