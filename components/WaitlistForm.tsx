"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { WAITLIST_CONSENT_LABEL, WAITLIST_UNAVAILABLE, type WaitlistSource } from "@/lib/waitlist";

export function WaitlistForm({ source }: { source: WaitlistSource }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const sendingRef = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    const honeypot = String(new FormData(event.currentTarget).get("fax_number") ?? "");
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          consent,
          source,
          fax_number: honeypot,
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const text = typeof data?.message === "string" && data.message ? data.message : WAITLIST_UNAVAILABLE;
      setMessage(text);
      setStatus(response.ok ? "done" : "error");
    } catch {
      setMessage(WAITLIST_UNAVAILABLE);
      setStatus("error");
    } finally {
      sendingRef.current = false;
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="text-base font-medium">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative max-w-md space-y-4" aria-busy={status === "sending"}>
      <p className="sr-only" aria-hidden="true">
        <label>
          Fax number
          <input type="text" name="fax_number" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </p>
      <label className="block space-y-1.5 text-sm font-medium" htmlFor={`waitlist-email-${source}`}>
        <span>Email</span>
        <input
          id={`waitlist-email-${source}`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-base outline-none focus:border-stone-400"
        />
      </label>
      <label className="flex items-start gap-2 text-sm leading-6" htmlFor={`waitlist-consent-${source}`}>
        <input
          id={`waitlist-consent-${source}`}
          name="consent"
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
        />
        <span>
          {WAITLIST_CONSENT_LABEL}{" "}
          <Link href="/privacy" className="font-semibold underline" target="_blank" rel="noopener noreferrer">
            Privacy
          </Link>
        </span>
      </label>
      {status === "error" ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Saving…" : "Email me when it opens"}
      </button>
    </form>
  );
}
