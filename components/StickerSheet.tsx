"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FlowStep } from "@/components/FlowStep";
import { missingStyleColumn, packBackground, type SheetPreset } from "@/lib/sheets";
import { styleLabel, urlWithStyle } from "@/lib/sticker-styles";
import {
  drawStickerSheet,
  SHEET_BACKGROUNDS,
  SHEET_COUNTS,
  SHEET_SIZES,
  type SheetBackground,
  type SheetCount,
  type SheetSize,
} from "@/lib/sticker-sheet";
import { createClient } from "@/lib/supabase/client";

async function loadSheetImage(url: string, signal: AbortSignal) {
  const artworkUrl = url.split("#")[0];
  const source =
    artworkUrl.startsWith("blob:") || artworkUrl.startsWith("data:")
      ? artworkUrl
      : `/api/sheet-image?url=${encodeURIComponent(artworkUrl)}`;

  let response: Response;
  try {
    response = await fetch(source, { signal });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new Error("Could not load the artwork for this sheet.");
  }

  if (!response.ok) {
    let detail = "Could not load the artwork for this sheet.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
      // The response was not JSON.
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("The saved artwork file is empty.");
  }

  try {
    return await createImageBitmap(blob);
  } catch {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      return await createImageBitmap(image);
    } catch {
      throw new Error("The saved artwork could not be read.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export function StickerSheet({
  photoUrl,
  storedPhotoUrl,
  generatedUrl,
  generatedStyle,
  preset,
}: {
  photoUrl: string | null;
  storedPhotoUrl: string | null;
  generatedUrl: string | null;
  generatedStyle: string | null;
  preset: SheetPreset | null;
}) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const [count, setCount] = useState<SheetCount>(preset?.count ?? 9);
  const [size, setSize] = useState<SheetSize>(preset?.size ?? "a4");
  const [background, setBackground] = useState<SheetBackground>(preset?.background ?? "white");
  const [padding, setPadding] = useState(preset?.padding ?? 12);
  const [source, setSource] = useState<"photo" | "generated">(
    preset?.source ?? (generatedStyle && generatedUrl ? "generated" : "photo"),
  );
  const artworkChoiceRef = useRef<"photo" | "generated" | null>(preset?.source ?? null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (generatedUrl && !preset) {
      setSource("generated");
    }
  }, [generatedUrl, preset]);

  useEffect(() => {
    if (!preset) {
      return;
    }
    setCount(preset.count);
    setSize(preset.size);
    setBackground(preset.background);
    setPadding(preset.padding);
    setSource(preset.source);
  }, [preset]);

  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
    };
  }, []);

  const savedSource: "photo" | "generated" =
    artworkChoiceRef.current ??
    (generatedStyle && generatedUrl?.startsWith("https://") ? "generated" : source);
  const savedStyle = savedSource === "generated" ? generatedStyle : null;
  const imageUrl = savedSource === "generated" && generatedUrl ? generatedUrl : photoUrl;
  const durableImageUrl =
    savedSource === "generated" && generatedUrl?.startsWith("https://")
      ? generatedUrl.split("#")[0]
      : storedPhotoUrl?.startsWith("https://")
        ? storedPhotoUrl.split("#")[0]
        : imageUrl?.startsWith("https://")
          ? imageUrl.split("#")[0]
          : null;

  useEffect(() => {
    if (!user || !durableImageUrl) {
      return;
    }

    const styleForRow =
      generatedStyle && generatedUrl?.startsWith("https://") ? generatedStyle : null;
    const generationReady = styleForRow !== null;
    if (!ready && !generationReady) {
      return;
    }

    const snapshot = [durableImageUrl, savedSource, count, size, background, padding, styleForRow ?? ""].join(
      "|",
    );
    const loadedSnapshot = preset
      ? [
          (preset.source === "generated" ? generatedUrl : storedPhotoUrl)?.split("#")[0] ?? "",
          preset.source,
          preset.count,
          preset.size,
          preset.background,
          preset.padding,
          preset.style ?? "",
        ].join("|")
      : null;

    if (snapshot === lastSavedRef.current || snapshot === loadedSnapshot) {
      return;
    }

    const label = styleLabel(styleForRow);
    const timer = window.setTimeout(() => {
      const supabase = createClient();
      const generatedImage = generatedUrl?.startsWith("https://") ? generatedUrl.split("#")[0] : null;
      const sheetImage = styleForRow && generatedImage ? generatedImage : durableImageUrl;
      const row = {
        source_image_url: urlWithStyle(sheetImage, styleForRow),
        photo_url: storedPhotoUrl?.startsWith("https://") ? storedPhotoUrl.split("#")[0] : null,
        generated_url: generatedImage ? urlWithStyle(generatedImage, styleForRow) : null,
        source: styleForRow ? "generated" : savedSource,
        style: styleForRow,
        sticker_count: count,
        sheet_size: size,
        background: packBackground(background, styleForRow),
        padding,
      };
      void supabase
        .from("sheets")
        .insert(row)
        .then(async ({ error: saveError }) => {
          if (saveError && missingStyleColumn(saveError)) {
            console.error("[sheets] save failed", {
              style: styleForRow,
              message: saveError.message,
              code: saveError.code,
            });
            const { style: _style, ...withoutStyle } = row;
            const retry = await supabase.from("sheets").insert(withoutStyle);
            if (retry.error) {
              setSaveNote(
                styleForRow
                  ? `Couldn't save the ${label ?? styleForRow} sheet. ${retry.error.message}`
                  : `Couldn't save this sheet. ${retry.error.message}`,
              );
              return;
            }
            lastSavedRef.current = snapshot;
            setSaveNote(label ? `Saved the ${label} sheet.` : "Saved to My sheets.");
            return;
          }
          if (saveError) {
            console.error("[sheets] save failed", {
              style: styleForRow,
              message: saveError.message,
              code: saveError.code,
            });
            setSaveNote(
              styleForRow
                ? `Couldn't save the ${label ?? styleForRow} sheet. ${saveError.message}`
                : `Couldn't save this sheet. ${saveError.message}`,
            );
            return;
          }
          lastSavedRef.current = snapshot;
          setSaveNote(label ? `Saved the ${label} sheet.` : "Saved to My sheets.");
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    ready,
    user,
    durableImageUrl,
    source,
    count,
    size,
    background,
    padding,
    preset,
    generatedUrl,
    generatedStyle,
    storedPhotoUrl,
    savedSource,
    savedStyle,
  ]);
  const backgroundLabel = SHEET_BACKGROUNDS.find((item) => item.id === background)?.label ?? "White";
  const sizeLabel = size === "a4" ? "A4" : "Square";

  useEffect(() => {
    if (!imageUrl) {
      if (preset) {
        setError("This saved sheet is missing its image, so it can't be previewed or downloaded.");
        setReady(false);
      }
      return;
    }

    const artworkUrl = imageUrl;
    const controller = new AbortController();
    let cancelled = false;

    async function render() {
      try {
        let bitmap = bitmapRef.current;
        if (!bitmap || loadedUrlRef.current !== imageUrl) {
          setError(null);
          try {
            bitmap = await loadSheetImage(artworkUrl, controller.signal);
          } catch {
            if (cancelled || controller.signal.aborted) {
              return;
            }
            bitmap = await loadSheetImage(artworkUrl, controller.signal);
          }
          if (cancelled) {
            bitmap.close();
            return;
          }
          bitmapRef.current?.close();
          bitmapRef.current = bitmap;
          loadedUrlRef.current = imageUrl;
        }

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("The sheet preview is not on the page yet.");
        }

        drawStickerSheet(context, bitmap, {
          count,
          size,
          background,
          padding: padding / 100,
        });
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setReady(false);
        setError(
          error instanceof Error && error.message
            ? error.message
            : "Could not build the sticker sheet.",
        );
      }
    }

    void render();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [imageUrl, count, size, background, padding, preset]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) {
      setError(
        imageUrl
          ? "The sheet is not ready to download yet."
          : "This sheet has no artwork to download.",
      );
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not create the PNG. Open the sheet again and retry the download.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sheetly-sticker-sheet.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const summaryParts = [
    `${count} stickers`,
    sizeLabel,
    backgroundLabel,
    source === "generated" ? styleLabel(generatedStyle) : null,
    "300 DPI",
  ].filter((part): part is string => Boolean(part));
  const summary = ready ? summaryParts.join(" · ") : "Upload a photo to build your sheet.";

  return (
    <>
      <FlowStep
        number={3}
        title="Create your sheet"
        hint="Choose how many stickers, the page shape, a background, and how much white border sits around each one."
        complete={ready}
      >
        {!imageUrl ? (
          <div className="rounded-2xl border border-dashed border-border bg-stone-50 px-6 py-14 text-center">
            <p className="text-sm font-medium">Your preview will show up here</p>
            <p className="mt-1 text-sm text-muted">Upload a photo in step 1 to start the sheet.</p>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="space-y-5">
              {photoUrl && generatedUrl ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Artwork</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["photo", "Photo"],
                        ["generated", "Generated"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={source === id}
                        onClick={() => {
                          artworkChoiceRef.current = id;
                          setSource(id);
                        }}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                          source === id
                            ? "border-accent bg-orange-50 text-accent"
                            : "border-border bg-white hover:border-stone-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Stickers</legend>
                <div className="grid grid-cols-3 gap-2">
                  {SHEET_COUNTS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={count === option}
                      onClick={() => setCount(option)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                        count === option
                          ? "border-accent bg-orange-50 text-accent"
                          : "border-border bg-white hover:border-stone-300"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Sheet size</legend>
                <div className="grid grid-cols-2 gap-2">
                  {SHEET_SIZES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={size === option.id}
                      onClick={() => setSize(option.id)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                        size === option.id
                          ? "border-accent bg-orange-50 text-accent"
                          : "border-border bg-white hover:border-stone-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Background</legend>
                <div className="flex flex-wrap gap-2">
                  {SHEET_BACKGROUNDS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={background === option.id}
                      title={option.label}
                      onClick={() => setBackground(option.id)}
                      className={`h-9 w-9 rounded-full border ${
                        background === option.id
                          ? "border-stone-900 ring-2 ring-stone-900 ring-offset-2"
                          : "border-stone-200"
                      } ${option.color ? "" : "sheet-checker"}`}
                      style={option.color ? { backgroundColor: option.color } : undefined}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">{backgroundLabel}</p>
              </fieldset>

              <label className="block space-y-2">
                <span className="flex items-center justify-between text-sm font-medium">
                  Border
                  <span className="font-normal text-muted">{padding === 0 ? "None" : "White edge"}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={28}
                  value={padding}
                  aria-valuemin={0}
                  aria-valuemax={28}
                  aria-valuenow={padding}
                  aria-label="Sticker border"
                  onChange={(event) => setPadding(Number(event.target.value))}
                  className="w-full accent-orange-600"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div
                className={`mx-auto overflow-hidden rounded-2xl border border-border ${
                  size === "square" ? "max-w-lg" : "max-w-sm"
                } ${background === "transparent" ? "sheet-checker" : "bg-white"}`}
              >
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`${count} stickers on a ${sizeLabel} sheet`}
                  className="h-auto w-full"
                />
              </div>
              <p className="text-center text-sm text-muted" role="status">
                {error ?? (ready ? summary : "Preparing your sheet…")}
              </p>
            </div>
          </div>
        )}
      </FlowStep>

      <FlowStep
        number={4}
        title="Download"
        hint="Save a high-resolution PNG. It is ready to print or share."
        complete={ready}
      >
        <button
          type="button"
          onClick={download}
          disabled={!ready}
          className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download sticker sheet
        </button>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        ) : (
          <div className="mt-3 space-y-1 text-center">
            <p className="text-sm text-muted">{summary}</p>
            {saveNote ? (
              <p
                role={saveNote.startsWith("Couldn't") ? "alert" : "status"}
                className={`text-sm ${saveNote.startsWith("Couldn't") ? "text-red-600" : "text-muted"}`}
              >
                {saveNote}
              </p>
            ) : null}
            {!user && durableImageUrl ? (
              <p className="text-sm text-muted">
                Sign in if you want this sheet kept in My sheets. You can still download it.
              </p>
            ) : null}
          </div>
        )}
      </FlowStep>
    </>
  );
}
