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
      <p role="status" className="lead">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="waitlist-form stack-lg" aria-busy={status === "sending"}>
      <p className="visually-hidden" aria-hidden="true">
        <label>
          Fax number
          <input type="text" name="fax_number" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </p>
      <div className="stack">
        <label htmlFor={`waitlist-email-${source}`}>Email</label>
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
          className="field"
        />
      </div>
      <label className="consent-row" htmlFor={`waitlist-consent-${source}`}>
        <input
          id={`waitlist-consent-${source}`}
          name="consent"
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          {WAITLIST_CONSENT_LABEL}{" "}
          <Link href="/privacy">Privacy</Link>
        </span>
      </label>
      {status === "error" ? (
        <p role="alert" className="form-error">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={status === "sending"} className="btn btn-primary">
        {status === "sending" ? "Saving…" : "Email me when it opens"}
      </button>
    </form>
  );
}
