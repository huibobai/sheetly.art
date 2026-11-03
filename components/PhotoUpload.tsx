"use client";

import { useCallback, useRef, useState } from "react";
import { compressImage } from "@/lib/compress-image";
import { buildUploadPath, PRIVATE_UPLOADS_BUCKET, privateUploadRef } from "@/lib/image-source";
import { createClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Private bucket; objects are stored under the signed-in user's id (see the storage policies migration).
const BUCKET = PRIVATE_UPLOADS_BUCKET;

const ACCEPTED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Phase = "idle" | "compressing" | "uploading";

type UploadedPhoto = {
  name: string;
  url: string;
};

export type UploadedExtra = {
  id: string;
  previewUrl: string;
  label: string;
};

function extensionFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "png" || extension === "webp") return extension;
  return null;
}

function validateFile(file: File) {
  const extension = ACCEPTED_TYPES[file.type] ?? extensionFromName(file.name);

  if (!extension || (file.type && !ACCEPTED_TYPES[file.type])) {
    return "Please choose a JPG, PNG, or WEBP image.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "This file is too big. Maximum size is 10 MB.";
  }

  return null;
}

function uploadCompressedImage(
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
    xhr.open("POST", `${supabaseUrlValue}/storage/v1/object/${BUCKET}/${path}`);
    // The user's own JWT, so the storage policy can check the `{auth.uid()}/` folder.
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
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      let message = "";
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        message = body.message ?? "";
      } catch {
        message = "";
      }

      if (/row-level security|unauthorized|access denied/i.test(message)) {
        reject(new Error("permission"));
        return;
      }

      reject(new Error("upload failed"));
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.onabort = () => reject(new Error("upload failed"));
    xhr.send(body);
  });
}

