/**
 * Sheet snapshot kept across the Google redirect.
 * Session storage only, same tab. References and settings, never tokens.
 * Versioned so an older or newer payload is dropped instead of half-applied.
 */

// Keep these in step with SHEET_COUNTS, SHEET_SIZES, and SHEET_BACKGROUNDS.
const SHEET_COUNTS = [4, 6, 9, 12];
const SHEET_SIZES = ["square", "a4", "4x6"];
const SHEET_BACKGROUNDS = ["white", "transparent", "blush", "mint", "lilac", "butter"];

export const SHEET_STATE_VERSION = 1;
export const SHEET_STATE_STORAGE_KEY = "sheetly.sheet-state.v1";
const MAX_CHARS = 80_000;
const MAX_PHOTOS = 12;

export type SheetStateIntent = "download" | "save" | "limit" | "header";

export type SheetStatePhoto = {
  id: string;
  storedUrl: string;
  style: string | null;
  results: Record<string, string>;
};

export type SheetStateSettings = {
  count: number;
  size: string;
  background: string;
  padding: number;
};

export type SheetState = {
  version: typeof SHEET_STATE_VERSION;
  intent: SheetStateIntent;
  guestUserId: string | null;
  photos: SheetStatePhoto[];
  selectedId: string | null;
  settings: SheetStateSettings;
};

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const INTENTS = new Set<SheetStateIntent>(["download", "save", "limit", "header"]);

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) {
    return null;
  }
  try {
    const url = new URL(value.split("#")[0]);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function validSettings(value: unknown): SheetStateSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { count?: unknown; size?: unknown; background?: unknown; padding?: unknown };
  const count = record.count;
  const size = record.size;
  const background = record.background;
  const padding = record.padding;
  if (typeof count !== "number" || !SHEET_COUNTS.includes(count)) {
    return null;
  }
  if (typeof size !== "string" || !SHEET_SIZES.includes(size)) {
    return null;
  }
  if (typeof background !== "string" || !SHEET_BACKGROUNDS.includes(background)) {
    return null;
  }
  if (typeof padding !== "number" || !Number.isInteger(padding) || padding < 0 || padding > 28) {
    return null;
  }
  return { count, size, background, padding };
}

function validPhoto(value: unknown): SheetStatePhoto | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { id?: unknown; storedUrl?: unknown; style?: unknown; results?: unknown };
  if (typeof record.id !== "string" || !record.id || record.id.length > 80) {
    return null;
  }
  const storedUrl = httpsUrl(record.storedUrl);
  if (!storedUrl) {
    return null;
  }
  const style = record.style === null || record.style === undefined
    ? null
    : typeof record.style === "string" && record.style.length > 0 && record.style.length < 40
      ? record.style
      : null;
  if (record.style !== null && record.style !== undefined && style === null) {
    return null;
  }
  const results: Record<string, string> = {};
  if (record.results && typeof record.results === "object" && !Array.isArray(record.results)) {
    for (const [key, url] of Object.entries(record.results as Record<string, unknown>)) {
      const parsed = httpsUrl(url);
      if (!parsed || key.length > 40) {
        continue;
      }
      results[key] = parsed;
    }
  }
  return { id: record.id, storedUrl, style, results };
}

export function buildSheetState(input: {
  intent: SheetStateIntent;
  guestUserId: string | null;
  photos: { id: string; storedUrl: string | null; style: string | null; results: Partial<Record<string, string>> }[];
  selectedId: string | null;
  settings: SheetStateSettings;
}): { ok: true; value: SheetState } | { ok: false; reason: "no-stored-photos" | "too-large" | "invalid" } {
  const settings = validSettings(input.settings);
  if (!settings) {
    return { ok: false, reason: "invalid" };
  }
  const photos: SheetStatePhoto[] = [];
  for (const photo of input.photos) {
    const parsed = validPhoto(photo);
    if (parsed) {
      photos.push(parsed);
    }
    if (photos.length >= MAX_PHOTOS) {
      break;
    }
  }
  if (!photos.length && (input.intent === "download" || input.intent === "limit")) {
    return { ok: false, reason: "no-stored-photos" };
  }
  const guestUserId = typeof input.guestUserId === "string" && input.guestUserId.length > 0 && input.guestUserId.length < 80
    ? input.guestUserId
    : null;
  const selectedId = photos.some((photo) => photo.id === input.selectedId) ? input.selectedId : photos[0]?.id ?? null;
  const value: SheetState = {
    version: SHEET_STATE_VERSION,
    intent: input.intent,
    guestUserId,
    photos,
    selectedId,
    settings,
  };
  if (serializeSheetState(value) === null) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, value };
}

export function serializeSheetState(value: SheetState): string | null {
  if (value.version !== SHEET_STATE_VERSION) {
    return null;
  }
  const json = JSON.stringify({
    version: value.version,
    intent: value.intent,
    guestUserId: value.guestUserId,
    photos: value.photos,
    selectedId: value.selectedId,
    settings: value.settings,
  });
  if (json.length > MAX_CHARS) {
    return null;
  }
  return json;
}

export function parseSheetState(
  raw: string,
): { ok: true; value: SheetState } | { ok: false; reason: "empty" | "invalid" | "version" | "too-large" } {
  if (!raw || !raw.trim()) {
    return { ok: false, reason: "empty" };
  }
  if (raw.length > MAX_CHARS) {
    return { ok: false, reason: "too-large" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid" };
  }
  const record = parsed as { version?: unknown; intent?: unknown; guestUserId?: unknown; photos?: unknown; selectedId?: unknown; settings?: unknown };
  if (record.version !== SHEET_STATE_VERSION) {
    return { ok: false, reason: "version" };
  }
  if (typeof record.intent !== "string" || !INTENTS.has(record.intent as SheetStateIntent)) {
    return { ok: false, reason: "invalid" };
  }
  const settings = validSettings(record.settings);
  if (!settings || !Array.isArray(record.photos)) {
    return { ok: false, reason: "invalid" };
  }
  const photos: SheetStatePhoto[] = [];
  for (const entry of record.photos) {
    const photo = validPhoto(entry);
    if (photo) {
      photos.push(photo);
    }
    if (photos.length >= MAX_PHOTOS) {
      break;
    }
  }
  if (!photos.length && (record.intent === "download" || record.intent === "limit")) {
    return { ok: false, reason: "invalid" };
  }
  const guestUserId = typeof record.guestUserId === "string" && record.guestUserId.length > 0 && record.guestUserId.length < 80
    ? record.guestUserId
    : null;
  const selectedId = typeof record.selectedId === "string" && photos.some((photo) => photo.id === record.selectedId)
    ? record.selectedId
    : photos[0]?.id ?? null;
  return {
    ok: true,
    value: {
      version: SHEET_STATE_VERSION,
      intent: record.intent as SheetStateIntent,
      guestUserId,
      photos,
      selectedId,
      settings,
    },
  };
}

export function saveSheetState(storage: MemoryStorage, value: SheetState): boolean {
  const json = serializeSheetState(value);
  if (!json) {
    return false;
  }
  storage.setItem(SHEET_STATE_STORAGE_KEY, json);
  return true;
}

export function loadSheetState(
  storage: MemoryStorage,
): { ok: true; value: SheetState } | { ok: false; reason: "empty" | "invalid" | "version" | "too-large" } {
  const raw = storage.getItem(SHEET_STATE_STORAGE_KEY);
  if (raw === null) {
    return { ok: false, reason: "empty" };
  }
  return parseSheetState(raw);
}

export function clearSheetState(storage: MemoryStorage) {
  storage.removeItem(SHEET_STATE_STORAGE_KEY);
}
