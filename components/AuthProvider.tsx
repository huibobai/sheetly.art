"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<string | null>;
  signInWithEmail: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

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

  async function signInWithGoogle() {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (!error) {
      return null;
    }
    if (/redirect/i.test(error.message)) {
      return `Add ${window.location.origin}/auth/callback to the Supabase redirect URLs, then try again.`;
    }
    return "Could not start Google sign-in. Try again.";
  }

  async function signInWithEmail(email: string) {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return "Enter a valid email address.";
    }

    const { error } = await supabase().auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (!error) {
      return null;
    }
    if (/redirect/i.test(error.message)) {
      return `Add ${window.location.origin}/auth/callback to the Supabase redirect URLs, then try again.`;
    }
    return "Could not send the sign-in email. Try again in a moment.";
  }

  async function signOut() {
    await supabase().auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithEmail, signOut }}>
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
