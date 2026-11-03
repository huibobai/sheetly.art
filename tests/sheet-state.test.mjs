import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIVACY_NOTICE, SHEET_CUT_LINE, SIGN_IN_PRIVACY_NOTICE } from "../lib/copy.ts";
import {
  buildSheetState,
  clearSheetState,
  loadSheetState,
  parseSheetState,
  saveSheetState,
  serializeSheetState,
  SHEET_STATE_VERSION,
} from "../lib/sheet-state.ts";

const STORED = "https://abcdefgh.supabase.co/storage/v1/object/authenticated/uploads_private/11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp";
const FAL = "https://v3.fal.media/files/example/sticker.png";

function memory() {
  const bag = new Map();
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => bag.set(key, value),
    removeItem: (key) => bag.delete(key),
  };
}

const settings = { count: 9, size: "a4", background: "white", padding: 12 };

test("sheet state round-trips and drops secrets and blob previews", () => {
  const built = buildSheetState({
    intent: "download",
    guestUserId: "11111111-2222-3333-4444-555555555555",
    photos: [
      {
        id: "photo-1",
        storedUrl: STORED,
        style: "cartoon",
        results: { cartoon: FAL },
      },
      {
        id: "local",
        storedUrl: "blob:http://localhost/abc",
        style: null,
        results: {},
      },
    ],
    selectedId: "photo-1",
    settings,
  });
  assert.equal(built.ok, true);
  const storage = memory();
  assert.equal(saveSheetState(storage, built.value), true);
  const loaded = loadSheetState(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.version, SHEET_STATE_VERSION);
  assert.equal(loaded.value.intent, "download");
  assert.equal(loaded.value.photos.length, 1);
  assert.equal(loaded.value.photos[0].storedUrl, STORED);
  assert.equal(loaded.value.photos[0].results.cartoon, FAL);
  assert.equal(JSON.stringify(loaded.value).includes("access_token"), false);
  assert.equal(JSON.stringify(loaded.value).includes("blob:"), false);
  clearSheetState(storage);
  assert.equal(loadSheetState(storage).reason, "empty");
});

test("a version mismatch is rejected and not applied", () => {
  const built = buildSheetState({
    intent: "save",
    guestUserId: null,
    photos: [{ id: "photo-1", storedUrl: STORED, style: null, results: {} }],
    selectedId: "photo-1",
    settings,
  });
  const raw = JSON.parse(serializeSheetState(built.value));
  raw.version = 2;
  raw.accessToken = "secret-token";
  const parsed = parseSheetState(JSON.stringify(raw));
  assert.deepEqual(parsed, { ok: false, reason: "version" });
  assert.equal(parseSheetState("{").reason, "invalid");
  assert.equal(parseSheetState("").reason, "empty");
});

test("download intent without a stored photo is not persisted", () => {
  const built = buildSheetState({
    intent: "download",
    guestUserId: null,
    photos: [{ id: "local", storedUrl: null, style: null, results: {} }],
    selectedId: null,
    settings,
  });
  assert.deepEqual(built, { ok: false, reason: "no-stored-photos" });
});

test("privacy lines still name the photo upload, fal.ai, and FLUX", () => {
  for (const text of [PRIVACY_NOTICE, SIGN_IN_PRIVACY_NOTICE]) {
    assert.match(text, /photo/i);
    assert.match(text, /fal\.ai/);
    assert.match(text, /Black Forest Labs/);
    assert.match(text, /FLUX/);
  }
  assert.equal(SHEET_CUT_LINE, "Dashed lines = where the scissors go");
});
