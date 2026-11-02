"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PhotoUpload } from "@/components/PhotoUpload";
import { StickerSheet } from "@/components/StickerSheet";
import { presetFromRecord, SHEET_COLUMNS, SHEET_COLUMNS_WITHOUT_STYLE, missingStyleColumn, toSheetRecord, type SheetPreset } from "@/lib/sheets";
import { isStickerStyle, STICKER_STYLES, STYLE_LABELS, styleLabel, type StickerStyle } from "@/lib/sticker-styles";
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

function StyleChoices({
  value,
  onChange,
  label,
  photoUrl,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  photoUrl?: string | null;
}) {
  const options: { id: string; name: string; image: string | null }[] = [
    { id: "photo", name: "Photo", image: photoUrl ?? null },
    ...STICKER_STYLES.map((id) => ({ id, name: STYLE_LABELS[id], image: `/styles/${id}.jpg` })),
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={`rounded-xl border p-1.5 text-center ${
                selected ? "border-accent bg-orange-50 ring-2 ring-orange-100" : "border-border bg-white hover:border-stone-300"
              }`}
            >
              {option.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={option.image} alt="" className="aspect-square w-full rounded-lg bg-stone-50 object-cover" />
              ) : (
                <span className="block aspect-square w-full rounded-lg bg-stone-100" />
              )}
              <span className="mt-1 block text-xs font-medium">{option.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StickerCreator({ initialSheetId }: { initialSheetId: string | null }) {
  const { user, loading } = useAuth();
  const [photos, setPhotos] = useState<SheetPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preset, setPreset] = useState<SheetPreset | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const inflightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const photoIdsRef = useRef<string[]>([]);
  const selectedIntentRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const ids = photos.map((photo) => photo.id);
    const added = ids.filter((id) => !photoIdsRef.current.includes(id));
    photoIdsRef.current = ids;

    if (ids.length === 0) {
      selectedIntentRef.current = null;
      setSelectedId(null);
      return;
    }

    if (added.length > 0) {
      selectedIntentRef.current = added[added.length - 1];
      setSelectedId(selectedIntentRef.current);
      return;
    }

    if (!selectedIntentRef.current || !ids.includes(selectedIntentRef.current)) {
      selectedIntentRef.current = ids[0];
      setSelectedId(ids[0]);
    }
  }, [photos]);

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
      current.length >= MAX_PHOTOS || current.some((item) => item.id === photo.id)
        ? current
        : [
            ...current,
            {
              id: photo.id,
              previewUrl: photo.previewUrl,
              storedUrl: null,
              style: null,
              results: {},
              uploadFailed: false,
              error: null,
            },
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

  const selected = photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null;
  const selectedIndex = selected ? photos.findIndex((photo) => photo.id === selected.id) : -1;
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
          Upload one photo or several. Click a photo, then pick its style.
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
            <div className="space-y-5">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((photo, index) => {
                  const styling = Boolean(
                    photo.style && !photo.uploadFailed && !photo.results[photo.style] && !photo.error,
                  );
                  const active = photo.id === selected?.id;
                  return (
                    <li key={photo.id} className="relative">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          selectedIntentRef.current = photo.id;
                          setSelectedId(photo.id);
                        }}
                        className={`w-full rounded-2xl border p-1.5 text-center ${
                          active
                            ? "border-accent bg-orange-50 ring-2 ring-orange-100"
                            : "border-border bg-white hover:border-stone-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={displayUrl(photo)}
                          alt=""
                          className="aspect-square w-full rounded-xl bg-stone-50 object-cover"
                        />
                        <span className="mt-1 block truncate text-xs font-medium">
                          {styleLabel(photo.style) ?? "Photo"}
                        </span>
                        {styling ? <span className="mt-0.5 block text-[10px] text-muted">Styling…</span> : null}
                        {photo.error && !styling ? (
                          <span className="mt-0.5 block text-[10px] text-red-600">Needs attention</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove photo ${index + 1}`}
                        onClick={() => removePhoto(photo.id)}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs text-white"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected ? (
                <div className="space-y-3">
                  <StyleChoices
                    label={`Style for photo ${selectedIndex + 1}`}
                    value={selected.style ?? "photo"}
                    photoUrl={selected.previewUrl}
                    onChange={(value) => chooseStyle(selected.id, value)}
                  />
                  {photos.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => applyStyleToAll(selected.style ?? "photo")}
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:border-stone-300"
                    >
                      Apply this style to all photos
                    </button>
                  ) : null}
                  {selected.error ? (
                    <p role="alert" className="text-sm text-red-600">
                      {selected.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
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
