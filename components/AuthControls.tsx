"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useAuth } from "@/components/AuthProvider";
import { isPermanentUser } from "@/lib/auth-user";
import type { SignInPurpose } from "@/lib/sign-in-flow";

export function AuthControls() {
  const { user, loading, signOut } = useAuth();
  const searchParams = useSearchParams();
  const auth = searchParams.get("auth");
  const authError = auth === "error";
  const [signInOpen, setSignInOpen] = useState(false);
  const [purpose, setPurpose] = useState<SignInPurpose>("header");
  const permanent = isPermanentUser(user);

  function openSignIn(next: SignInPurpose) {
    setPurpose(next);
    setSignInOpen(true);
  }

  if (loading) {
    return <p className="text-sm text-muted">…</p>;
  }

  if (permanent && user) {
    return (
      <div className="nav-actions">
        <p className="muted">{user.email}</p>
        <Link href="/sheets" className="btn btn-ghost">
          My sheets
        </Link>
        <button type="button" onClick={() => void signOut()} className="btn btn-ghost">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="nav-actions">
      <button type="button" onClick={() => openSignIn("save")} className="btn btn-ghost">
        My sheets
      </button>
      <button
        type="button"
        onClick={() => openSignIn("header")}
        aria-haspopup="dialog"
        aria-expanded={signInOpen}
        className="btn"
      >
        Sign in
      </button>
      {authError ? (
        <p role="alert" className="alert">
          That sign-in didn&apos;t work. Please try again.
        </p>
      ) : null}
      {signInOpen ? (
        <SignInPrompt
          key={purpose}
          open
          purpose={purpose}
          onClose={() => setSignInOpen(false)}
          onSignedIn={() => setSignInOpen(false)}
        />
      ) : null}
    </div>
  );
}
