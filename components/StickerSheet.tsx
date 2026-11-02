"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FlowStep } from "@/components/FlowStep";
import { PhotoUpload } from "@/components/PhotoUpload";
import type { SheetPreset } from "@/lib/sheets";
import { isStickerStyle, styleLabel } from "@/lib/sticker-styles";
import {
  drawStickerSheet,
  pngBlobWithDpi,
  previewScale,
  SHEET_BACKGROUNDS,
  SHEET_COUNTS,
  SHEET_SIZES,
  sheetSizeLabel,
  type ExtraSticker,
  type SheetBackground,
  type SheetCount,
  type SheetImage,
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
  moreStickers,
  onAddSticker,
  onRemoveSticker,
  preset,
}: {
  photoUrl: string | null;
  storedPhotoUrl: string | null;
  generatedUrl: string | null;
  generatedStyle: string | null;
  moreStickers: ExtraSticker[];
  onAddSticker: (sticker: ExtraSticker) => void;
  onRemoveSticker: (id: string) => void;
  preset: SheetPreset | null;
}) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
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
  const [downloading, setDownloading] = useState(false);
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
    const cache = bitmapCacheRef.current;
    return () => {
      for (const bitmap of cache.values()) {
        bitmap.close();
      }
      cache.clear();
    };
  }, []);

  const savedSource: "photo" | "generated" =
    artworkChoiceRef.current ??
    (generatedStyle && generatedUrl?.startsWith("https://") ? "generated" : source);
  const savedStyle = savedSource === "generated" ? generatedStyle : null;
  const imageUrl = savedSource === "generated" && generatedUrl ? generatedUrl : photoUrl;
  const artworkUrls = [imageUrl, ...moreStickers.map((sticker) => sticker.previewUrl)].filter(
    (url): url is string => Boolean(url),
  );
  const artworkKey = artworkUrls.join("\n");
  const durableImageUrl =
    savedSource === "generated" && generatedUrl?.startsWith("https://")
      ? generatedUrl.split("#")[0]
      : storedPhotoUrl?.startsWith("https://")
        ? storedPhotoUrl.split("#")[0]
        : imageUrl?.startsWith("https://")
          ? imageUrl.split("#")[0]
          : null;

  useEffect(() => {
    const generatedImage = generatedUrl?.startsWith("https://") ? generatedUrl.split("#")[0] : null;
    const explicitPhoto = artworkChoiceRef.current === "photo";
    const styleForRow =
      !explicitPhoto && generatedImage && generatedStyle && isStickerStyle(generatedStyle)
        ? generatedStyle
        : null;
    const sheetImage = styleForRow && generatedImage ? generatedImage : durableImageUrl;

    if (!user || !sheetImage) {
      return;
    }
    if (generatedImage && !explicitPhoto && !styleForRow) {
      return;
    }
    if (!styleForRow && !ready) {
      return;
    }

    const snapshot = [sheetImage, styleForRow ? "generated" : "photo", count, size, background, padding, styleForRow ?? ""].join(
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
      const row = {
        source_image_url: sheetImage,
        photo_url: storedPhotoUrl?.startsWith("https://") ? storedPhotoUrl.split("#")[0] : null,
        generated_url: styleForRow ? generatedImage : null,
        source: styleForRow ? "generated" : "photo",
        style: styleForRow,
        sticker_count: count,
        sheet_size: size,
        background,
        padding,
      };
      console.log("[sheets] save", { style: row.style });
      void supabase
        .from("sheets")
        .insert(row)
        .then(({ error: saveError }) => {
          if (saveError) {
            console.error("[sheets] save failed", {
              style: row.style,
              message: saveError.message,
              code: saveError.code,
            });
            setSaveNote(
              row.style
                ? `Couldn't save the ${label ?? row.style} sheet. ${saveError.message}`
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
  const sizeLabel = sheetSizeLabel(size);

  useEffect(() => {
    if (!artworkUrls.length) {
      if (preset) {
        setError("This saved sheet is missing its image, so it can't be previewed or downloaded.");
        setReady(false);
      }
      return;
    }

    const urls = artworkUrls;
    const controller = new AbortController();
    let cancelled = false;

    async function render() {
      try {
        setError(null);
        const loaded: SheetImage[] = [];
        for (const url of urls) {
          let bitmap = bitmapCacheRef.current.get(url);
          if (!bitmap) {
            try {
              bitmap = await loadSheetImage(url, controller.signal);
            } catch (error) {
              if (cancelled || controller.signal.aborted) {
                return;
              }
              bitmap = await loadSheetImage(url, controller.signal);
            }
            if (cancelled) {
              bitmap.close();
              return;
            }
            bitmapCacheRef.current.set(url, bitmap);
          }
          loaded.push(bitmap);
        }

        const keep = new Set(urls);
        for (const [url, bitmap] of bitmapCacheRef.current) {
          if (!keep.has(url)) {
            bitmap.close();
            bitmapCacheRef.current.delete(url);
          }
        }

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("The sheet preview is not on the page yet.");
        }

        drawStickerSheet(context, loaded, {
          count,
          size,
          background,
          padding: padding / 100,
          scale: previewScale(size),
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
    // artworkKey is the joined artwork URL list, so the preview reloads when a design is added or removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkKey, count, size, background, padding, preset]);

  async function download() {
    const bitmaps = artworkUrls.map((url) => bitmapCacheRef.current.get(url));
    if (!ready || bitmaps.some((bitmap) => !bitmap)) {
      setError(
        imageUrl
          ? "The sheet is not ready to download yet."
          : "This sheet has no artwork to download.",
      );
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        setError("Could not create the PNG. Open the sheet again and retry the download.");
        return;
      }

      drawStickerSheet(context, bitmaps.filter((bitmap): bitmap is ImageBitmap => Boolean(bitmap)), {
        count,
        size,
        background,
        padding: padding / 100,
        scale: 1,
      });
      console.log("[sheet] download canvas", canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) {
        setError("Could not create the PNG. Open the sheet again and retry the download.");
        return;
      }

      const printBlob = await pngBlobWithDpi(blob);
      const url = URL.createObjectURL(printBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sheetly-sticker-sheet.png";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const designCount = artworkUrls.length;
  const designNote =
    designCount <= 1
      ? "One design repeats across the sheet. Dashed lines show where to cut."
      : designCount >= count
        ? "Each cell uses a different design, in order. Dashed lines show where to cut."
        : "Designs fill the grid in order, then repeat. Dashed lines show where to cut.";
  const summaryParts = [
    `${count} stickers`,
    designCount > 1 ? `${designCount} designs` : null,
    sizeLabel,
    backgroundLabel,
    designCount <= 1 && source === "generated" ? styleLabel(generatedStyle) : null,
    "300 DPI",
  ].filter((part): part is string => Boolean(part));
  const summary = ready ? summaryParts.join(" · ") : "Upload a photo to build your sheet.";

  return (
    <>
      <FlowStep
        number={3}
        title="Create your sheet"
        hint="Set the count, page size, and background. Add more designs to mix the sheet. Dashed lines show where to cut."
        complete={ready}
      >
        {!imageUrl ? (
          <div className="rounded-2xl border border-dashed border-border bg-stone-50 px-6 py-14 text-center">
            <p className="text-sm font-medium">Your preview will show up here</p>
            <p className="mt-1 text-sm text-muted">Upload a photo in step 1 to start the sheet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Designs</legend>
              <div className="flex flex-wrap items-center gap-2">
                {artworkUrls.map((url, index) => {
                  const extra = index === 0 ? null : moreStickers[index - 1];
                  const label = index === 0 ? (source === "generated" ? styleLabel(generatedStyle) ?? "Generated" : "Photo") : extra?.label ?? "Photo";
                  return (
                    <div key={extra?.id ?? "primary"} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        title={label}
                        className="h-16 w-16 rounded-xl border border-border bg-stone-50 object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1 text-[10px] font-semibold text-stone-700">
                        {index + 1}
                      </span>
                      {extra ? (
                        <button
                          type="button"
                          aria-label={`Remove ${label}`}
                          onClick={() => onRemoveSticker(extra.id)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-xs leading-none text-white"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <PhotoUpload
                  variant="button"
                  buttonLabel="Add a photo"
                  remainingExtras={Math.max(0, 12 - designCount)}
                  onExtra={onAddSticker}
                />
              </div>
              <p className="text-sm text-muted">{designNote}</p>
            </fieldset>

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
                <legend className="text-sm font-medium">Per sheet</legend>
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
                <div className="grid grid-cols-3 gap-2">
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
          </div>
        )}
      </FlowStep>

      <FlowStep
        number={4}
        title="Download"
        hint="Save a high-resolution PNG with cut guides. It is ready to print."
        complete={ready}
      >
        <button
          type="button"
          onClick={() => void download()}
          disabled={!ready || downloading}
          className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? "Preparing print file…" : "Download sticker sheet"}
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
