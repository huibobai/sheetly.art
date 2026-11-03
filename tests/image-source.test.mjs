// Run with: npm test  (Node >= 22.18 / 23.6 strips TypeScript types natively; no extra dependency)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUploadPath,
  classifyProxyImageUrl,
  displaySrc,
  generateSourceFor,
  parseStorageRef,
  privateUploadRef,
  projectStorageHost,
} from "../lib/image-source.ts";

const SUPABASE = "https://abcdefgh.supabase.co";
const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("projectStorageHost only accepts https", () => {
  assert.equal(projectStorageHost(SUPABASE), "abcdefgh.supabase.co");
  assert.equal(projectStorageHost("http://abcdefgh.supabase.co"), null);
  assert.equal(projectStorageHost("not a url"), null);
});

test("buildUploadPath puts the file in the user's folder", () => {
  assert.equal(buildUploadPath(USER, "webp", FILE), `${USER}/${FILE}.webp`);
  assert.throws(() => buildUploadPath("../etc", "webp", FILE));
  assert.throws(() => buildUploadPath(USER, "svg", FILE));
  assert.throws(() => buildUploadPath(USER, "jpg", "../../x"));
});

test("private ref round-trips through parseStorageRef", () => {
  const ref = privateUploadRef(SUPABASE + "/", `${USER}/${FILE}.jpg`);
  assert.equal(ref, `${SUPABASE}/storage/v1/object/authenticated/uploads_private/${USER}/${FILE}.jpg`);
  assert.deepEqual(parseStorageRef(ref, SUPABASE), {
    kind: "private",
    bucket: "uploads_private",
    path: `${USER}/${FILE}.jpg`,
    ownerId: USER,
  });
});

test("legacy public uploads are recognised read-only", () => {
  const legacy = `${SUPABASE}/storage/v1/object/public/uploads/${FILE}.webp`;
  assert.deepEqual(parseStorageRef(legacy, SUPABASE), { kind: "legacy-public", bucket: "uploads", path: `${FILE}.webp` });
});

test("parseStorageRef rejects other projects, schemes, traversal and odd paths", () => {
  const good = `/storage/v1/object/authenticated/uploads_private/${USER}/${FILE}.jpg`;
  const bad = [
    `https://evil.supabase.co${good}`,
    `http://abcdefgh.supabase.co${good}`,
    `https://user:pw@abcdefgh.supabase.co${good}`,
    `https://abcdefgh.supabase.co:8443${good}`,
    `https://abcdefgh.supabase.co.evil.com${good}`,
    `${SUPABASE}${good}?download=1`,
    `${SUPABASE}/storage/v1/object/public/uploads_private/${USER}/${FILE}.jpg`,
    `${SUPABASE}/storage/v1/object/authenticated/uploads/${FILE}.jpg`,
    `${SUPABASE}/storage/v1/object/authenticated/uploads_private/${USER}/x/${FILE}.jpg`,
    `${SUPABASE}/storage/v1/object/authenticated/uploads_private/${USER}/${FILE}.svg`,
    `${SUPABASE}/storage/v1/object/authenticated/uploads_private/${USER}/%2e%2e/${FILE}.jpg`,
    `${SUPABASE}/storage/v1/object/public/uploads/../uploads_private/${FILE}.jpg`,
    `${SUPABASE}/storage/v1/object/public/other-bucket/${FILE}.jpg`,
    `${SUPABASE}/rest/v1/sheets`,
    "javascript:alert(1)",
    "",
    "x".repeat(3000),
  ];
  for (const value of bad) {
    assert.equal(parseStorageRef(value, SUPABASE), null, value);
  }
});

test("generateSourceFor only allows the caller's own private uploads (plus legacy public)", () => {
  const mine = privateUploadRef(SUPABASE, `${USER}/${FILE}.png`);
  const theirs = privateUploadRef(SUPABASE, `${OTHER}/${FILE}.png`);
  assert.equal(generateSourceFor(mine, SUPABASE, USER)?.kind, "private");
  assert.equal(generateSourceFor(mine, SUPABASE, USER.toUpperCase())?.kind, "private");
  assert.equal(generateSourceFor(theirs, SUPABASE, USER), null);
  assert.equal(generateSourceFor("https://v3b.fal.media/files/x.png", SUPABASE, USER), null);
  assert.equal(generateSourceFor("https://example.com/cat.jpg", SUPABASE, USER), null);
  assert.equal(
    generateSourceFor(`${SUPABASE}/storage/v1/object/public/uploads/${FILE}.jpg`, SUPABASE, USER)?.kind,
    "legacy-public",
  );
});

test("classifyProxyImageUrl allows our storage and fal.media only", () => {
  assert.equal(classifyProxyImageUrl("https://v3b.fal.media/files/a/b.png#cartoon", SUPABASE)?.kind, "fal");
  assert.equal(classifyProxyImageUrl("https://fal.media/files/b.png", SUPABASE)?.kind, "fal");
  for (const value of [
    "https://evilfal.media/x.png",
    "https://fal.media.evil.com/x.png",
    "http://v3b.fal.media/x.png",
    "https://other.supabase.co/storage/v1/object/public/uploads/x.png",
    "https://fal.ai/x.png",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
  ]) {
    assert.equal(classifyProxyImageUrl(value, SUPABASE), null, value);
  }
  const fal = classifyProxyImageUrl("https://v3b.fal.media/files/a.png#style", SUPABASE);
  assert.equal(fal.url.hash, "");
});

test("displaySrc proxies private refs only", () => {
  const ref = privateUploadRef(SUPABASE, `${USER}/${FILE}.png`);
  assert.equal(displaySrc(ref), `/api/sheet-image?url=${encodeURIComponent(ref)}`);
  assert.equal(displaySrc("blob:https://www.sheetly.art/abc"), "blob:https://www.sheetly.art/abc");
  assert.equal(displaySrc("https://v3b.fal.media/a.png"), "https://v3b.fal.media/a.png");
});
