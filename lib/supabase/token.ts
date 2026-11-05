import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** A compact check before we ask Auth to verify the signature. Not a decode. */
export function looksLikeJwt(value: string): boolean {
  return value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/** Asks Supabase Auth whether this access token is real. Does not trust the payload locally. */
export async function userFromAccessToken(accessToken: string): Promise<User | null> {
  const client = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}
