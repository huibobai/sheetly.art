/**
 * Pure helpers for moving a guest's private uploads onto a permanent account.
 * The route that calls these still checks both sessions. Nothing here talks to
 * the network, and nothing here grants extra access.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE_NAME = new RegExp(`^${UUID}\\.(?:jpg|png|webp)$`, "i");
const USER_ID = new RegExp(`^${UUID}$`, "i");

export const GUEST_TRANSFER_COOKIE = "sheetly_guest_transfer";
export const MAX_GUEST_OBJECTS = 30;

/** A single upload file name. Rejects folders, traversal, and unexpected extensions. */
export function guestObjectName(name: string): string | null {
  if (typeof name !== "string" || !name || name.length > 200) {
    return null;
  }
  if (name.includes("\\") || name.includes("..")) {
    return null;
  }
  const parts = name.split("/").filter((part) => part.length > 0);
  const base = parts[parts.length - 1];
  if (!base || !FILE_NAME.test(base)) {
    return null;
  }
  return base.toLowerCase();
}

export function isUserId(value: string): boolean {
  return USER_ID.test(value);
}

/**
 * Replace the owner folder in our private storage URL. Other hosts, including
 * fal.ai result URLs, are left unchanged. The match is a path segment, so a
 * similar string in a query is not enough.
 */
export function rewriteStorageOwner(value: string, fromId: string, toId: string): string {
  if (!isUserId(fromId) || !isUserId(toId)) {
    return value;
  }
  const from = fromId.toLowerCase();
  const to = toId.toLowerCase();
  if (from === to) {
    return value;
  }
  const pattern = new RegExp(`(/uploads_private/)${from}(/)`, "gi");
  return value.replace(pattern, `$1${to}$2`);
}

export type GuestSheetRow = {
  source_image_url: string;
  photo_url: string | null;
  generated_url: string | null;
  source: string;
  style: string | null;
  sticker_count: number;
  sheet_size: string;
  background: string;
  padding: number;
  items: unknown;
};

function rewriteMaybe(value: string | null, fromId: string, toId: string): string | null {
  if (!value) {
    return value;
  }
  return rewriteStorageOwner(value, fromId, toId);
}

function rewriteItems(items: unknown, fromId: string, toId: string): unknown {
  if (!Array.isArray(items)) {
    return items ?? null;
  }
  return items.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const record = entry as { photoUrl?: unknown; imageUrl?: unknown; style?: unknown };
    return {
      ...record,
      photoUrl: typeof record.photoUrl === "string" ? rewriteStorageOwner(record.photoUrl, fromId, toId) : record.photoUrl,
      imageUrl: typeof record.imageUrl === "string" ? rewriteStorageOwner(record.imageUrl, fromId, toId) : record.imageUrl,
    };
  });
}

/** Sheet row ready to insert as the permanent user. URLs that pointed at the guest folder now point at the new one. */
export function rewriteSheetRow(row: GuestSheetRow, fromId: string, toId: string): GuestSheetRow {
  return {
    source_image_url: rewriteStorageOwner(row.source_image_url, fromId, toId),
    photo_url: rewriteMaybe(row.photo_url, fromId, toId),
    generated_url: rewriteMaybe(row.generated_url, fromId, toId),
    source: row.source,
    style: row.style,
    sticker_count: row.sticker_count,
    sheet_size: row.sheet_size,
    background: rewriteStorageOwner(row.background, fromId, toId),
    padding: row.padding,
    items: rewriteItems(row.items, fromId, toId),
  };
}

export function sameSheetIdentity(left: { photo_url: string | null; source_image_url: string }, right: { photo_url: string | null; source_image_url: string }): boolean {
  return left.photo_url === right.photo_url && left.source_image_url === right.source_image_url;
}
