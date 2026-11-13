"use client";

import { useEffect, useRef, useState } from "react";
import { peekSheetBitmap } from "@/lib/sheet-bitmaps";
import { sheetItems, type SheetRecord } from "@/lib/sheets";
import { drawStickerSheetAsync, sheetPixels, yieldToBrowser } from "@/lib/sticker-sheet";
import { urlWithoutStyle } from "@/lib/sticker-styles";

async function loadBitmap(url: string, signal: AbortSignal) {
  const response = await fetch(`/api/sheet-image?url=${encodeURIComponent(url)}`, { signal });
  if (!response.ok) {
    throw new Error("Could not load a saved photo.");
  }
  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("The saved photo is empty.");
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
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export function SheetThumbnail({ sheet }: { sheet: SheetRecord }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const items = sheetItems(sheet);
  const itemKey = items.map((item) => `${item.photoUrl}|${item.imageUrl}|${item.style ?? ""}`).join("\n");
  const fallbackUrl = urlWithoutStyle(items[0]?.imageUrl || sheet.generated_url || sheet.source_image_url || "");
  const [src, setSrc] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const photos = sheetItems(sheet);
    const photoUrl = fallbackUrl;
    if (!photos.length || !photoUrl) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const owned: ImageBitmap[] = [];

    async function render() {
      try {
        const settled = await Promise.allSettled(
          photos.map(async (item) => {
            const cached = peekSheetBitmap(item.imageUrl);
            if (cached) {
              return { bitmap: cached, owned: false };
            }
            const bitmap = await loadBitmap(item.imageUrl, controller.signal);
            owned.push(bitmap);
            return { bitmap, owned: true };
          }),
        );
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const rejected = settled.find((item) => item.status === "rejected");
        if (rejected && rejected.status === "rejected") {
          throw rejected.reason;
        }
        const bitmaps = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value.bitmap] : []));
        if (!bitmaps.length) {
          return;
        }

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not draw the sheet preview.");
        }
        const page = sheetPixels(sheet.sheet_size);
        await drawStickerSheetAsync(
          context,
          bitmaps,
          {
            count: sheet.sticker_count,
            size: sheet.sheet_size,
            background: sheet.background,
            padding: sheet.padding / 100,
            scale: 480 / Math.max(page.width, page.height),
          },
          {
            signal: controller.signal,
            afterSticker: () => yieldToBrowser(),
          },
        );
        if (cancelled || canvas.width < 2 || canvas.height < 2) {
          return;
        }
        const preview = canvas.toDataURL("image/png");
        if (!cancelled && preview.startsWith("data:image/")) {
          setSrc(preview);
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setSrc(photoUrl);
        }
      } finally {
        for (const bitmap of owned) {
          if (!photos.some((item) => peekSheetBitmap(item.imageUrl) === bitmap)) {
            bitmap.close();
          }
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visible, itemKey, fallbackUrl, sheet]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Sticker sheet preview"
          className="absolute inset-0 h-full w-full object-contain p-3"
          onError={() => {
            setSrc((current) => {
              if (!fallbackUrl) {
                return current;
              }
              if (current.startsWith("data:")) {
                return fallbackUrl;
              }
              const proxy = `/api/sheet-image?url=${encodeURIComponent(fallbackUrl)}`;
              if (current === fallbackUrl) {
                return proxy;
              }
              return current;
            });
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-paper-2" aria-hidden="true" />
      )}
    </div>
  );
}
