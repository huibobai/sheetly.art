"use client";

import { useState } from "react";

export function SheetBuy({
  sheetId,
  productName,
  priceLabel,
  signedIn,
  onSignIn,
}: {
  sheetId: string | null;
  productName: string;
  priceLabel: string;
  signedIn: boolean;
  onSignIn?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    if (!sheetId) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const body = (await response.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
      if (response.status === 401) {
        onSignIn?.();
        return;
      }
      if (!response.ok || typeof body?.url !== "string") {
        const message = typeof body?.error === "string" ? body.error : "";
        const machine = message === "payment_provider_unavailable" || message === "order_writer_unavailable";
        setError(message && !machine ? message : "We couldn't start checkout. Please try again.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("We couldn't start checkout. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const hint = !signedIn
    ? "Sign in to buy this download."
    : !sheetId
      ? "We'll save the sheet to your account first."
      : "A file you can print at home.";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{productName}</p>
        <p className="text-sm font-semibold">{priceLabel}</p>
      </div>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={pending || (signedIn && !sheetId)}
        className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Opening checkout…" : signedIn ? `Buy download · ${priceLabel}` : `Sign in to buy · ${priceLabel}`}
      </button>
      <p className="text-center text-sm text-muted">{hint}</p>
      {error ? (
        <p role="alert" className="text-center text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
