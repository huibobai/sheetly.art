"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PhotoUpload } from "@/components/PhotoUpload";
import { StickerSheet } from "@/components/StickerSheet";
import { presetFromRecord, SHEET_COLUMNS, SHEET_COLUMNS_WITHOUT_STYLE, missingStyleColumn, toSheetRecord, type SheetPreset } from "@/lib/sheets";
import { isStickerStyle, STICKER_STYLES, STYLE_LABELS, type StickerStyle } from "@/lib/sticker-styles";
import { createClient } from "@/lib/supabase/client";

const MAX_PHOTOS = 12;

type SheetPhoto = {
  id: string;
  previewUrl: string;
  storedUrl: string | null;
  style: StickerStyle | null;
  results: Partial<Record<StickerStyle, string>>;
  uploadFailed: boolean;
  error: string | null;
};

function displayUrl(photo: SheetPhoto) {
  if (photo.style && photo.results[photo.style]) {
    return photo.results[photo.style] as string;
  }
  return photo.previewUrl;
}

function StyleSelect({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        <option value="photo">Photo</option>
        {STICKER_STYLES.map((id) => (
          <option key={id} value={id}>
            {STYLE_LABELS[id]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StickerCreator({ initialSheetId }: { initialSheetId: string | null }) {
  const { user, loading } = useAuth();
  const [photos, setPhotos] = useState<SheetPhoto[]>([]);
  const [preset, setPreset] = useState<SheetPreset | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const inflightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!initialSheetId || loading) {
      return;
    }

    if (!user) {
      setRestoreNote("Sign in to open this saved sheet. You can still make a new one here.");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("sheets")
      .select(SHEET_COLUMNS)
      .eq("id", initialSheetId)
      .maybeSingle()
      .then(async ({ data, error: loadError }) => {
        if (cancelled) {
          return;
        }

        let row = data;
        let queryError = loadError;
        if (queryError && missingStyleColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_STYLE)
            .eq("id", initialSheetId)
            .maybeSingle();
          row = fallback.data ? { ...fallback.data, style: null } : null;
          queryError = fallback.error;
        }

        if (cancelled) {
          return;
        }
        const record = row ? toSheetRecord(row) : null;
        if (queryError || !record) {
          setRestoreNote("That sheet could not be opened.");
          return;
        }

        const original = (record.photo_url || record.source_image_url).split("#")[0];
        const style = record.style && isStickerStyle(record.style) ? record.style : null;
        const generated = record.generated_url?.split("#")[0] ?? null;
        setRestoreNote(null);
        setPreset(presetFromRecord(record));
        setPhotos([
          {
            id: record.id,
            previewUrl: original,
            storedUrl: original.startsWith("https://") ? original : null,
            style,
            results: style && generated ? { [style]: generated } : {},
            uploadFailed: false,
            error: null,
          },
        ]);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSheetId, loading, user]);

  useEffect(() => {
    for (const photo of photos) {
      const style = photo.style;
      if (!style || !photo.storedUrl || photo.uploadFailed || photo.results[style]) {
        continue;
      }
      const key = `${photo.id}:${style}`;
      if (inflightRef.current.has(key) || failedRef.current.has(key)) {
        continue;
      }
      inflightRef.current.add(key);
      const storedUrl = photo.storedUrl;
      void (async () => {
        try {
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: storedUrl, style }),
          });
          const payload = (await response.json()) as { imageUrl?: string; error?: string };
          if (!response.ok || !payload.imageUrl) {
            throw new Error(payload.error ?? "Could not style this photo.");
          }
          if (!mountedRef.current) {
            return;
          }
          try {
            localStorage.setItem(`sheetly-style:${payload.imageUrl.split("#")[0]}`, style);
          } catch {
            // The sheet still shows the styled image in this session.
          }
          setPhotos((current) =>
            current.map((item) =>
              item.id === photo.id
                ? { ...item, results: { ...item.results, [style]: payload.imageUrl }, error: null }
                : item,
            ),
          );
        } catch (error) {
          if (!mountedRef.current) {
            return;
          }
          failedRef.current.add(key);
          const message = error instanceof Error ? error.message : "Could not style this photo.";
          setPhotos((current) =>
            current.map((item) => (item.id === photo.id && item.style === style ? { ...item, error: message } : item)),
          );
        } finally {
          inflightRef.current.delete(key);
        }
      })();
    }
  }, [photos]);

  function addPhoto(photo: { id: string; previewUrl: string }) {
    setPhotos((current) =>
      current.length >= MAX_PHOTOS
        ? current
        : [
            ...current,
            { id: photo.id, previewUrl: photo.previewUrl, storedUrl: null, style: null, results: {}, uploadFailed: false, error: null },
          ],
    );
  }

  function storePhoto(id: string, url: string) {
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, storedUrl: url } : photo)));
  }

  function failPhoto(id: string) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, uploadFailed: true, error: "Upload didn't finish. You can still print this photo." } : photo,
      ),
    );
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function chooseStyle(id: string, value: string) {
    const style = isStickerStyle(value) ? value : null;
    if (style) {
      failedRef.current.delete(`${id}:${style}`);
    }
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, style, error: photo.uploadFailed ? photo.error : null } : photo,
      ),
    );
  }

  function applyStyleToAll(value: string) {
    const style = isStickerStyle(value) ? value : null;
    setPhotos((current) =>
      current.map((photo) => {
        if (style) {
          failedRef.current.delete(`${photo.id}:${style}`);
        }
        return { ...photo, style, error: photo.uploadFailed ? photo.error : null };
      }),
    );
  }

  const sharedStyle = photos.every((photo) => photo.style === photos[0]?.style)
    ? photos[0]?.style ?? "photo"
    : "";
  const first = photos[0];
  const firstStyled = first?.style ? first.results[first.style] : null;
  const stylingCount = photos.filter(
    (photo) => photo.style && photo.storedUrl && !photo.uploadFailed && !photo.results[photo.style] && !photo.error,
  ).length;

  return (
    <div className="space-y-5">
      {restoreNote ? (
        <p role="status" className="text-sm text-muted">
          {restoreNote}
        </p>
      ) : null}

      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight">Photos</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Upload one photo or several at once. Then pick a style for each, or use the same style for all of them.
        </p>
        <div className="mt-5">
          {photos.length === 0 ? (
            <PhotoUpload
              showHeading={false}
              remainingExtras={MAX_PHOTOS}
              onPhoto={addPhoto}
              onPhotoStored={storePhoto}
              onPhotoFailed={failPhoto}
            />
          ) : (
            <div className="space-y-4">
              <StyleSelect
                label="Apply one style to all"
                value={sharedStyle}
                placeholder={sharedStyle === "" ? "Mixed styles" : undefined}
                onChange={applyStyleToAll}
              />
              <ul className="space-y-3">
                {photos.map((photo, index) => {
                  const styling = Boolean(
                    photo.style && !photo.uploadFailed && !photo.results[photo.style] && !photo.error,
                  );
                  return (
                    <li key={photo.id} className="flex flex-col gap-3 rounded-2xl border border-border p-3 sm:flex-row sm:items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayUrl(photo)}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl bg-stone-50 object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <StyleSelect
                          label={`Photo ${index + 1}`}
                          value={photo.style ?? "photo"}
                          onChange={(value) => chooseStyle(photo.id, value)}
                        />
                        {styling ? (
                          <p className="text-xs text-muted" role="status">
                            {photo.storedUrl ? "Styling…" : "Uploading…"}
                          </p>
                        ) : null}
                        {photo.error ? (
                          <p role="alert" className="text-xs text-red-600">
                            {photo.error}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:border-stone-300"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
              {photos.length < MAX_PHOTOS ? (
                <PhotoUpload
                  variant="button"
                  buttonLabel="Add photos"
                  remainingExtras={MAX_PHOTOS - photos.length}
                  onPhoto={addPhoto}
                  onPhotoStored={storePhoto}
                  onPhotoFailed={failPhoto}
                />
              ) : null}
            </div>
          )}
        </div>
      </section>

      {photos.length > 0 ? (
        <StickerSheet
          key={preset?.id ?? "draft"}
          artworks={photos.map(displayUrl)}
          storedPhotoUrl={first?.storedUrl ?? null}
          generatedUrl={firstStyled ?? null}
          generatedStyle={firstStyled && first?.style ? first.style : null}
          pendingStyles={stylingCount}
          preset={preset}
        />
      ) : null}
    </div>
  );
}
