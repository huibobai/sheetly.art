import assert from "node:assert/strict";
import { test } from "node:test";
import { retainSubjectComponents, subjectMask } from "../lib/sticker-sheet.ts";

function fill(mask, width, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      mask[y * width + x] = 1;
    }
  }
}

test("cutout keeps the main subject and pieces that touch it, and drops a separate fragment", () => {
  const width = 42;
  const height = 24;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 1, 1, 16, 16);
  fill(mask, width, 18, 1, 4, 4);
  fill(mask, width, 30, 1, 8, 8);

  retainSubjectComponents(mask, width, height, 2);

  assert.equal(mask[1 * width + 1], 1);
  assert.equal(mask[1 * width + 18], 1);
  assert.equal(mask[1 * width + 30], 0);
  assert.equal(mask[8 * width + 37], 0);
  let kept = 0;
  for (const value of mask) {
    kept += value;
  }
  assert.equal(kept, 16 * 16 + 4 * 4);
});

test("a larger fragment cut off by the photo edge does not replace the subject", () => {
  const width = 40;
  const height = 40;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 5, 0, 20, 8);
  fill(mask, width, 14, 18, 12, 12);

  retainSubjectComponents(mask, width, height, 8);

  assert.equal(mask[0 * width + 10], 0);
  assert.equal(mask[7 * width + 10], 0);
  assert.equal(mask[24 * width + 20], 1);
  assert.equal(mask[18 * width + 14], 1);
});

test("subject mask drops a background island that is not part of the subject", () => {
  const width = 90;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = 186;
    data[offset + 1] = 164;
    data[offset + 2] = 132;
    data[offset + 3] = 255;
  }
  const paint = (x0, y0, w, h, r, g, b) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
      }
    }
  };
  paint(25, 45, 40, 60, 20, 70, 180);
  paint(66, 60, 20, 30, 20, 70, 180);
  paint(30, 8, 20, 20, 150, 40, 30);

  const mask = subjectMask(data, width, height);
  const at = (x, y) => mask[y * width + x];

  assert.equal(at(45, 75), 1);
  assert.equal(at(76, 75), 1);
  assert.equal(at(40, 18), 0);
  assert.equal(at(30, 8), 0);
  assert.equal(at(49, 27), 0);
  assert.equal(at(4, 4), 0);
});
