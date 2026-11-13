"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { compressImage } from "@/lib/compress-image";
import { UploadFailure, uploadPrivateImage } from "@/lib/private-upload";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
    return "Please choose a JPG, PNG, or WEBP photo.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "That file is over 10 MB. Please choose a smaller one.";
  }

  return null;
}

export function PhotoUpload({
  onUploaded,
  onPreview,
  onExtra,
  onPhoto,
  onPhotoStored,
  onPhotoFailed,
  prepareSession,
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
  children,
  frame = "plain",
}: {
  onUploaded?: (photo: UploadedPhoto) => void;
  onPreview?: (url: string) => void;
  onExtra?: (sticker: UploadedExtra) => void;
  onPhoto?: (photo: { id: string; previewUrl: string }) => void;
  onPhotoStored?: (id: string, url: string) => void;
  onPhotoFailed?: (id: string, message?: string) => void;
  /**
   * Called before an upload. Guests use it to open an anonymous session the
   * first time a photo is added. Return false to keep the preview on this device.
   */
  prepareSession?: () => Promise<boolean>;
  /** When false, the photo is only compressed and previewed in this browser. */
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
  children?: ReactNode;
  frame?: "plain" | "sheet";
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
      if (prepareSession) {
        const ready = await prepareSession();
        if (!ready) {
          onPhotoFailed?.(photoId, "session");
          return true;
        }
      }
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) {
        // No session to attach the private upload to. Keep the local preview.
        onPhotoFailed?.(photoId, "session");
        return true;
      }
      stage = "uploading";
      setPhase("uploading");
      const storedRef = await uploadPrivateImage({
        userId: session.user.id,
        fileId: crypto.randomUUID(),
        blob: compressed.blob,
        contentType: compressed.contentType,
        extension: compressed.extension,
        accessToken: session.access_token,
        onProgress: setProgress,
      });
      if (onPhoto) {
        onPhotoStored?.(photoId, storedRef);
      } else if (!asExtra) {
        const photo = { name: file.name, url: storedRef };
        setUploaded(photo);
        onUploaded?.(photo);
      }
      return true;
    } catch (caught) {
      const failure = caught instanceof UploadFailure ? caught : null;
      if (onPhoto && stage !== "compressing") {
        onPhotoFailed?.(photoId, failure?.userMessage ?? "upload");
        return true;
      }
      if (asExtra && stage !== "compressing") {
        return true;
      }
      setError(
        stage === "compressing"
          ? "We couldn't read that image. Please try another file."
          : (failure?.userMessage ?? "Upload didn't go through. Please try again."),
      );
      return false;
    } finally {
      busyRef.current = false;
      setPhase("idle");
      setProgress(0);
    }
  }, [onExtra, onPhoto, onPhotoFailed, onPhotoStored, onPreview, onUploaded, prepareSession, upload]);

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
      ? "Getting your photo ready…"
      : phase === "uploading"
        ? `Uploading… ${progress}%`
        : onPhoto
          ? (idleLabel ?? "Drop photos here")
          : "Drop your photo here";

  const statusHint =
    phase === "compressing"
      ? "Resizing it to 2000px."
      : phase === "uploading"
        ? "Sending it up now."
        : onPhoto
          ? (idleHint ?? "One photo or a few. JPG, PNG, or WEBP.")
          : "JPG, PNG, or WEBP";

  if (variant === "button") {
    const unavailable = disabled || remainingExtras <= 0;
    return (
      <div className="space-y-2">
        <label className={`btn ${isBusy || unavailable ? "" : ""}`}>
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
            className="sheet-file"
          />
          {isBusy ? statusLabel : buttonLabel}
        </label>
        {error ? (
          <p role="alert" className="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const sheetFrame = frame === "sheet";

  return (
    <div className="stack">
      {showHeading ? (
        <div>
          <h2>Add a photo</h2>
          <p className="muted">
            Drag a photo here, or click to browse. JPG, PNG, or WEBP, up to 10 MB.
            We resize it before upload.
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
        className={sheetFrame ? `sheet-drop${isDragging ? " is-dragging" : ""}` : "btn"}
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
          className="sheet-file"
        />

        {children}
        {sheetFrame ? null : <span>{isBusy ? statusLabel : statusHint}</span>}
      </label>

      {phase === "uploading" ? (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="upload-track"
        >
          <div className="upload-bar" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}

      {uploaded ? (
        <figure className="panel">
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
    </div>
  );
}
