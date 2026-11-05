/**
 * Copy private uploads and sheet rows from an anonymous user to a permanent one.
 *
 * No service-role key is used. This repo does not have one, and this file does
 * not add one. Each call sends the caller's own access token:
 * - the guest token can list, download, and delete only uploads_private/{guest id}/
 * - the permanent token can upload only into uploads_private/{new id}/ and insert
 *   sheets for auth.uid()
 * Storage policies and the sheets RLS policies do the authorization.
 *
 * The copy is idempotent. An object that is already in the new folder counts as
 * success. A sheet whose photo URL is already on the new account is not inserted
 * again. Guest rows are deleted only after the new row is in place (or already was).
 */

import { PRIVATE_UPLOADS_BUCKET } from "@/lib/image-source";
import { readBodyWithLimit } from "@/lib/read-limited";
import {
  guestObjectName,
  isUserId,
  MAX_GUEST_OBJECTS,
  rewriteSheetRow,
  sameSheetIdentity,
  type GuestSheetRow,
} from "@/lib/guest-migrate";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const MAX_OBJECT_BYTES = 10 * 1024 * 1024;

const SHEET_COLUMNS = [
  "id",
  "source_image_url",
  "photo_url",
  "generated_url",
  "source",
  "style",
  "sticker_count",
  "sheet_size",
  "background",
  "padding",
  "items",
].join(",");

export type GuestMoveResult = {
  filesCopied: number;
  sheetsCopied: number;
  sheetsNote: string | null;
};

function headers(token: string, extra?: Record<string, string>) {
  return {
    apikey: supabaseAnonKey(),
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

function root() {
  return supabaseUrl().replace(/\/$/, "");
}

type ListedObject = { name?: string };

async function listGuestFiles(guestToken: string, guestId: string): Promise<{ names: string[]; error: string | null }> {
  const response = await fetch(`${root()}/storage/v1/object/list/${PRIVATE_UPLOADS_BUCKET}`, {
    method: "POST",
    headers: headers(guestToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: `${guestId}/`, limit: 100, offset: 0 }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { names: [], error: "list" };
  }
  const rows = (await response.json()) as ListedObject[];
  const names: string[] = [];
  for (const row of rows) {
    const name = guestObjectName(row.name ?? "");
    if (name) {
      names.push(name);
    }
    if (names.length >= MAX_GUEST_OBJECTS) {
      break;
    }
  }
  return { names, error: null };
}

async function downloadGuestFile(guestToken: string, path: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const response = await fetch(`${root()}/storage/v1/object/${PRIVATE_UPLOADS_BUCKET}/${path}`, {
    headers: headers(guestToken),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  try {
    const bytes = await readBodyWithLimit(response.body, MAX_OBJECT_BYTES, response.headers.get("content-length"));
    return { bytes, contentType };
  } catch {
    return null;
  }
}

async function uploadPermanentFile(
  permanentToken: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<"copied" | "exists" | "failed"> {
  const body = new Uint8Array(bytes);
  const response = await fetch(`${root()}/storage/v1/object/${PRIVATE_UPLOADS_BUCKET}/${path}`, {
    method: "POST",
    headers: headers(permanentToken, {
      "Content-Type": contentType,
      "cache-control": "max-age=3600",
      "x-upsert": "false",
    }),
    body,
  });
  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return "copied";
  }
  const text = await response.text().catch(() => "");
  if (response.status === 409 || /already exists|duplicate/i.test(text)) {
    return "exists";
  }
  return "failed";
}

async function deleteGuestFile(guestToken: string, path: string) {
  await fetch(`${root()}/storage/v1/object/${PRIVATE_UPLOADS_BUCKET}`, {
    method: "DELETE",
    headers: headers(guestToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [path] }),
  }).then(async (response) => {
    await response.body?.cancel().catch(() => undefined);
  }).catch(() => undefined);
}

type SheetRecord = GuestSheetRow & { id?: string };

async function selectSheets(token: string, userId: string): Promise<{ rows: SheetRecord[]; error: boolean }> {
  const response = await fetch(
    `${root()}/rest/v1/sheets?user_id=eq.${userId}&select=${SHEET_COLUMNS}`,
    { headers: headers(token, { Accept: "application/json" }) },
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { rows: [], error: true };
  }
  const rows = (await response.json()) as SheetRecord[];
  return { rows: Array.isArray(rows) ? rows : [], error: false };
}

async function insertSheet(permanentToken: string, row: GuestSheetRow): Promise<boolean> {
  const response = await fetch(`${root()}/rest/v1/sheets`, {
    method: "POST",
    headers: headers(permanentToken, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(row),
  });
  await response.body?.cancel().catch(() => undefined);
  return response.ok;
}

async function deleteSheet(guestToken: string, id: string) {
  if (!isUserId(id)) {
    return;
  }
  await fetch(`${root()}/rest/v1/sheets?id=eq.${id}`, {
    method: "DELETE",
    headers: headers(guestToken),
  }).then(async (response) => {
    await response.body?.cancel().catch(() => undefined);
  }).catch(() => undefined);
}

export async function moveGuestData(input: {
  guestToken: string;
  guestId: string;
  permanentToken: string;
  permanentId: string;
}): Promise<GuestMoveResult> {
  if (!isUserId(input.guestId) || !isUserId(input.permanentId) || input.guestId === input.permanentId) {
    return { filesCopied: 0, sheetsCopied: 0, sheetsNote: null };
  }

  let filesCopied = 0;
  const listed = await listGuestFiles(input.guestToken, input.guestId);
  if (!listed.error) {
    for (const name of listed.names) {
      const fromPath = `${input.guestId}/${name}`;
      const toPath = `${input.permanentId}/${name}`;
      const file = await downloadGuestFile(input.guestToken, fromPath);
      if (!file) {
        continue;
      }
      const uploaded = await uploadPermanentFile(input.permanentToken, toPath, file.bytes, file.contentType);
      if (uploaded === "failed") {
        continue;
      }
      filesCopied += 1;
      await deleteGuestFile(input.guestToken, fromPath);
    }
  }

  const guestSheets = await selectSheets(input.guestToken, input.guestId);
  if (guestSheets.error) {
    return {
      filesCopied,
      sheetsCopied: 0,
      sheetsNote: "Photos were moved where we could. Saved sheet rows could not be read from the guest session.",
    };
  }
  const existing = await selectSheets(input.permanentToken, input.permanentId);
  let sheetsCopied = 0;
  for (const row of guestSheets.rows) {
    const rewritten = rewriteSheetRow(row, input.guestId, input.permanentId);
    const already = !existing.error && existing.rows.some((item) => sameSheetIdentity(item, rewritten));
    if (!already) {
      const inserted = await insertSheet(input.permanentToken, rewritten);
      if (!inserted) {
        continue;
      }
      sheetsCopied += 1;
    }
    if (row.id) {
      await deleteSheet(input.guestToken, row.id);
    }
  }

  return { filesCopied, sheetsCopied, sheetsNote: null };
}
