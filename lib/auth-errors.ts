/**
 * Friendly messages for Supabase Auth errors. The raw provider text stays on
 * the server or in the console of the browser that received it; the UI shows these.
 */

export type AuthFailure = {
  message?: string;
  code?: string;
  status?: number;
};

function blob(error: AuthFailure): string {
  return `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
}

export function emailBelongsToAnotherAccount(error: AuthFailure): boolean {
  const code = (error.code ?? "").toLowerCase();
  const text = blob(error);
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    text.includes("already been registered") ||
    text.includes("already registered") ||
    text.includes("email address has already") ||
    text.includes("already exists")
  );
}

export type GoogleLinkFallback = "linking-off" | "google-taken";

export function classifyGoogleLinkError(error: AuthFailure): GoogleLinkFallback | null {
  const code = (error.code ?? "").toLowerCase();
  const text = blob(error);
  if (code.includes("manual_linking") || text.includes("manual linking")) {
    return "linking-off";
  }
  if (
    code.includes("identity_already") ||
    text.includes("already linked") ||
    text.includes("identity is already") ||
    (text.includes("already") && text.includes("identity"))
  ) {
    return "google-taken";
  }
  return null;
}

export function googleFallbackMessage(fallback: GoogleLinkFallback | null): string {
  if (fallback === "linking-off") {
    return "Google linking isn't turned on yet. You can still sign in with Google, and we'll move these photos to that account.";
  }
  if (fallback === "google-taken") {
    return "That Google account already has a Sheetly account. Sign in with it and we'll move these photos over.";
  }
  return "Could not start Google sign-in. Try again.";
}

export function mapAuthError(error: AuthFailure): string {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  if (
    error.status === 429 ||
    code.includes("rate") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("only request this after")
  ) {
    return "That's a lot of emails just now. Wait a minute, then try again.";
  }
  if (message.includes("redirect")) {
    return "Add this site's /auth/callback address to the Supabase redirect URLs, then try again.";
  }
  const expired = message.includes("expired") || code === "otp_expired";
  const invalid = message.includes("invalid") || code.includes("otp") || code === "validation_failed";
  if (expired && invalid) {
    return "That code is wrong or has expired. Check the email, or send a new one.";
  }
  if (expired) {
    return "That code has expired. Send a new one.";
  }
  if (invalid && (message.includes("token") || message.includes("otp") || message.includes("code") || code.includes("otp"))) {
    return "That code doesn't match. Check the email and try again.";
  }
  return "We couldn't finish that step. Try again.";
}

export function mapAnonymousSignInError(error: AuthFailure): string {
  const text = blob(error);
  if (error.status === 429 || text.includes("rate")) {
    return "Too many new visitors from this network just now. Wait a bit, then try again.";
  }
  return "We couldn't start a private session for this photo. Check your connection and try again.";
}
