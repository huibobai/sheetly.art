/**
 * Browser upload into uploads_private/{auth.uid()}/{uuid}.{ext}.
 *
 * The path, extension, and content type already match the storage policy. A guest
 * upload can still fail before any object is written: Storage returns HTTP 544
 * when its Postgres pool times out in findBucketById ("The connection to the
 * database timed out"). The same request succeeds on a later attempt, so transient
 * statuses are retried here.
 */

import { buildUploadPath, PRIVATE_UPLOADS_BUCKET, privateUploadRef } from "@/lib/image-source";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import {
  isTransientUploadStatus,
  UploadFailure,
  storageErrorMessage,
  type UploadContentType,
} from "@/lib/upload-failure";

export { contentTypeForBlob, UploadFailure, uploadFailureCopy } from "@/lib/upload-failure";
export type { UploadContentType } from "@/lib/upload-failure";

export const UPLOAD_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];

function logUploadFailure(detail: { status: number; message: string; attempt: number }) {
  // Browser console only. No token, no photo bytes. Production builds still log this
  // so a failed guest upload can be diagnosed from devtools; the sheet shows a short sentence.
  console.error("photo upload failed", detail);
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function postObject(
  path: string,
  body: Blob,
  contentType: string,
  accessToken: string,
  onProgress: (percent: number) => void,
) {
  const supabaseUrlValue = supabaseUrl().replace(/\/$/, "");
  const supabaseKey = supabaseAnonKey();

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrlValue}/storage/v1/object/${PRIVATE_UPLOADS_BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) {
        return;
      }
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      // 409: an earlier attempt stored the object and the response never arrived.
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 409) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new UploadFailure(xhr.status, storageErrorMessage(xhr.responseText ?? "")));
    };
    xhr.onerror = () => reject(new UploadFailure(0, "network error"));
    xhr.onabort = () => reject(new UploadFailure(0, "upload aborted"));
    xhr.send(body);
  });
}

export async function uploadPrivateImage(input: {
  userId: string;
  fileId: string;
  blob: Blob;
  contentType: UploadContentType;
  extension: "jpg" | "png" | "webp";
  accessToken: string;
  onProgress?: (percent: number) => void;
}) {
  const path = buildUploadPath(input.userId, input.extension, input.fileId);
  const onProgress = input.onProgress ?? (() => undefined);
  let last: UploadFailure | null = null;

  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    onProgress(0);
    try {
      await postObject(path, input.blob, input.contentType, input.accessToken, onProgress);
      return privateUploadRef(supabaseUrl(), path);
    } catch (error) {
      if (!(error instanceof UploadFailure)) {
        throw error;
      }
      last = error;
      logUploadFailure({ status: error.status, message: error.serverMessage, attempt });
      if (!isTransientUploadStatus(error.status) || attempt === UPLOAD_ATTEMPTS) {
        throw error;
      }
      await wait(RETRY_DELAYS_MS[attempt - 1] ?? 1200);
    }
  }

  throw last ?? new UploadFailure(0, "upload failed");
}
