import assert from "node:assert/strict";
import { test } from "node:test";
import { BodyTooLargeError, readBodyWithLimit } from "../lib/read-limited.ts";

function streamOf(chunks, onCancel) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(new Uint8Array(chunks[index++]));
      } else {
        controller.close();
      }
    },
    cancel() {
      onCancel?.();
    },
  });
}

test("reads a body under the limit", async () => {
  const bytes = await readBodyWithLimit(streamOf([3, 4]), 10);
  assert.equal(bytes.byteLength, 7);
});

test("exactly at the limit is allowed", async () => {
  const bytes = await readBodyWithLimit(streamOf([5, 5]), 10);
  assert.equal(bytes.byteLength, 10);
});

test("aborts and cancels the stream once the limit is passed", async () => {
  let cancelled = false;
  let pulled = 0;
  const chunks = [6, 6, 6, 6];
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(chunks[pulled - 1] ?? 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBodyWithLimit(stream, 10), BodyTooLargeError);
  assert.ok(cancelled);
  assert.ok(pulled <= 3, `pulled ${pulled} chunks`);
});

test("rejects early when Content-Length is already too big", async () => {
  let cancelled = false;
  await assert.rejects(readBodyWithLimit(streamOf([1], () => (cancelled = true)), 10, "11"), BodyTooLargeError);
  assert.ok(cancelled);
});

test("null body yields empty bytes", async () => {
  assert.equal((await readBodyWithLimit(null, 10)).byteLength, 0);
});
