/**
 * Anonymous guests are real Supabase users. Their JWT role is `authenticated`
 * and `auth.uid()` is set, so storage policies that key off the user id apply
 * to them. `is_anonymous` is what separates them from a permanent account.
 *
 * Download and "My sheets" require the claim to be exactly false. A missing
 * claim does not count as signed in. Quota treats only an explicit `true` as
 * a guest, so a token that predates the claim keeps the signed-in limits.
 */

export function isAnonymousUser<T extends { is_anonymous?: boolean }>(
  user: T | null | undefined,
): user is T & { is_anonymous: true } {
  return !!user && user.is_anonymous === true;
}

export function isPermanentUser<T extends { is_anonymous?: boolean }>(
  user: T | null | undefined,
): user is T & { is_anonymous: false } {
  return !!user && user.is_anonymous === false;
}
