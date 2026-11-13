"use client";
import { MakingProgress } from "@/components/MakingProgress";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { isPermanentUser } from "@/lib/auth-user";
import { SHEET_CUT_LINE } from "@/lib/copy";
import { reportContentHref } from "@/lib/legal";
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
  peekSheetBitmap,
  pinSheetBitmap,
  rememberSheetBitmap,
  unpinSheetBitmap,
} from "@/lib/sheet-bitmaps";
import {
  createDebouncedCallback,
  drawStickerSheetAsync,
  PREVIEW_DEBOUNCE_MS,
  pngBlobWithDpi,
  previewScale,
  SHEET_BACKGROUNDS,
  SHEET_COUNTS,
  SHEET_SIZES,
  sheetSizeLabel,
  waitForNextPaint,
  warmPrintDieCuts,
  yieldToBrowser,
  type SheetBackground,
  type SheetCount,
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
    throw new Error("We couldn't load the artwork for this sheet.");
  }

  if (!response.ok) {
    let detail = "We couldn't load the artwork for this sheet.";
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
      throw new Error("We couldn't read the saved artwork.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function waitForIdle(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => finish(), { timeout: 1200 });
      signal.addEventListener(
        "abort",
        () => {
          cancelIdleCallback(id);
          finish();
        },
        { once: true },
      );
      return;
    }
    const id = window.setTimeout(finish, 200);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        finish();
      },
      { once: true },
    );
  });
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
  autoDownload = false,
  onAutoDownloadDone,
  onSettings,
}: {
  artworks: string[];
  storedPhotoUrl: string | null;
  generatedUrl: string | null;
  generatedStyle: string | null;
  pendingStyles: number;
  preset: SheetPreset | null;
  onRequireSignIn?: () => void;
  sheetPhotos: { storedUrl: string | null; style: string | null; displayUrl: string }[];
  autoDownload?: boolean;
  onAutoDownloadDone?: () => void;
  onSettings?: (settings: { count: SheetCount; size: SheetSize; background: SheetBackground; padding: number }) => void;
}) {
  const { user, loading } = useAuth();
  const permanent = isPermanentUser(user);
  const downloadRef = useRef<() => Promise<void>>(async () => undefined);
  const autoStartedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinnedUrlsRef = useRef<string[]>([]);
  const previewDebounceRef = useRef(createDebouncedCallback(PREVIEW_DEBOUNCE_MS));
  const [count, setCount] = useState<SheetCount>(preset?.count ?? 9);
  const [size, setSize] = useState<SheetSize>(preset?.size ?? "a4");
  const [background, setBackground] = useState<SheetBackground>(preset?.background ?? "white");
  const [padding, setPadding] = useState(preset?.padding ?? 12);
  const [preview, setPreview] = useState({ count, size, padding });
  const [painted, setPainted] = useState({ count, size, padding });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [savedSheetId, setSavedSheetId] = useState<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    onSettings?.({ count, size, background, padding });
  }, [count, size, background, padding, onSettings]);

  useEffect(() => {
    downloadRef.current = download;
  });

  useEffect(() => {
    if (!autoDownload || autoStartedRef.current || loading || !permanent || !ready) {
      return;
    }
    autoStartedRef.current = true;
    onAutoDownloadDone?.();
    void downloadRef.current();
  }, [autoDownload, loading, permanent, ready, onAutoDownloadDone]);

  useEffect(() => {
    if (!preset) {
      return;
    }
    setCount(preset.count);
    setSize(preset.size);
    setBackground(preset.background);
    setPadding(preset.padding);
    setPreview({ count: preset.count, size: preset.size, padding: preset.padding });
  }, [preset]);

  useEffect(() => {
    if (preview.count === count && preview.size === size && preview.padding === padding) {
      return;
    }
    const gate = previewDebounceRef.current;
    gate.schedule(() => setPreview({ count, size, padding }));
    return () => gate.cancel();
  }, [count, size, padding, preview]);

  useEffect(() => {
    const pinned = pinnedUrlsRef;
    return () => {
      for (const url of pinned.current) {
        unpinSheetBitmap(url);
      }
      pinned.current = [];
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
    if (!permanent || !ready || !items || !savedKey || savedKey === lastSavedRef.current || savedKey === loadedKey) {
      return;
    }

    const snapshot = savedKey;

    const first = items[0];
    const label = items.length === 1 ? styleLabel(first.style) : null;
    const timer = window.setTimeout(() => {
      const supabase = createClient();
      // review_status, reviewed_at, and reviewed_by are intentionally omitted.
      // No sheet may be sent to print unless review_status = 'approved'.
      // Callers cannot set those columns (see the review migration).
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
        .select("id")
        .maybeSingle()
        .then(async ({ data: inserted, error: saveError }) => {
          let savedId = inserted?.id ?? null;
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
            const retry = await supabase.from("sheets").insert(payload).select("id").maybeSingle();
            error = retry.error;
            savedId = retry.data?.id ?? null;
          }
          if (error && missingStyleColumn(error)) {
            const { style: _style, ...withoutStyle } = payload;
            payload = withoutStyle;
            const retry = await supabase.from("sheets").insert(payload).select("id").maybeSingle();
            error = retry.error;
            savedId = retry.data?.id ?? null;
          }
          if (error && missingItemsColumn(error) && "items" in payload) {
            const { items: _items, ...withoutItems } = payload;
            const retry = await supabase.from("sheets").insert(withoutItems).select("id").maybeSingle();
            error = retry.error;
            savedId = retry.data?.id ?? null;
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
          if (typeof savedId === "string") {
            setSavedSheetId(savedId);
          }
          setSaveNote(label ? `Saved the ${label} sheet.` : "Saved. It's in My sheets.");
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [ready, permanent, savedKey, loadedKey]);
  const backgroundLabel = SHEET_BACKGROUNDS.find((item) => item.id === background)?.label ?? "White";
  const sizeLabel = sheetSizeLabel(size);

  useEffect(() => {
    if (!artworkUrls.length) {
      if (preset) {
        setError("This saved sheet is missing its image, so we can't preview or download it.");
        setReady(false);
      }
      return;
    }

    const urls = artworkUrls;
    const previewCount = preview.count;
    const previewSize = preview.size;
    const previewPadding = preview.padding;
    const controller = new AbortController();
    let cancelled = false;

    function adopt(bitmaps: ImageBitmap[]) {
      const canonical = bitmaps.map((bitmap, index) => rememberSheetBitmap(urls[index], bitmap));
      const next = [...new Set(urls)];
      const previous = new Set(pinnedUrlsRef.current);
      for (const url of next) {
        if (!previous.has(url)) {
          pinSheetBitmap(url);
        }
      }
      for (const url of pinnedUrlsRef.current) {
        if (!next.includes(url)) {
          unpinSheetBitmap(url);
        }
      }
      pinnedUrlsRef.current = next;
      return canonical;
    }

    async function render() {
      const fresh: ImageBitmap[] = [];
      try {
        setError(null);
        const settled = await Promise.allSettled(
          urls.map(async (url) => {
            const cached = peekSheetBitmap(url);
            if (cached) {
              return { bitmap: cached, fresh: false };
            }
            try {
              const bitmap = await loadSheetImage(url, controller.signal);
              fresh.push(bitmap);
              return { bitmap, fresh: true };
            } catch (error) {
              if (cancelled || controller.signal.aborted) {
                throw error;
              }
              const bitmap = await loadSheetImage(url, controller.signal);
              fresh.push(bitmap);
              return { bitmap, fresh: true };
            }
          }),
        );
        if (cancelled || controller.signal.aborted) {
          for (const bitmap of fresh) {
            if (!urls.some((url) => peekSheetBitmap(url) === bitmap)) {
              bitmap.close();
            }
          }
          return;
        }
        const rejected = settled.find((item) => item.status === "rejected");
        if (rejected && rejected.status === "rejected") {
          for (const bitmap of fresh) {
            if (!urls.some((url) => peekSheetBitmap(url) === bitmap)) {
              bitmap.close();
            }
          }
          throw rejected.reason;
        }
        const loaded: ImageBitmap[] = [];
        for (const item of settled) {
          if (item.status === "fulfilled") {
            loaded.push(item.value.bitmap);
          }
        }
        const artwork = adopt(loaded);

        const offscreen = document.createElement("canvas");
        const offscreenContext = offscreen.getContext("2d");
        if (!offscreenContext) {
          throw new Error("The sheet preview isn't on the page yet.");
        }

        await drawStickerSheetAsync(offscreenContext, artwork, {
          count: previewCount,
          size: previewSize,
          background,
          padding: previewPadding / 100,
          scale: previewScale(previewSize),
        }, {
          signal: controller.signal,
          afterSticker: () => yieldToBrowser(),
        });
        if (cancelled || controller.signal.aborted) {
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("The sheet preview isn't on the page yet.");
        }
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        context.drawImage(offscreen, 0, 0);
        setReady(true);
        setError(null);
        setPainted({ count: previewCount, size: previewSize, padding: previewPadding });

        void (async () => {
          await waitForIdle(controller.signal);
          if (cancelled || controller.signal.aborted) {
            return;
          }
          try {
            await warmPrintDieCuts(artwork, {
              count: previewCount,
              size: previewSize,
              padding: previewPadding / 100,
            }, {
              signal: controller.signal,
              afterSticker: () => waitForIdle(controller.signal),
            });
          } catch (error) {
            if (!cancelled && !controller.signal.aborted && !(error instanceof Error && error.name === "AbortError")) {
              console.error("[sheet] print preview", error);
            }
          }
        })();
      } catch (error) {
        if (cancelled || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          return;
        }
        setReady(false);
        setError(
          error instanceof Error && error.message
            ? error.message
            : "We couldn't build the sticker sheet.",
        );
      }
    }

    void render();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // artworkKey is the joined artwork URL list, so the preview reloads when a design is added or removed.
    // Count, size, and border are debounced through `preview` so the slider can move without a rebuild per tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkKey, preview, background, preset]);

  async function download() {
    if (!isPermanentUser(user)) {
      onRequireSignIn?.();
      return;
    }
    const gate = await fetch("/api/download-auth", { method: "POST" });
    if (!gate.ok) {
      onRequireSignIn?.();
      return;
    }

    const bitmaps = artworkUrls.map((url) => peekSheetBitmap(url));
    if (!ready || bitmaps.some((bitmap) => !bitmap)) {
      setError(
        imageUrl
          ? "The sheet isn't ready to download yet."
          : "This sheet has no artwork to download.",
      );
      return;
    }

    setDownloading(true);
    setError(null);
    await waitForNextPaint();
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        setError("We couldn't create the PNG. Open the sheet again and try the download once more.");
        return;
      }

      await drawStickerSheetAsync(
        context,
        bitmaps.filter((bitmap): bitmap is ImageBitmap => Boolean(bitmap)),
        {
          count,
          size,
          background,
          padding: padding / 100,
          scale: 1,
        },
        { afterSticker: () => yieldToBrowser() },
      );
      console.log("[sheet] download canvas", canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) {
        setError("We couldn't create the PNG. Open the sheet again and try the download once more.");
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
  const sheetNote = SHEET_CUT_LINE;
  const summaryParts = [
    `${count} stickers`,
    photoCount > 1 ? `${photoCount} photos` : null,
    sizeLabel,
    backgroundLabel,
    photoCount === 1 && styleForRow ? styleLabel(styleForRow) : null,
    "300 DPI",
  ].filter((part): part is string => Boolean(part));
  const controlsPending = painted.count !== count || painted.size !== size || painted.padding !== padding;
  const summary = !ready
    ? "Putting your sheet together…"
    : controlsPending
      ? "Updating the preview…"
      : pendingStyles > 0
        ? `Styling ${pendingStyles === 1 ? "1 photo" : `${pendingStyles} photos`}…`
        : summaryParts.join(", ");

  return (
    <section className="panel stack-lg">
      <h2>
        <span>2</span> Your sticker sheet
      </h2>
      <p className="muted">
        Pick a size and how many. Your sheet shows up right away and gets its new look the moment it&apos;s ready.
      </p>
      {!imageUrl ? (
        <div className="stack">
          <p>Your preview will show up here</p>
          <p className="muted">Add a photo to start the sheet.</p>
        </div>
      ) : (
        <div className="stack-lg">
          <div className="cut-layout">
            <div className="stack-lg">
              <fieldset className="stack">
                <legend>How many stickers</legend>
                <div className="count-row">
                  {SHEET_COUNTS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={count === option}
                      onClick={() => setCount(option)}
                      className="choice"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="stack">
                <legend>Sheet size</legend>
                <div className="count-row">
                  {SHEET_SIZES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={size === option.id}
                      onClick={() => setSize(option.id)}
                      className="choice"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="stack">
                <legend>Background</legend>
                <div className="count-row">
                  {SHEET_BACKGROUNDS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={background === option.id}
                      title={option.label}
                      onClick={() => setBackground(option.id)}
                      className={`swatch${option.color ? "" : " sheet-checker"}`}
                      style={option.color ? { backgroundColor: option.color } : undefined}
                    />
                  ))}
                </div>
                <p className="muted">{backgroundLabel}</p>
              </fieldset>

              <label className="stack">
                <span className="nav-actions">
                  Border
                  <span className="muted">
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
                  className="field"
                />
              </label>
            </div>

            <div className="stack">
              <div
                className={`sheet-frame${background === "transparent" ? " sheet-checker" : ""}`}
              >
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`${count} stickers on a ${sizeLabel} sheet`}
                  className="h-auto w-full"
                />
                {pendingStyles > 0 ? <MakingProgress count={pendingStyles} variant="overlay" /> : null}
              </div>
              <p className="muted">{sheetNote}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading || (permanent && (loading || !ready))}
            className="btn btn-primary btn-block"
          >
            {downloading ? "Getting the print file ready…" : "Download my sheet"}
          </button>
          <p className="text-center text-sm">
            <Link
              href={reportContentHref(savedSheetId ?? preset?.id)}
              className="font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent"
            >
              Report this content
            </Link>
          </p>
          {error ? (
            <p role="alert" className="alert">
              {error}
            </p>
          ) : (
            <div className="stack">
              <p className="muted" role="status">
                {summary}
              </p>
              {permanent && saveNote ? (
                <p
                  role={saveNote.startsWith("Couldn't") ? "alert" : "status"}
                  className={saveNote.startsWith("Couldn't") ? "alert" : "muted"}
                >
                  {saveNote}
                </p>
              ) : null}
              {!loading && !permanent ? (
                <p className="muted">Free to try. We only ask you to sign in when you download, and your photos stay put.</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
