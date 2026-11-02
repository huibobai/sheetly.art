"use client";

import { useEffect, useRef, useState } from "react";
import { sheetItems, type SheetRecord } from "@/lib/sheets";
import { drawStickerSheet, sheetPixels } from "@/lib/sticker-sheet";
import { urlWithoutStyle } from "@/lib/sticker-styles";

export function SheetThumbnail({ sheet }: { sheet: SheetRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const items = sheetItems(sheet);
  const itemKey = items.map((item) => `${item.photoUrl}|${item.imageUrl}|${item.style ?? ""}`).join("\n");
  const fallbackUrl = urlWithoutStyle(items[0]?.imageUrl || sheet.generated_url || sheet.source_image_url);

  useEffect(() => {
    if (!items.length) {
      setFailed(true);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const bitmaps: ImageBitmap[] = [];

    async function render() {
      try {
        for (const item of items) {
          const response = await fetch(`/api/sheet-image?url=${encodeURIComponent(item.imageUrl)}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error("Could not load a saved photo.");
          }
          const bitmap = await createImageBitmap(await response.blob());
          if (cancelled) {
            bitmap.close();
            return;
          }
          bitmaps.push(bitmap);
        }
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("Could not draw the sheet preview.");
        }
        const page = sheetPixels(sheet.sheet_size);
        drawStickerSheet(context, bitmaps, {
          count: sheet.sticker_count,
          size: sheet.sheet_size,
          background: sheet.background,
          padding: sheet.padding / 100,
          scale: 420 / Math.max(page.width, page.height),
        });
        if (!cancelled) {
          setFailed(false);
        }
      } catch {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setFailed(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
      controller.abort();
      for (const bitmap of bitmaps) {
        bitmap.close();
      }
    };
  }, [itemKey, items.length, sheet.background, sheet.padding, sheet.sheet_size, sheet.sticker_count]);

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fallbackUrl} alt="" className="h-full w-full object-contain" />
    );
  }

  return <canvas ref={canvasRef} aria-hidden="true" className="max-h-full max-w-full" />;
}
