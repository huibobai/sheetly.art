"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/AuthControls";
import { EmailSignInForm } from "@/components/SignInPrompt";
import { useAuth } from "@/components/AuthProvider";
import { SHEET_BACKGROUNDS, sheetSizeLabel } from "@/lib/sticker-sheet";
import { SHEET_COLUMNS, SHEET_COLUMNS_WITHOUT_STYLE, missingStyleColumn, toSheetRecord, type SheetRecord } from "@/lib/sheets";
import { styleLabel, urlWithoutStyle } from "@/lib/sticker-styles";
import { createClient } from "@/lib/supabase/client";

function rememberedStyle(url: string | null) {
  if (!url) {
    return null;
  }
  try {
    return localStorage.getItem(`sheetly-style:${url.split("#")[0]}`);
  } catch {
    return null;
  }
}

export function SheetsList() {
  const { user, loading } = useAuth();
  const [sheets, setSheets] = useState<SheetRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("sheets")
      .select(SHEET_COLUMNS)
      .order("created_at", { ascending: false })
      .then(async ({ data, error }) => {
        if (cancelled) {
          return;
        }

        let rows = data;
        let queryError = error;
        if (queryError && missingStyleColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_STYLE)
            .order("created_at", { ascending: false });
          rows = (fallback.data ?? []).map((row) => ({ ...row, style: null }));
          queryError = fallback.error;
        }

        if (cancelled) {
          return;
        }
        if (queryError) {
          setStatus("error");
          return;
        }
        setSheets(
          (rows ?? [])
            .map((row) => toSheetRecord(row))
            .filter((row): row is SheetRecord => row !== null),
        );
        setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading || (user && status === "loading")) {
    return <p className="text-sm text-muted">Loading your sheets…</p>;
  }

  if (!user) {
    return (
      <div className="max-w-lg space-y-4 rounded-3xl border border-border bg-surface p-6">
        <p className="text-sm leading-6 text-muted">
          Sign in to see sheets you have saved, add more than one photo, and download a print-ready file.
        </p>
        <GoogleSignInButton />
        <EmailSignInForm />
      </div>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" className="text-sm text-red-600">
        Could not load your sheets.
      </p>
    );
  }

  if (sheets.length === 0) {
    return (
      <p className="text-sm text-muted">
        You have not saved a sheet yet. Make one on the home page while signed in.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sheets.map((sheet) => {
        const background =
          SHEET_BACKGROUNDS.find((item) => item.id === sheet.background)?.label ?? sheet.background;
        const created = new Date(sheet.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const label =
          styleLabel(sheet.style) ??
          styleLabel(rememberedStyle(sheet.generated_url)) ??
          styleLabel(rememberedStyle(sheet.source_image_url)) ??
          "Photo";

        return (
          <li key={sheet.id}>
            <Link
              href={`/?sheet=${sheet.id}`}
              className="block overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-stone-300"
            >
              <div className="aspect-square bg-stone-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlWithoutStyle(sheet.generated_url || sheet.source_image_url)}
                  alt={label ? `${label} sticker sheet` : "Saved sticker sheet"}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="space-y-2 p-4">
                <p className="text-sm font-medium">
                  {sheet.sticker_count} stickers · {sheetSizeLabel(sheet.sheet_size)}
                </p>
                <p>
                  <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-sm font-semibold text-white">
                    {label}
                  </span>
                </p>
                <p className="text-sm text-muted">
                  {background} · {created}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
