"use client";

import { useEffect, useRef, useState } from "react";
import { sheetItems, type SheetRecord } from "@/lib/sheets";
import { drawStickerSheet, sheetPixels } from "@/lib/sticker-sheet";
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
  const items = sheetItems(sheet);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const itemKey = items.map((item) => `${item.photoUrl}|${item.imageUrl}|${item.style ?? ""}`).join("\n");
  const fallbackUrl = urlWithoutStyle(items[0]?.imageUrl || sheet.generated_url || sheet.source_image_url || "");
  const [src, setSrc] = useState(fallbackUrl);

  useEffect(() => {
    const photos = itemsRef.current;
    const photoUrl = fallbackUrl;
    setSrc(photoUrl);
    if (!photos.length || !photoUrl) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const bitmaps: ImageBitmap[] = [];

    async function render() {
      try {
        for (const item of photos) {
          const bitmap = await loadBitmap(item.imageUrl, controller.signal);
          if (cancelled) {
            bitmap.close();
            return;
          }
          bitmaps.push(bitmap);
        }
        if (cancelled || !bitmaps.length) {
          return;
        }

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not draw the sheet preview.");
        }
        const page = sheetPixels(sheet.sheet_size);
        drawStickerSheet(context, bitmaps, {
          count: sheet.sticker_count,
          size: sheet.sheet_size,
          background: sheet.background,
          padding: sheet.padding / 100,
          scale: 480 / Math.max(page.width, page.height),
        });
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
        for (const bitmap of bitmaps) {
          bitmap.close();
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [itemKey, fallbackUrl, sheet.background, sheet.padding, sheet.sheet_size, sheet.sticker_count]);

  if (!src) {
    return <div className="absolute inset-0 bg-stone-200" />;
  }

  return (
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
  );
}
