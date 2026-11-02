"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function GoogleSignInButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { signInWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const result = await signInWithGoogle();
    if (result) {
      setPending(false);
      setError(result);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        className={`rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:border-stone-300 disabled:opacity-50 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        {pending ? "Redirecting…" : "Sign in with Google"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthControls() {
  const { user, loading, signOut } = useAuth();
  const searchParams = useSearchParams();
  const authError = searchParams.get("auth") === "error";

  if (loading) {
    return <p className="text-sm text-muted">…</p>;
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <p className="max-w-48 truncate text-sm text-muted">{user.email}</p>
        <Link href="/sheets" className="text-sm font-medium">
          My sheets
        </Link>
        <button type="button" onClick={() => void signOut()} className="text-sm font-medium">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <GoogleSignInButton />
      {authError ? (
        <p role="alert" className="text-sm text-red-600">
          That sign-in didn&apos;t work. Try again.
        </p>
      ) : null}
    </div>
  );
}
