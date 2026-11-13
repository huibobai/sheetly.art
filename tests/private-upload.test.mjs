import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentTypeForBlob,
  isTransientUploadStatus,
  storageErrorMessage,
  uploadFailureCopy,
} from "../lib/upload-failure.ts";

test("storage timeouts and 5xx are retried, policy rejections are not", () => {
  assert.equal(isTransientUploadStatus(544), true);
  assert.equal(isTransientUploadStatus(500), true);
  assert.equal(isTransientUploadStatus(503), true);
  assert.equal(isTransientUploadStatus(0), true);
  assert.equal(isTransientUploadStatus(408), true);
  assert.equal(isTransientUploadStatus(429), true);
  assert.equal(isTransientUploadStatus(400), false);
  assert.equal(isTransientUploadStatus(401), false);
  assert.equal(isTransientUploadStatus(403), false);
  assert.equal(isTransientUploadStatus(409), false);
  assert.equal(isTransientUploadStatus(413), false);
  assert.equal(isTransientUploadStatus(415), false);
  assert.equal(isTransientUploadStatus(200), false);
});

test("storage error bodies keep the server message", () => {
  assert.equal(
    storageErrorMessage(
      '{"statusCode":"544","error":"DatabaseTimeout","message":"The connection to the database timed out"}',
    ),
    "The connection to the database timed out",
  );
  assert.equal(storageErrorMessage("not json"), "not json");
  assert.equal(storageErrorMessage(""), "");
});

test("a timeout tells the user what happened instead of a dead end", () => {
  const copy = uploadFailureCopy(544, "The connection to the database timed out");
  assert.match(copy, /timed out/i);
  assert.match(copy, /print this photo/);
  assert.equal(
    uploadFailureCopy(403, "new row violates row-level security policy"),
    "The upload didn't finish because storage blocked this photo. You can still print this photo.",
  );
  assert.equal(
    uploadFailureCopy(415, "mime type image/gif is not supported"),
    "The upload didn't finish because storage rejected the file type. You can still print this photo.",
  );
});

test("resized blobs map to the extensions the private bucket allows", () => {
  assert.deepEqual(contentTypeForBlob("image/webp"), { contentType: "image/webp", extension: "webp" });
  assert.deepEqual(contentTypeForBlob("image/jpeg"), { contentType: "image/jpeg", extension: "jpg" });
  assert.deepEqual(contentTypeForBlob("image/png"), { contentType: "image/png", extension: "png" });
  assert.equal(contentTypeForBlob("").extension, "jpg");
  assert.notEqual(contentTypeForBlob("image/jpeg").extension, "jpeg");
});
