import { SHEET_BACKGROUNDS, SHEET_COUNTS, SHEET_SIZES } from "@/lib/sticker-sheet";
import type { SheetBackground, SheetCount, SheetSize } from "@/lib/sticker-sheet";
import { isStickerStyle, styleIdFromUrl, urlWithoutStyle } from "@/lib/sticker-styles";

export const SHEET_COLUMNS =
  "id, source_image_url, photo_url, generated_url, source, style, sticker_count, sheet_size, background, padding, created_at, items";

export const SHEET_COLUMNS_WITHOUT_ITEMS =
  "id, source_image_url, photo_url, generated_url, source, style, sticker_count, sheet_size, background, padding, created_at";

export const SHEET_COLUMNS_WITHOUT_STYLE =
  "id, source_image_url, photo_url, generated_url, source, sticker_count, sheet_size, background, padding, created_at";

export type SheetItem = {
  photoUrl: string;
  imageUrl: string;
  style: string | null;
};

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
  items: SheetItem[];
};

export type SheetPreset = {
  id: string;
  source: "photo" | "generated";
  style: string | null;
  count: SheetCount;
  size: SheetSize;
  background: SheetBackground;
  padding: number;
  items: SheetItem[];
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
const ITEMS_MARKER = "\n";

function httpsUrl(value: unknown) {
  if (typeof value !== "string") {
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

export function parseSheetItems(value: unknown): SheetItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: SheetItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as { photoUrl?: unknown; imageUrl?: unknown; style?: unknown };
    const photoUrl = httpsUrl(record.photoUrl);
    const imageUrl = httpsUrl(record.imageUrl);
    if (!photoUrl || !imageUrl) {
      continue;
    }
    const style = typeof record.style === "string" && isStickerStyle(record.style) ? record.style : null;
    items.push({ photoUrl, imageUrl, style });
  }
  return items;
}

export function packBackground(background: string, style: string | null, items: SheetItem[] = []) {
  const head = style ? `${style}${STYLE_MARKER}${background}` : background;
  if (!items.length) {
    return head;
  }
  return `${head}${ITEMS_MARKER}${JSON.stringify(items)}`;
}

export function unpackBackground(value: string) {
  const splitAt = value.indexOf(ITEMS_MARKER);
  const head = splitAt === -1 ? value : value.slice(0, splitAt);
  const items = splitAt === -1 ? [] : parseSheetItems(safeJson(value.slice(splitAt + ITEMS_MARKER.length)));
  const marker = head.indexOf(STYLE_MARKER);
  if (marker === -1) {
    return { style: null as string | null, background: head, items };
  }
  const style = head.slice(0, marker);
  const background = head.slice(marker + STYLE_MARKER.length);
  if (!style || !isBackground(background)) {
    return { style: null as string | null, background: head, items };
  }
  return { style, background, items };
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function sheetSnapshot(input: {
  items: SheetItem[];
  count: number;
  size: string;
  background: string;
  padding: number;
}) {
  return JSON.stringify({
    items: input.items.map((item) => ({
      photoUrl: item.photoUrl,
      imageUrl: item.imageUrl,
      style: item.style,
    })),
    count: input.count,
    size: input.size,
    background: input.background,
    padding: input.padding,
  });
}

function missingColumn(error: { message?: string; code?: string } | null, column: string) {
  if (!error) {
    return false;
  }
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" || /column|schema cache/i.test(message)) &&
    new RegExp(column, "i").test(message)
  );
}

export function missingStyleColumn(error: { message?: string; code?: string } | null) {
  return missingColumn(error, "style");
}

export function missingItemsColumn(error: { message?: string; code?: string } | null) {
  return missingColumn(error, "items");
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
  items?: unknown;
}): SheetRecord | null {
  const unpacked = unpackBackground(row.background);
  const columnItems = parseSheetItems(row.items);
  const items = columnItems.length ? columnItems : unpacked.items;
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
    items,
  };
}

export function sheetItems(record: SheetRecord): SheetItem[] {
  if (record.items.length) {
    return record.items;
  }
  const imageUrl = httpsUrl(urlWithoutStyle(record.generated_url || record.source_image_url));
  const photoUrl = httpsUrl(urlWithoutStyle(record.photo_url || record.source_image_url)) ?? imageUrl;
  if (!imageUrl || !photoUrl) {
    return [];
  }
  const style = record.style && isStickerStyle(record.style) ? record.style : null;
  return [{ photoUrl, imageUrl, style }];
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
    items: sheetItems(record),
  };
}
