import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cachedByKey,
  cappedWorkSize,
  createDebouncedCallback,
  cutoutCacheKey,
  PREVIEW_WORK_LIMIT,
  sheetPixels,
  SOURCE_WORK_FRACTION,
  spriteCacheKey,
} from "../lib/sticker-sheet.ts";

test("print work size stays within the source image instead of the slot", () => {
  assert.equal(SOURCE_WORK_FRACTION, 0.75);
  assert.equal(cappedWorkSize({ slotLong: 1600, sourceMaxEdge: 1024, scale: 1 }), 768);
  assert.equal(cappedWorkSize({ slotLong: 900, sourceMaxEdge: 1024, scale: 1 }), 768);
  assert.equal(cappedWorkSize({ slotLong: 700, sourceMaxEdge: 800, scale: 1 }), 600);
  assert.equal(cappedWorkSize({ slotLong: 2000, sourceMaxEdge: 2000, scale: 1 }), 1500);
});

test("preview work size keeps the old 460px ceiling and the source cap", () => {
  assert.equal(PREVIEW_WORK_LIMIT, 460);
  assert.equal(cappedWorkSize({ slotLong: 1600, sourceMaxEdge: 1024, scale: 0.34 }), 460);
  assert.equal(cappedWorkSize({ slotLong: 400, sourceMaxEdge: 1024, scale: 0.5 }), 400);
  assert.equal(cappedWorkSize({ slotLong: 900, sourceMaxEdge: 400, scale: 0.5 }), 300);
});

test("tiny slots still have a drawable work size", () => {
  assert.equal(cappedWorkSize({ slotLong: 20, sourceMaxEdge: 1024, scale: 1 }), 48);
  assert.equal(cappedWorkSize({ slotLong: 100, sourceMaxEdge: 80, scale: 1 }), 60);
});

test("the sheet file itself stays at print resolution", () => {
  assert.deepEqual(sheetPixels("a4"), { width: 2480, height: 3508 });
  assert.deepEqual(sheetPixels("square"), { width: 3000, height: 3000 });
  assert.deepEqual(sheetPixels("4x6"), { width: 1200, height: 1800 });
});

test("cut-out cache key ignores border width and background", () => {
  assert.equal(cutoutCacheKey(768), "768");
  assert.equal(cutoutCacheKey(768), cutoutCacheKey(768));
  assert.equal(cutoutCacheKey(768).includes("12"), false);
  assert.equal(cutoutCacheKey(460).includes("blush"), false);
  assert.notEqual(spriteCacheKey(768, 10, 1.5), spriteCacheKey(768, 18, 1.5));
  assert.equal(spriteCacheKey(768, 10.123, 1.2), "768:10.12:1.20");
  assert.equal(spriteCacheKey(768, 10, 1.5).includes("white"), false);
});

test("the same bitmap and work size reuse one cut-out when the border changes", () => {
  const cache = new WeakMap();
  const image = {};
  let builds = 0;
  const first = cachedByKey(cache, image, cutoutCacheKey(768), () => {
    builds += 1;
    return { mask: "subject" };
  });
  const again = cachedByKey(cache, image, cutoutCacheKey(768), () => {
    builds += 1;
    return { mask: "other" };
  });
  const otherSize = cachedByKey(cache, image, cutoutCacheKey(460), () => {
    builds += 1;
    return { mask: "preview" };
  });
  assert.equal(builds, 2);
  assert.equal(first.reused, false);
  assert.equal(again.reused, true);
  assert.equal(again.value, first.value);
  assert.equal(otherSize.reused, false);
  assert.notEqual(spriteCacheKey(768, 4, 1), spriteCacheKey(768, 20, 1));
});

test("debounce helper runs the latest callback once the controls settle", async () => {
  let calls = 0;
  let latest = 0;
  const gate = createDebouncedCallback(40);
  gate.schedule(() => {
    calls += 1;
    latest = 1;
  });
  gate.schedule(() => {
    calls += 1;
    latest = 2;
  });
  assert.equal(calls, 0);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(calls, 1);
  assert.equal(latest, 2);
  gate.schedule(() => {
    calls += 1;
  });
  gate.cancel();
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(calls, 1);
});
