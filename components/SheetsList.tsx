"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoSheet } from "@/components/DemoSheet";
import { SignInPrompt } from "@/components/SignInPrompt";
import { SheetThumbnail } from "@/components/SheetThumbnail";
import { useAuth } from "@/components/AuthProvider";
import { isPermanentUser } from "@/lib/auth-user";
import { SHEET_BACKGROUNDS, sheetSizeLabel } from "@/lib/sticker-sheet";
import {
  missingItemsColumn,
  missingStyleColumn,
  SHEET_COLUMNS,
  SHEET_COLUMNS_WITHOUT_ITEMS,
  SHEET_COLUMNS_WITHOUT_STYLE,
  sheetItems,
  toSheetRecord,
  type SheetRecord,
} from "@/lib/sheets";
import { styleLabel } from "@/lib/sticker-styles";
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
  const [signInOpen, setSignInOpen] = useState(false);
  const permanent = isPermanentUser(user);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!permanent) {
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
        if (queryError && missingItemsColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_ITEMS)
            .order("created_at", { ascending: false });
          rows = (fallback.data ?? []).map((row) => ({ ...row, items: null }));
          queryError = fallback.error;
        }
        if (queryError && missingStyleColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_STYLE)
            .order("created_at", { ascending: false });
          rows = (fallback.data ?? []).map((row) => ({ ...row, style: null, items: null }));
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
  }, [loading, permanent]);

  if (loading || (permanent && status === "loading")) {
    return <p className="muted">Loading your sheets…</p>;
  }

  if (!permanent) {
    return (
      <div className="library-empty">
        <DemoSheet look="photo" />
        <div className="library-copy">
          <h1>My sheets</h1>
          <p>Open a saved sheet to download it again.</p>
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            aria-haspopup="dialog"
            className="btn btn-primary"
          >
            Sign in
          </button>
          <Link href="/" className="btn btn-ghost">
            New sheet
          </Link>
          <p className="muted">
            Sign in to see sheets you have saved. You can still make a sheet on the home page before you sign in.
          </p>
          {signInOpen ? (
            <SignInPrompt open purpose="save" onClose={() => setSignInOpen(false)} onSignedIn={() => setSignInOpen(false)} />
          ) : null}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" className="alert">
        Could not load your sheets.
      </p>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="stack-lg">
        <div className="library-top">
          <h1>My sheets</h1>
          <Link href="/" className="btn btn-ghost">
            New sheet
          </Link>
        </div>
        <div className="library-empty">
          <DemoSheet look="outline" />
          <p>You have not saved a sheet yet. Make one on the home page while signed in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="library-top">
        <h1>My sheets</h1>
        <Link href="/" className="btn btn-ghost">
          New sheet
        </Link>
      </div>
      <ul className="sheet-cards">
      {sheets.map((sheet) => {
        const background =
          SHEET_BACKGROUNDS.find((item) => item.id === sheet.background)?.label ?? sheet.background;
        const created = new Date(sheet.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const photos = sheetItems(sheet);
        const styles = [...new Set(photos.map((item) => item.style).filter((style) => style))];
        const label =
          styles.length > 1
            ? "Mixed"
            : styleLabel(styles[0]) ??
              styleLabel(sheet.style) ??
              styleLabel(rememberedStyle(sheet.generated_url)) ??
              styleLabel(rememberedStyle(sheet.source_image_url)) ??
              "Photo";

        return (
          <li key={sheet.id}>
            <Link href={`/?sheet=${sheet.id}`} className="sheet-card">
              <div className="sheet-card-face">
                <SheetThumbnail sheet={sheet} />
              </div>
              <div className="sheet-card-body">
                <p>
                  {photos.length > 1 ? `${photos.length} photos` : "One photo"}
                </p>
                <p>
                  {sheet.sticker_count} stickers, {sheetSizeLabel(sheet.sheet_size)}
                </p>
                <p>
                  <span className="sheet-card-tag">{label}</span>
                </p>
                <p className="muted">
                  {background}
                </p>
                <p className="muted">{created}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
