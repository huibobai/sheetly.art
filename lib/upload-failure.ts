export type UploadContentType = "image/webp" | "image/jpeg" | "image/png";
type UploadExtension = "jpg" | "png" | "webp";

/** 544 is Storage's DatabaseTimeout: the Postgres pool died before the object was written. */
export function isTransientUploadStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function storageErrorMessage(body: string) {
  const text = body.trim();
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Storage sometimes returns plain text.
  }
  return text.slice(0, 200);
}

/** Honest sentence for the sheet. The retry button is the action; this is the reason. */
export function uploadFailureCopy(status: number, serverMessage: string) {
  if (status === 544 || /timed out|timeout/i.test(serverMessage)) {
    return "The upload didn't finish because storage timed out. You can still print this photo.";
  }
  if (status === 401 || status === 403 || /row-level security|unauthorized|access denied/i.test(serverMessage)) {
    return "The upload didn't finish because storage blocked this photo. You can still print this photo.";
  }
  if (status === 413 || /too large|payload too large/i.test(serverMessage)) {
    return "The upload didn't finish because the photo is too large. You can still print this photo.";
  }
  if (status === 415 || /mime|content type|not supported/i.test(serverMessage)) {
    return "The upload didn't finish because storage rejected the file type. You can still print this photo.";
  }
  return "The upload didn't finish. You can still print this photo.";
}

export function contentTypeForBlob(type: string): { contentType: UploadContentType; extension: UploadExtension } {
  if (type === "image/webp") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (type === "image/png") {
    return { contentType: "image/png", extension: "png" };
  }
  return { contentType: "image/jpeg", extension: "jpg" };
}

export class UploadFailure extends Error {
  readonly status: number;
  readonly serverMessage: string;
  readonly userMessage: string;

  constructor(status: number, serverMessage: string) {
    const userMessage = uploadFailureCopy(status, serverMessage);
    super(userMessage);
    this.name = "UploadFailure";
    this.status = status;
    this.serverMessage = serverMessage;
    this.userMessage = userMessage;
  }
}
