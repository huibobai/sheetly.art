"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useAuth } from "@/components/AuthProvider";

const HEADER_SIGN_IN_DESCRIPTION =
  "Sign in with Google or email to save your sheets, add more photos, and download a file you can print.";

export function AuthControls() {
  const { user, loading, signOut } = useAuth();
  const searchParams = useSearchParams();
  const authError = searchParams.get("auth") === "error";
  const [signInOpen, setSignInOpen] = useState(false);

  if (loading) {
    return <p className="text-sm text-muted">…</p>;
  }

  if (user) {
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
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
    <div className="ml-auto flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setSignInOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={signInOpen}
        className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:border-stone-300"
      >
        Sign in
      </button>
      {authError ? (
        <p role="alert" className="text-sm text-red-600">
          That sign-in didn&apos;t work. Please try again.
        </p>
      ) : null}
      <SignInPrompt
        open={signInOpen}
        title="Sign in"
        description={HEADER_SIGN_IN_DESCRIPTION}
        onClose={() => setSignInOpen(false)}
      />
    </div>
  );
}
