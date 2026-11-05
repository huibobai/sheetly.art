"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  classifyGoogleLinkError,
  emailBelongsToAnotherAccount,
  googleFallbackMessage,
  mapAnonymousSignInError,
  mapAuthError,
  type GoogleLinkFallback,
} from "@/lib/auth-errors";
import type { OtpMode } from "@/lib/sign-in-flow";
import { createClient } from "@/lib/supabase/client";

type SessionResult = { ok: true } | { ok: false; message: string };

type GoogleResult =
  | { ok: true }
  | { ok: false; fallback: GoogleLinkFallback | null; message: string };

type EmailCodeResult =
  | { ok: true; mode: OtpMode }
  | { ok: false; message: string };

type VerifyResult =
  | { ok: true; fromId: string | null; toId: string | null; note: string | null }
  | { ok: false; message: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  ensureAnonymousSession: () => Promise<SessionResult>;
  startGoogle: (mode: "link" | "sign-in") => Promise<GoogleResult>;
  sendEmailCode: (email: string) => Promise<EmailCodeResult>;
  verifyEmailCode: (email: string, token: string, mode: OtpMode) => Promise<VerifyResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const anonInflight = useRef<Promise<SessionResult> | null>(null);

  function supabase() {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }

  useEffect(() => {
    let active = true;
    const client = supabase();

    client.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }
      setUser(data.user);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function ensureAnonymousSession() {
    if (anonInflight.current) {
      return anonInflight.current;
    }
    const pending = (async (): Promise<SessionResult> => {
      const { data } = await supabase().auth.getSession();
      if (data.session?.user) {
        return { ok: true };
      }
      const { error } = await supabase().auth.signInAnonymously();
      if (error) {
        return { ok: false, message: mapAnonymousSignInError(error) };
      }
      return { ok: true };
    })();
    anonInflight.current = pending;
    void pending.finally(() => {
      if (anonInflight.current === pending) {
        anonInflight.current = null;
      }
    });
    return pending;
  }

  async function handoffGuestSession() {
    const { data } = await supabase().auth.getSession();
    if (data.session?.user.is_anonymous !== true) {
      return;
    }
    await fetch("/api/guest-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestAccessToken: data.session.access_token }),
    });
  }

  async function startGoogle(mode: "link" | "sign-in"): Promise<GoogleResult> {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const client = supabase();
    const { data: sessionData } = await client.auth.getSession();
    const anonymous = sessionData.session?.user.is_anonymous === true;
    if (anonymous) {
      await handoffGuestSession();
    }
    if (mode === "link" && anonymous) {
      const { data, error } = await client.auth.linkIdentity({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) {
        const fallback = classifyGoogleLinkError(error);
        return { ok: false, fallback, message: googleFallbackMessage(fallback) };
      }
      if (data?.url) {
        window.location.assign(data.url);
        return { ok: true };
      }
      return { ok: false, fallback: null, message: "Could not start Google sign-in. Try again." };
    }

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      if (/redirect/i.test(error.message)) {
        return {
          ok: false,
          fallback: null,
          message: `Add ${window.location.origin}/auth/callback to the Supabase redirect URLs, then try again.`,
        };
      }
      return { ok: false, fallback: null, message: "Could not start Google sign-in. Try again." };
    }
    if (data?.url) {
      window.location.assign(data.url);
      return { ok: true };
    }
    return { ok: false, fallback: null, message: "Could not start Google sign-in. Try again." };
  }

  async function sendEmailCode(email: string): Promise<EmailCodeResult> {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    const client = supabase();
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session?.user.is_anonymous === true) {
      // Keeps this user id when the address is new. Supabase sends the
      // Change Email Address message, which must include {{ .Token }}.
      const { error } = await client.auth.updateUser({ email: address });
      if (!error) {
        return { ok: true, mode: "email_change" };
      }
      if (emailBelongsToAnotherAccount(error)) {
        const existing = await client.auth.signInWithOtp({
          email: address,
          options: { shouldCreateUser: false },
        });
        if (existing.error) {
          return { ok: false, message: mapAuthError(existing.error) };
        }
        return { ok: true, mode: "email" };
      }
      return { ok: false, message: mapAuthError(error) };
    }

    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      return { ok: false, message: mapAuthError(error) };
    }
    return { ok: true, mode: "email" };
  }

  async function verifyEmailCode(email: string, token: string, mode: OtpMode): Promise<VerifyResult> {
    if (!/^\d{6}$/.test(token)) {
      return { ok: false, message: "Enter the 6-digit code from the email." };
    }
    const client = supabase();
    const { data: before } = await client.auth.getSession();
    const guestToken = before.session?.user.is_anonymous === true ? before.session.access_token : null;
    const guestId = before.session?.user.is_anonymous === true ? before.session.user.id : null;

    const { data, error } = await client.auth.verifyOtp({
      email: email.trim(),
      token,
      type: mode,
    });
    if (error) {
      return { ok: false, message: mapAuthError(error) };
    }
    const signedIn = data.session?.user ?? data.user;
    if (!signedIn || signedIn.is_anonymous !== false) {
      return { ok: false, message: "That code didn't finish signing you in. Try again." };
    }
    if (!guestToken || !guestId || guestId === signedIn.id) {
      return { ok: true, fromId: null, toId: null, note: null };
    }

    // The email already belonged to another account, so the user id changed.
    // Move storage objects and sheet rows before we forget the guest token.
    const response = await fetch("/api/guest-migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestAccessToken: guestToken }),
    });
    if (!response.ok) {
      return {
        ok: true,
        fromId: null,
        toId: null,
        note: "You're signed in. We couldn't move every photo onto this account, but this download can still use the sheet on this page.",
      };
    }
    const body = (await response.json()) as { fromId?: string; toId?: string; sheetsNote?: string | null };
    return {
      ok: true,
      fromId: body.fromId ?? null,
      toId: body.toId ?? null,
      note: body.sheetsNote ?? null,
    };
  }

  async function signOut() {
    await supabase().auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, ensureAnonymousSession, startGoogle, sendEmailCode, verifyEmailCode, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
