import { SHEET_BACKGROUNDS, SHEET_COUNTS, SHEET_SIZES } from "@/lib/sticker-sheet";
import type { SheetBackground, SheetCount, SheetSize } from "@/lib/sticker-sheet";
import { styleIdFromUrl } from "@/lib/sticker-styles";

export const SHEET_COLUMNS =
  "id, source_image_url, photo_url, generated_url, source, style, sticker_count, sheet_size, background, padding, created_at";

export const SHEET_COLUMNS_WITHOUT_STYLE =
  "id, source_image_url, photo_url, generated_url, source, sticker_count, sheet_size, background, padding, created_at";

export type SheetRecord = {
  id: string;
  source_image_url: string;
  photo_url: string | null;
  generated_url: string | null;
  source: "photo" | "generated";
  style: string | null;
  sticker_count: SheetCount;
  sheet_size: SheetSize;
  background: SheetBackground;
  padding: number;
  created_at: string;
};

export type SheetPreset = {
  id: string;
  source: "photo" | "generated";
  style: string | null;
  count: SheetCount;
  size: SheetSize;
  background: SheetBackground;
  padding: number;
};

function isCount(value: number): value is SheetCount {
  return (SHEET_COUNTS as readonly number[]).includes(value);
}

function isSize(value: string): value is SheetSize {
  return SHEET_SIZES.some((item) => item.id === value);
}

function isBackground(value: string): value is SheetBackground {
  return SHEET_BACKGROUNDS.some((item) => item.id === value);
}

const STYLE_MARKER = "::";

export function packBackground(background: string, style: string | null) {
  if (!style) {
    return background;
  }
  return `${style}${STYLE_MARKER}${background}`;
}

export function unpackBackground(value: string) {
  const marker = value.indexOf(STYLE_MARKER);
  if (marker === -1) {
    return { style: null as string | null, background: value };
  }
  const style = value.slice(0, marker);
  const background = value.slice(marker + STYLE_MARKER.length);
  if (!style || !isBackground(background)) {
    return { style: null as string | null, background: value };
  }
  return { style, background };
}

export function missingStyleColumn(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }
  return (
    error.code === "PGRST204" ||
    (/style/i.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? ""))
  );
}

export function toSheetRecord(row: {
  id: string;
  source_image_url: string;
  photo_url: string | null;
  generated_url: string | null;
  source: string;
  style?: string | null;
  sticker_count: number;
  sheet_size: string;
  background: string;
  padding: number;
  created_at: string;
}): SheetRecord | null {
  const unpacked = unpackBackground(row.background);
  if (
    (row.source !== "photo" && row.source !== "generated") ||
    !isCount(row.sticker_count) ||
    !isSize(row.sheet_size) ||
    !isBackground(unpacked.background)
  ) {
    return null;
  }

  return {
    id: row.id,
    source_image_url: row.source_image_url,
    photo_url: row.photo_url,
    generated_url: row.generated_url,
    source: row.source,
    style:
      (typeof row.style === "string" && row.style.length > 0 ? row.style : null) ??
      unpacked.style ??
      styleIdFromUrl(row.generated_url) ??
      (row.source === "generated" ? styleIdFromUrl(row.source_image_url) : null),
    sticker_count: row.sticker_count,
    sheet_size: row.sheet_size,
    background: unpacked.background,
    padding: row.padding,
    created_at: row.created_at,
  };
}

export function presetFromRecord(record: SheetRecord): SheetPreset {
  return {
    id: record.id,
    source: record.source,
    style: record.style,
    count: record.sticker_count,
    size: record.sheet_size,
    background: record.background,
    padding: record.padding,
  };
}
