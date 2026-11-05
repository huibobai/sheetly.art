import assert from "node:assert/strict";
import { test } from "node:test";
import { isAnonymousUser, isPermanentUser } from "../lib/auth-user.ts";
import {
  guestObjectName,
  rewriteSheetRow,
  rewriteStorageOwner,
  sameSheetIdentity,
} from "../lib/guest-migrate.ts";

const FROM = "11111111-2222-3333-4444-555555555555";
const TO = "99999999-8888-7777-6666-555555555555";
const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PRIVATE = `https://abcdefgh.supabase.co/storage/v1/object/authenticated/uploads_private/${FROM}/${FILE}.webp`;
const FAL = "https://v3.fal.media/files/example/sticker.png";

test("only the owner folder of a private upload is rewritten", () => {
  const moved = rewriteStorageOwner(PRIVATE, FROM, TO);
  assert.equal(moved.includes(`/${TO}/`), true);
  assert.equal(moved.includes(`/${FROM}/`), false);
  assert.equal(rewriteStorageOwner(FAL, FROM, TO), FAL);
  assert.equal(rewriteStorageOwner(PRIVATE, FROM, FROM), PRIVATE);
  assert.equal(rewriteStorageOwner(PRIVATE, "../etc", TO), PRIVATE);
});

test("object names reject traversal and unexpected files", () => {
  assert.equal(guestObjectName(`${FILE}.webp`), `${FILE}.webp`);
  assert.equal(guestObjectName(`${FROM}/${FILE}.png`), `${FILE}.png`);
  assert.equal(guestObjectName("../secret.webp"), null);
  assert.equal(guestObjectName(`${FILE}.svg`), null);
  assert.equal(guestObjectName(`${FILE}.webp/extra`), null);
});

test("sheet rows move storage urls and leave fal urls, and duplicates match after rewrite", () => {
  const row = rewriteSheetRow({
    source_image_url: FAL,
    photo_url: PRIVATE,
    generated_url: FAL,
    source: "generated",
    style: "cartoon",
    sticker_count: 9,
    sheet_size: "a4",
    background: "white",
    padding: 12,
    items: [{ photoUrl: PRIVATE, imageUrl: FAL, style: "cartoon" }],
  }, FROM, TO);
  assert.equal(row.photo_url.includes(`/${TO}/`), true);
  assert.equal(row.generated_url, FAL);
  assert.equal(row.items[0].photoUrl.includes(`/${TO}/`), true);
  assert.equal(row.items[0].imageUrl, FAL);
  assert.equal(sameSheetIdentity(row, { photo_url: row.photo_url, source_image_url: row.source_image_url }), true);
  assert.equal(sameSheetIdentity(row, { photo_url: PRIVATE, source_image_url: FAL }), false);
});

test("anonymous and permanent users are chosen only by is_anonymous", () => {
  assert.equal(isAnonymousUser({ is_anonymous: true }), true);
  assert.equal(isAnonymousUser({ is_anonymous: false }), false);
  assert.equal(isAnonymousUser({}), false);
  assert.equal(isAnonymousUser(null), false);
  assert.equal(isPermanentUser({ is_anonymous: false }), true);
  assert.equal(isPermanentUser({ is_anonymous: true }), false);
  assert.equal(isPermanentUser({}), false);
  assert.equal(isPermanentUser(undefined), false);
});
