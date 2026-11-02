"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FlowStep } from "@/components/FlowStep";
import { PhotoUpload } from "@/components/PhotoUpload";
import { StickerSheet } from "@/components/StickerSheet";
import { StylePicker } from "@/components/StylePicker";
import { presetFromRecord, SHEET_COLUMNS, SHEET_COLUMNS_WITHOUT_STYLE, missingStyleColumn, toSheetRecord, type SheetPreset } from "@/lib/sheets";
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

  async function generate() {
    if (!imageUrl || isGenerating) {
      return;
    }

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

      setPreset(null);
      setGeneratedStyle(style);
      setResultUrl(payload.imageUrl);
      try {
        localStorage.setItem(`sheetly-style:${payload.imageUrl.split("#")[0]}`, style);
      } catch {
        // The sheet row still stores the style when the browser allows it.
      }
    } catch {
      setError("Could not generate a sticker. Please try again.");
    } finally {
      setIsGenerating(false);
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
        hint="JPG, PNG, or WEBP up to 10 MB. The photo is resized before it is saved."
        complete={Boolean(localPreview)}
      >
        <PhotoUpload
          showHeading={false}
          onPreview={(url) => {
            setPreset(null);
            handlePreview(url);
          }}
          onUploaded={(photo) => {
            setImageUrl(photo.url);
            setError(null);
          }}
        />
      </FlowStep>

      <FlowStep
        number={2}
        title="Generate a style"
        hint="Optional. Pick a look and generate a sticker, or skip this and use your photo."
        complete={Boolean(resultUrl)}
      >
        <StylePicker showHeading={false} selected={style} onSelect={setStyle} />
        <div className="mt-5 space-y-3">
          <button
            type="button"
            disabled={!canGenerate}
            aria-busy={isGenerating}
            onClick={() => void generate()}
            className={`w-full rounded-full bg-stone-900 px-8 py-3 text-sm font-semibold text-white sm:w-auto ${
              canGenerate ? "hover:bg-stone-700" : "cursor-not-allowed opacity-50"
            }`}
          >
            {isGenerating ? "Generating…" : "Generate Stickers"}
          </button>
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
          {resultUrl ? (
            <figure className="overflow-hidden rounded-2xl border border-border bg-stone-50 p-3 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="Generated sticker"
                className="mx-auto max-h-80 w-full rounded-xl object-contain"
              />
              <figcaption className="mt-3 text-center text-sm text-muted">
                {styleLabel(generatedStyle) ?? "Generated"} sticker. The sheet below will use this artwork.
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
        preset={preset}
      />
    </div>
  );
}