export function PhotoUpload({
  onUploaded,
  onPreview,
  onExtra,
  onPhoto,
  onPhotoStored,
  onPhotoFailed,
  upload = true,
  showHeading = true,
  variant = "dropzone",
  buttonLabel = "Add photos",
  remainingExtras = 0,
  disabled = false,
  idleLabel,
  idleHint,
  onLimit,
  inputId,
}: {
  onUploaded?: (photo: UploadedPhoto) => void;
  onPreview?: (url: string) => void;
  onExtra?: (sticker: UploadedExtra) => void;
  onPhoto?: (photo: { id: string; previewUrl: string }) => void;
  onPhotoStored?: (id: string, url: string) => void;
  onPhotoFailed?: (id: string) => void;
  /** When false (guests), the photo is only compressed and previewed in this browser; nothing is uploaded. */
  upload?: boolean;
  showHeading?: boolean;
  variant?: "dropzone" | "button";
  buttonLabel?: string;
  remainingExtras?: number;
  disabled?: boolean;
  idleLabel?: string;
  idleHint?: string;
  onLimit?: () => void;
  inputId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedPhoto | null>(null);
  const isBusy = phase !== "idle";

  const handleFile = useCallback(async (file: File | undefined, asExtra: boolean) => {
    if (!file || busyRef.current) {
      return false;
    }

    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return false;
    }

    setError(null);
    setProgress(0);
    busyRef.current = true;
    setPhase("compressing");
    let stage: Phase = "compressing";
    const photoId = crypto.randomUUID();

    try {
      const compressed = await compressImage(file);
      const previewUrl = URL.createObjectURL(compressed.blob);
      if (onPhoto) {
        onPhoto({ id: photoId, previewUrl });
      } else if (asExtra) {
        onExtra?.({ id: photoId, previewUrl, label: "Photo" });
      } else {
        onPreview?.(previewUrl);
      }
      if (!upload) {
        return true;
      }
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) {
        // Signed out meanwhile: keep the local preview, do not upload.
        return true;
      }
      stage = "uploading";
      setPhase("uploading");
      const path = buildUploadPath(session.user.id, compressed.extension, crypto.randomUUID());
      await uploadCompressedImage(path, compressed.blob, compressed.contentType, session.access_token, setProgress);

      // Not a public URL: a durable reference that /api/sheet-image and /api/generate resolve server-side.
      const storedRef = privateUploadRef(supabaseUrl(), path);
      if (onPhoto) {
        onPhotoStored?.(photoId, storedRef);
      } else if (!asExtra) {
        const photo = { name: file.name, url: storedRef };
        setUploaded(photo);
        onUploaded?.(photo);
      }
      return true;
    } catch (caught) {
      if (onPhoto && stage !== "compressing") {
        onPhotoFailed?.(photoId);
        return true;
      }
      if (asExtra && stage !== "compressing") {
        return true;
      }
      const denied = caught instanceof Error && caught.message === "permission";
      setError(
        stage === "compressing"
          ? "Could not process this image. Please try another file."
          : denied
            ? "Upload failed. The uploads bucket is not allowing this upload."
            : "Upload failed. Please try again.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setPhase("idle");
      setProgress(0);
    }
  }, [onExtra, onPhoto, onPhotoFailed, onPhotoStored, onPreview, onUploaded, upload]);

  const handleFiles = useCallback(async (list: FileList | undefined) => {
    const files = list ? [...list] : [];
    if (!files.length || busyRef.current) {
      return;
    }

    let extrasLeft = remainingExtras;
    let hitLimit = false;
    for (let index = 0; index < files.length; index += 1) {
      const asExtra = Boolean(onPhoto) || variant === "button" || index > 0;
      if (asExtra && extrasLeft <= 0) {
        hitLimit = true;
        break;
      }
      const added = await handleFile(files[index], asExtra);
      if (!added) {
        if (!asExtra) {
          break;
        }
        continue;
      }
      if (asExtra) {
        extrasLeft -= 1;
      }
    }

    if (hitLimit) {
      onLimit?.();
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [handleFile, onLimit, onPhoto, remainingExtras, variant]);

  const statusLabel =
    phase === "compressing"
      ? "Compressing…"
      : phase === "uploading"
        ? `Uploading… ${progress}%`
        : onPhoto
          ? (idleLabel ?? "Drop photos here")
          : "Drop your photo here";

  const statusHint =
    phase === "compressing"
      ? "Resizing your photo to 2000px."
      : phase === "uploading"
        ? "Sending the compressed image."
        : onPhoto
          ? (idleHint ?? "One photo or several. PNG, JPG, or WEBP.")
          : "PNG, JPG, or WEBP";

  if (variant === "button") {
    const unavailable = disabled || remainingExtras <= 0;
    return (
      <div className="space-y-2">
        <label
          className={`relative inline-flex overflow-hidden rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:border-stone-300 ${
            isBusy || unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple={remainingExtras > 1}
            disabled={isBusy || unavailable}
            aria-label={buttonLabel}
            aria-busy={isBusy}
            onChange={(event) => void handleFiles(event.target.files ?? undefined)}
            className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          {isBusy ? statusLabel : buttonLabel}
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {showHeading ? (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Upload a photo</h2>
          <p className="mt-1 text-sm text-muted">
            Drag and drop an image, or click to browse. JPG, PNG, or WEBP up to 10 MB.
            Photos are resized before upload.
          </p>
        </div>
      ) : null}

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!isBusy) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`relative flex min-h-56 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:min-h-72 ${
          isDragging
            ? "border-accent bg-orange-50"
            : "border-border bg-surface hover:border-stone-300 hover:bg-stone-50"
        } ${isBusy ? "cursor-wait" : ""}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple={remainingExtras > 1}
          disabled={isBusy}
          aria-label={statusLabel}
          aria-busy={isBusy}
          onChange={(event) => void handleFiles(event.target.files ?? undefined)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
        />

        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-accent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className={`h-6 w-6 ${phase === "compressing" ? "animate-pulse" : ""}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </span>
        <p className="mt-4 text-base font-medium">{statusLabel}</p>
        <p className="mt-1 text-sm text-muted">{statusHint}</p>
      </label>

      {phase === "uploading" ? (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-stone-200"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {uploaded ? (
        <figure className="overflow-hidden rounded-2xl border border-border bg-surface p-3 sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={uploaded.url}
            alt={`Uploaded preview of ${uploaded.name}`}
            className="mx-auto max-h-80 w-full rounded-xl object-contain"
          />
          <figcaption className="mt-3 truncate text-center text-sm text-muted">
            {uploaded.name}
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}
