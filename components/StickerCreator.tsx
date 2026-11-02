"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FlowStep } from "@/components/FlowStep";
import { PhotoUpload } from "@/components/PhotoUpload";
import { StickerSheet } from "@/components/StickerSheet";
import { StylePicker } from "@/components/StylePicker";
import { presetFromRecord, SHEET_COLUMNS, SHEET_COLUMNS_WITHOUT_STYLE, missingStyleColumn, toSheetRecord, type SheetPreset } from "@/lib/sheets";
import type { ExtraSticker } from "@/lib/sticker-sheet";
import { isStickerStyle, styleLabel } from "@/lib/sticker-styles";
import { createClient } from "@/lib/supabase/client";

export function StickerCreator({ initialSheetId }: { initialSheetId: string | null }) {
  const { user, loading } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const localPreviewRef = useRef<string | null>(null);
  const [style, setStyle] = useState("cartoon");
  const [generatedStyle, setGeneratedStyle] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState<string | null>(null);
  const [moreStickers, setMoreStickers] = useState<ExtraSticker[]>([]);
  const [generateMode, setGenerateMode] = useState<"primary" | "extra" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<SheetPreset | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const canGenerate = Boolean(imageUrl) && !isGenerating;

  const handlePreview = useCallback((url: string) => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
    }
    localPreviewRef.current = url;
    setLocalPreview(url);
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!initialSheetId || loading) {
      return;
    }

    if (!user) {
      setRestoreNote("Sign in to open this saved sheet. You can still make a new one here.");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("sheets")
      .select(SHEET_COLUMNS)
      .eq("id", initialSheetId)
      .maybeSingle()
      .then(async ({ data, error: loadError }) => {
        if (cancelled) {
          return;
        }

        let row = data;
        let queryError = loadError;
        if (queryError && missingStyleColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_STYLE)
            .eq("id", initialSheetId)
            .maybeSingle();
          row = fallback.data ? { ...fallback.data, style: null } : null;
          queryError = fallback.error;
        }

        if (cancelled) {
          return;
        }
        const record = row ? toSheetRecord(row) : null;
        if (queryError || !record) {
          setRestoreNote("That sheet could not be opened.");
          return;
        }

        setRestoreNote(null);
        setPreset(presetFromRecord(record));
        if (record.style && isStickerStyle(record.style)) {
          setStyle(record.style);
        }
        if (record.source === "generated") {
          setGeneratedStyle(record.style);
          setResultUrl(record.generated_url || record.source_image_url);
          if (record.photo_url) {
            setImageUrl(record.photo_url);
            setLocalPreview(record.photo_url);
          }
          return;
        }
        setGeneratedStyle(null);
        setResultUrl(null);
        setImageUrl(record.source_image_url);
        setLocalPreview(record.source_image_url);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSheetId, loading, user]);

  function addExtra(sticker: ExtraSticker) {
    setMoreStickers((current) => (current.length >= 11 ? current : [...current, sticker]));
  }

  function removeExtra(id: string) {
    setMoreStickers((current) => current.filter((sticker) => sticker.id !== id));
  }

  async function generate(mode: "primary" | "extra" = "primary") {
    if (!imageUrl || isGenerating) {
      return;
    }

    setGenerateMode(mode);
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, style }),
      });
      const payload = (await response.json()) as { imageUrl?: string; error?: string };

      if (!response.ok || !payload.imageUrl) {
        setError(payload.error ?? "Could not generate a sticker. Please try again.");
        return;
      }

      const label = styleLabel(style) ?? "Sticker";
      try {
        localStorage.setItem(`sheetly-style:${payload.imageUrl.split("#")[0]}`, style);
      } catch {
        // The sheet row still stores the style when the browser allows it.
      }

      if (mode === "extra") {
        addExtra({ id: crypto.randomUUID(), previewUrl: payload.imageUrl, label });
        setPreviewGenerated(payload.imageUrl);
        return;
      }

      setPreset(null);
      setGeneratedStyle(style);
      setResultUrl(payload.imageUrl);
      setPreviewGenerated(payload.imageUrl);
    } catch {
      setError("Could not generate a sticker. Please try again.");
    } finally {
      setIsGenerating(false);
      setGenerateMode(null);
    }
  }

  return (
    <div className="space-y-5">
      {restoreNote ? (
        <p role="status" className="text-sm text-muted">
          {restoreNote}
        </p>
      ) : null}
      <FlowStep
        number={1}
        title="Upload a photo"
        hint="JPG, PNG, or WEBP up to 10 MB. Drop one photo, or several to mix designs on the sheet."
        complete={Boolean(localPreview)}
      >
        <PhotoUpload
          showHeading={false}
          remainingExtras={Math.max(0, 11 - moreStickers.length)}
          onPreview={(url) => {
            setPreset(null);
            setMoreStickers([]);
            handlePreview(url);
          }}
          onExtra={addExtra}
          onUploaded={(photo) => {
            setImageUrl(photo.url);
            setError(null);
          }}
        />
      </FlowStep>

      <FlowStep
        number={2}
        title="Generate a style"
        hint="Optional. Generate one style, or add several styles and the sheet will place them in the grid."
        complete={Boolean(resultUrl) || moreStickers.some((sticker) => sticker.label !== "Photo")}
      >
        <StylePicker showHeading={false} selected={style} onSelect={setStyle} />
        <div className="mt-5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={!canGenerate}
              aria-busy={isGenerating && generateMode === "primary"}
              onClick={() => void generate("primary")}
              className={`rounded-full bg-stone-900 px-8 py-3 text-sm font-semibold text-white ${
                canGenerate ? "hover:bg-stone-700" : "cursor-not-allowed opacity-50"
              }`}
            >
              {isGenerating && generateMode === "primary" ? "Generating…" : "Generate sticker"}
            </button>
            <button
              type="button"
              disabled={!canGenerate || moreStickers.length >= 11}
              aria-busy={isGenerating && generateMode === "extra"}
              onClick={() => void generate("extra")}
              className="rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating && generateMode === "extra" ? "Generating…" : "Add another sticker"}
            </button>
          </div>
          <p className="text-sm text-muted">
            Generate sticker updates the main design. Add another sticker keeps it and puts a new one on the sheet.
          </p>
          {isGenerating ? (
            <p className="text-sm text-muted" role="status">
              Creating your sticker…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {previewGenerated || resultUrl ? (
            <figure className="overflow-hidden rounded-2xl border border-border bg-stone-50 p-3 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewGenerated ?? resultUrl ?? ""}
                alt="Generated sticker"
                className="mx-auto max-h-80 w-full rounded-xl object-contain"
              />
              <figcaption className="mt-3 text-center text-sm text-muted">
                {moreStickers.length > 0
                  ? "Latest design. The sheet places each one in order."
                  : `${styleLabel(generatedStyle) ?? "Generated"} sticker. The sheet repeats this design.`}
              </figcaption>
            </figure>
          ) : null}
        </div>
      </FlowStep>

      <StickerSheet
        key={preset?.id ?? "draft"}
        photoUrl={localPreview}
        storedPhotoUrl={imageUrl}
        generatedUrl={resultUrl}
        generatedStyle={generatedStyle}
        moreStickers={moreStickers}
        onAddSticker={addExtra}
        onRemoveSticker={removeExtra}
        preset={preset}
      />
    </div>
  );
}
