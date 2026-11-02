"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  missingItemsColumn,
  missingStyleColumn,
  packBackground,
  sheetSnapshot,
  type SheetItem,
  type SheetPreset,
} from "@/lib/sheets";
import { isStickerStyle, styleLabel } from "@/lib/sticker-styles";
import {
  drawStickerSheet,
  pngBlobWithDpi,
  previewScale,
  SHEET_BACKGROUNDS,
  SHEET_COUNTS,
  SHEET_SIZES,
  sheetSizeLabel,
  type SheetBackground,
  type SheetCount,
  type SheetImage,
  type SheetSize,
} from "@/lib/sticker-sheet";
import { createClient } from "@/lib/supabase/client";

function httpsUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const url = value.split("#")[0];
  try {
    if (new URL(url).protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  return url;
}

function durableSheetItems(
  photos: { storedUrl: string | null; style: string | null; displayUrl: string }[],
): SheetItem[] | null {
  if (!photos.length) {
    return null;
  }
  const items: SheetItem[] = [];
  for (const photo of photos) {
    const photoUrl = httpsUrl(photo.storedUrl);
    if (!photoUrl) {
      return null;
    }
    const style = photo.style && isStickerStyle(photo.style) ? photo.style : null;
    const imageUrl = style ? httpsUrl(photo.displayUrl) : photoUrl;
    if (!imageUrl) {
      return null;
    }
    items.push({ photoUrl, imageUrl, style });
  }
  return items;
}

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
  artworks,
  storedPhotoUrl,
  generatedUrl,
  generatedStyle,
  pendingStyles,
  preset,
  onRequireSignIn,
  sheetPhotos,
}: {
  artworks: string[];
  storedPhotoUrl: string | null;
  generatedUrl: string | null;
  generatedStyle: string | null;
  pendingStyles: number;
  preset: SheetPreset | null;
  onRequireSignIn?: () => void;
  sheetPhotos: { storedUrl: string | null; style: string | null; displayUrl: string }[];
}) {
  const { user, loading } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const [count, setCount] = useState<SheetCount>(preset?.count ?? 9);
  const [size, setSize] = useState<SheetSize>(preset?.size ?? "a4");
  const [background, setBackground] = useState<SheetBackground>(preset?.background ?? "white");
  const [padding, setPadding] = useState(preset?.padding ?? 12);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!preset) {
      return;
    }
    setCount(preset.count);
    setSize(preset.size);
    setBackground(preset.background);
    setPadding(preset.padding);
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

  const artworkUrls = artworks.filter((url) => url.length > 0);
  const artworkKey = artworkUrls.join("\n");
  const generatedImage = generatedUrl?.startsWith("https://") ? generatedUrl.split("#")[0] : null;
  const styleForRow =
    generatedImage && generatedStyle && isStickerStyle(generatedStyle) ? generatedStyle : null;
  const imageUrl = artworkUrls[0] ?? null;

  const savedItems = durableSheetItems(sheetPhotos);
  const savedItemsRef = useRef(savedItems);
  savedItemsRef.current = savedItems;
  const savedKey = savedItems ? sheetSnapshot({ items: savedItems, count, size, background, padding }) : "";
  const loadedKey = preset
    ? sheetSnapshot({
        items: preset.items,
        count: preset.count,
        size: preset.size,
        background: preset.background,
        padding: preset.padding,
      })
    : "";

  useEffect(() => {
    const items = savedItemsRef.current;
    if (!user || !ready || !items || !savedKey || savedKey === lastSavedRef.current || savedKey === loadedKey) {
      return;
    }

    const snapshot = savedKey;

    const first = items[0];
    const label = items.length === 1 ? styleLabel(first.style) : null;
    const timer = window.setTimeout(() => {
      const supabase = createClient();
      const row = {
        source_image_url: first.imageUrl,
        photo_url: first.photoUrl,
        generated_url: first.style ? first.imageUrl : null,
        source: items.some((item) => item.style) ? "generated" : "photo",
        style: first.style,
        sticker_count: count,
        sheet_size: size,
        background: packBackground(background, null, items),
        padding,
        items,
      };
      console.log("[sheets] save", { photos: items.length, style: row.style });
      void supabase
        .from("sheets")
        .insert(row)
        .then(async ({ error: saveError }) => {
          let payload: {
            source_image_url: string;
            photo_url: string;
            generated_url: string | null;
            source: string;
            style?: string | null;
            sticker_count: number;
            sheet_size: string;
            background: string;
            padding: number;
            items?: SheetItem[];
          } = row;
          let error = saveError;
          if (error && missingItemsColumn(error)) {
            const { items: _items, ...withoutItems } = payload;
            payload = withoutItems;
            const retry = await supabase.from("sheets").insert(payload);
            error = retry.error;
          }
          if (error && missingStyleColumn(error)) {
            const { style: _style, ...withoutStyle } = payload;
            payload = withoutStyle;
            const retry = await supabase.from("sheets").insert(payload);
            error = retry.error;
          }
          if (error && missingItemsColumn(error) && "items" in payload) {
            const { items: _items, ...withoutItems } = payload;
            const retry = await supabase.from("sheets").insert(withoutItems);
            error = retry.error;
          }
          if (error) {
            console.error("[sheets] save failed", {
              photos: items.length,
              style: row.style,
              message: error.message,
              code: error.code,
            });
            setSaveNote(
              label
                ? `Couldn't save the ${label} sheet. ${error.message}`
                : `Couldn't save this sheet. ${error.message}`,
            );
            return;
          }
          lastSavedRef.current = snapshot;
          setSaveNote(label ? `Saved the ${label} sheet.` : "Saved to My sheets.");
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [ready, user, savedKey, loadedKey]);
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
    if (!user) {
      onRequireSignIn?.();
      return;
    }

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

  const photoCount = artworkUrls.length;
  const sheetNote =
    photoCount <= 1
      ? "This photo repeats as a die-cut sticker. Dashed lines follow the white edge."
      : photoCount >= count
        ? "Each photo is its own die-cut sticker. Dashed lines follow the white edge."
        : "Photos fill the sheet in order, then repeat. Dashed lines follow the white edge.";
  const summaryParts = [
    `${count} stickers`,
    photoCount > 1 ? `${photoCount} photos` : null,
    sizeLabel,
    backgroundLabel,
    photoCount === 1 && styleForRow ? styleLabel(styleForRow) : null,
    "300 DPI",
  ].filter((part): part is string => Boolean(part));
  const summary = !ready
    ? "Preparing your sheet…"
    : pendingStyles > 0
      ? `Updating ${pendingStyles === 1 ? "1 style" : `${pendingStyles} styles`}…`
      : summaryParts.join(" · ");

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight">Sticker sheet</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Choose a size and how many stickers. The preview updates as styles finish.
      </p>
      {!imageUrl ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-stone-50 px-6 py-14 text-center">
          <p className="text-sm font-medium">Your preview will show up here</p>
          <p className="mt-1 text-sm text-muted">Upload a photo to start the sheet.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">How many</legend>
                <div className="grid grid-cols-4 gap-2">
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
                  <span className="font-normal text-muted">
                    {padding === 0 ? "Thin" : padding >= 22 ? "Wide" : "White edge"}
                  </span>
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
              <p className="text-center text-sm text-muted">{sheetNote}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void download()}
            disabled={Boolean(user) && (loading || !ready || downloading)}
            className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? "Preparing print file…" : "Download sticker sheet"}
          </button>
          {error ? (
            <p role="alert" className="text-center text-sm text-red-600">
              {error}
            </p>
          ) : (
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted" role="status">
                {summary}
              </p>
              {user && saveNote ? (
                <p
                  role={saveNote.startsWith("Couldn't") ? "alert" : "status"}
                  className={`text-sm ${saveNote.startsWith("Couldn't") ? "text-red-600" : "text-muted"}`}
                >
                  {saveNote}
                </p>
              ) : null}
              {!loading && !user ? (
                <p className="text-sm text-muted">Sign in to download this sheet or add more photos.</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
