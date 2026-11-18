"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { SIGN_IN_PRIVACY_NOTICE } from "@/lib/copy";
import type { GoogleLinkFallback } from "@/lib/auth-errors";
import { isAnonymousUser } from "@/lib/auth-user";
import {
  canResend,
  initialDialogState,
  isCompleteOtp,
  otpDigits,
  reduceDialog,
  resendWaitMs,
  type DialogState,
  type SignInPurpose,
} from "@/lib/sign-in-flow";

const TITLES: Record<SignInPurpose, string> = {
  download: "Sign in to download this sheet",
  save: "Sign in to keep this sheet",
  limit: "Sign in to keep styling",
  header: "Sign in",
};

export type SignedInResult = {
  purpose: SignInPurpose;
  fromId: string | null;
  toId: string | null;
  note: string | null;
};

export function SignInPrompt({
  open,
  purpose,
  notice,
  onClose,
  onBeforeGoogle,
  onSignedIn,
}: {
  open: boolean;
  purpose: SignInPurpose;
  notice?: GoogleLinkFallback | null;
  onClose: () => void;
  /** Persist sheet references before the Google redirect. Return false to stay here. */
  onBeforeGoogle?: (purpose: SignInPurpose) => boolean;
  onSignedIn?: (result: SignedInResult) => void;
}) {
  const { user, startGoogle, sendEmailCode, verifyEmailCode } = useAuth();
  const [flow, setFlow] = useState<DialogState>(() => reduceDialog(initialDialogState(), { type: "open", purpose }));
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fallback, setFallback] = useState<GoogleLinkFallback | null>(notice ?? null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      if (flow.step === "email") {
        emailRef.current?.focus();
      } else if (flow.step === "code") {
        codeRef.current?.focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]")];
      if (!nodes.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (event.shiftKey && (!inside || active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, flow.step]);

  useEffect(() => {
    if (!open || flow.step !== "code" || flow.sentAt === null) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, flow.step, flow.sentAt]);

  if (!open) {
    return null;
  }

  const waitMs = resendWaitMs(flow.sentAt, now);
  const title = TITLES[flow.purpose];

  async function continueWithGoogle(mode: "link" | "sign-in") {
    const ready = onBeforeGoogle?.(flow.purpose) ?? true;
    if (!ready) {
      setFlow((current) =>
        reduceDialog(current, {
          type: "fail",
          error: "Wait for the photo to finish uploading, then try Google again. Or use email and stay on this page.",
        }),
      );
      return;
    }
    setPending(true);
    const result = await startGoogle(mode);
    if (!result.ok) {
      setPending(false);
      setFallback(result.fallback);
      setFlow((current) => reduceDialog(current, { type: "fail", error: result.message }));
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await sendEmailCode(flow.email);
    setPending(false);
    if (!result.ok) {
      setFlow((current) => reduceDialog(current, { type: "fail", error: result.message }));
      return;
    }
    setCode("");
    setNow(Date.now());
    setFlow((current) =>
      reduceDialog(current, { type: "code-sent", email: flow.email.trim(), otpMode: result.mode, now: Date.now() }),
    );
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = otpDigits(code);
    if (!isCompleteOtp(digits)) {
      setFlow((current) => reduceDialog(current, { type: "verify-failed", error: "Enter the 6-digit code from the email." }));
      return;
    }
    setPending(true);
    const result = await verifyEmailCode(flow.email, digits, flow.otpMode);
    setPending(false);
    if (!result.ok) {
      setFlow((current) => reduceDialog(current, { type: "verify-failed", error: result.message }));
      return;
    }
    const next = reduceDialog(flow, { type: "verified" });
    setFlow(next);
    onSignedIn?.({
      purpose: next.purpose,
      fromId: result.fromId,
      toId: result.toId,
      note: result.note,
    });
  }

  async function resend() {
    if (!canResend(flow.sentAt, Date.now()) || pending) {
      return;
    }
    setPending(true);
    const result = await sendEmailCode(flow.email);
    setPending(false);
    if (!result.ok) {
      setFlow((current) => reduceDialog(current, { type: "verify-failed", error: result.message }));
      return;
    }
    setNow(Date.now());
    setFlow((current) =>
      reduceDialog(current, { type: "code-sent", email: flow.email.trim(), otpMode: result.mode, now: Date.now() }),
    );
  }

  const dialog = (
    <div className="dialog-scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="dialog-panel"
        style={{
          minHeight: 0,
          maxHeight: "calc(100svh - var(--space-xl))",
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        <h2 id={titleId}>
          {title}
        </h2>
        <p id={descriptionId} className="muted">
          {SIGN_IN_PRIVACY_NOTICE} Sign in to download or save the sheet. You won&apos;t need to upload these photos again.
        </p>

        {flow.step === "choose" ? (
          <div className="stack-lg">
            <button
              type="button"
              onClick={() => void continueWithGoogle(fallback || !isAnonymousUser(user) ? "sign-in" : "link")}
              disabled={pending}
              className="btn btn-block"
            >
              {pending ? "Opening Google…" : fallback ? "Sign in with Google and move my photos" : "Continue with Google"}
            </button>
            {fallback ? (
              <p role="status" className="muted">
                {fallback === "linking-off"
                  ? "Google linking isn't turned on yet. Signing in still moves these photos onto that account."
                  : "That Google account already has a Sheetly account. We'll move these photos over when you sign in."}
              </p>
            ) : null}
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={() => setFlow((current) => reduceDialog(current, { type: "choose-email" }))}
              className="btn btn-block"
            >
              Sign in with email
            </button>
          </div>
        ) : null}

        {flow.step === "email" ? (
          <form onSubmit={(event) => void submitEmail(event)} className="stack-lg">
            <div className="space-y-2">
              <label htmlFor={emailId} className="text-sm font-medium">
                Email
              </label>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                required
                value={flow.email}
                onChange={(event) =>
                  setFlow((current) => reduceDialog(current, { type: "edit-email", email: event.target.value }))
                }
                placeholder="you@example.com"
                aria-invalid={flow.error ? true : undefined}
                aria-describedby={flow.error ? errorId : undefined}
                className="field"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary btn-block"
            >
              {pending ? "Sending the code…" : "Email me a code"}
            </button>
            <button
              type="button"
              onClick={() => setFlow((current) => reduceDialog(current, { type: "back" }))}
              className="btn btn-ghost"
            >
              Back
            </button>
          </form>
        ) : null}

        {flow.step === "code" ? (
          <form onSubmit={(event) => void submitCode(event)} className="stack-lg">
            <p className="muted">
              Enter the 6-digit code we sent to <span className="font-medium text-foreground">{flow.email}</span>.
            </p>
            <div className="space-y-2">
              <label htmlFor={codeId} className="text-sm font-medium">
                6-digit code
              </label>
              <input
                ref={codeRef}
                id={codeId}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(otpDigits(event.target.value))}
                onPaste={(event) => {
                  const pasted = otpDigits(event.clipboardData.getData("text"));
                  if (!pasted) {
                    return;
                  }
                  event.preventDefault();
                  setCode(pasted);
                }}
                aria-invalid={flow.error ? true : undefined}
                aria-describedby={flow.error ? errorId : undefined}
                className="field field-code"
              />
            </div>
            <button
              type="submit"
              disabled={pending || !isCompleteOtp(code)}
              className="btn btn-primary btn-block"
            >
              {pending ? "Checking the code…" : "Verify and continue"}
            </button>
            <button
              type="button"
              onClick={() => void resend()}
              disabled={pending || !canResend(flow.sentAt, now)}
              className="btn btn-ghost"
            >
              {waitMs > 0 ? `Send a new code in ${Math.ceil(waitMs / 1000)}s` : "Send a new code"}
            </button>
            <button
              type="button"
              onClick={() => setFlow((current) => reduceDialog(current, { type: "back" }))}
              className="btn btn-ghost"
            >
              Use a different email
            </button>
          </form>
        ) : null}

        {flow.step === "verified" ? (
          <p role="status" className="muted">
            You&apos;re signed in.
          </p>
        ) : null}

        {flow.error ? (
          <p id={errorId} role="alert" className="alert">
            {flow.error}
          </p>
        ) : null}

        <button type="button" onClick={onClose} className="btn btn-ghost">
          Not now
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(dialog, document.body);
}
