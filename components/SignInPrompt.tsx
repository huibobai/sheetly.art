"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GoogleSignInButton } from "@/components/AuthControls";
import { useAuth } from "@/components/AuthProvider";

export function EmailSignInForm() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fieldId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSent(false);
    const result = await signInWithEmail(email);
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    setSent(true);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Email
      </label>
      <input
        id={fieldId}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:border-stone-300 disabled:opacity-50"
      >
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>
      {sent ? (
        <p role="status" className="text-sm text-muted">
          Check your email for a sign-in link. It brings you back to this page.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function SignInPrompt({
  open,
  title,
  onClose,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-lg outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          To build your preview, your photo is uploaded to our storage. If you pick an AI style, it&apos;s also sent to
          our image partner (fal.ai, which uses Black Forest Labs&apos; FLUX model) to create the sticker. Sign in with
          Google or email to add more photos and download the sheet.
        </p>
        <div className="mt-5 space-y-4">
          <GoogleSignInButton fullWidth />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <EmailSignInForm />
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-muted hover:text-foreground">
          Not now
        </button>
      </div>
    </div>
  );
}
