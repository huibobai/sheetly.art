"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PhotoUpload } from "@/components/PhotoUpload";
import { PHOTO_UPLOAD_INPUT_ID } from "@/components/UploadLink";
import { SignInPrompt } from "@/components/SignInPrompt";
import { StickerSheet } from "@/components/StickerSheet";
import { displaySrc } from "@/lib/image-source";
import {
  missingItemsColumn,
  missingStyleColumn,
  presetFromRecord,
  SHEET_COLUMNS,
  SHEET_COLUMNS_WITHOUT_ITEMS,
  SHEET_COLUMNS_WITHOUT_STYLE,
  sheetItems,
  toSheetRecord,
  type SheetPreset,
} from "@/lib/sheets";
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
  /** Added while signed out: kept in this browser only, never uploaded, so AI styles are unavailable for it. */
  localOnly: boolean;
  error: string | null;
};

const LOCAL_ONLY_AI_ERROR = "This photo stayed on this device. Remove it and add it again to use AI styles.";

const STYLE_PROGRESS_MESSAGES = [
  "Warming up the pencils…",
  "Tracing the outline…",
  "Filling in the colors…",
  "Cutting the white border…",
  "Almost ready to peel…",
];

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function StyleProgressCard({ count }: { count: number }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STYLE_PROGRESS_MESSAGES.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const message = reducedMotion
    ? "Hang tight. This usually takes a few seconds."
    : STYLE_PROGRESS_MESSAGES[index];

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded-full border-2 border-orange-200 border-t-accent motion-safe:animate-spin"
        />
        <div>
          <p className="text-sm font-semibold">{count > 1 ? `Styling ${count} photos` : "Styling your photo"}</p>
          <p className="text-sm text-stone-700">{message}</p>
        </div>
      </div>
    </div>
  );
}

async function requestStyledImage(
  imageUrl: string,
  style: StickerStyle,
): Promise<{ imageUrl?: string; error?: string; needsSignIn?: boolean }> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, style }),
  });
  let payload: { imageUrl?: string; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }
  if (response.ok && payload.imageUrl) {
    return { imageUrl: payload.imageUrl };
  }
  if (response.status === 401) {
    return { error: "Sign in to use AI styles.", needsSignIn: true };
  }
  if (response.status === 429) {
    return { error: payload.error ?? "That's a lot of AI styles just now. Please wait and try again." };
  }
  return { error: payload.error ?? "We couldn't style this photo. Please try again." };
}

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
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  photoUrl?: string | null;
  disabled?: boolean;
}) {
  const options: { id: string; name: string; image: string | null }[] = [
    { id: "photo", name: "Photo", image: photoUrl ?? null },
    ...STICKER_STYLES.map((id) => ({ id, name: STYLE_LABELS[id], image: `/styles/${id}.webp` })),
  ];

  return (
    <fieldset className="space-y-2" aria-busy={disabled || undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {options.map((option) => {
          const selected = value === option.id;
          const isStyleThumb = option.id !== "photo";
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => {
                if (disabled) {
                  return;
                }
                onChange(option.id);
              }}
              className={`rounded-xl border p-1.5 text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? "border-accent bg-orange-50 ring-2 ring-orange-100" : "border-border bg-white hover:border-stone-300"
              }`}
            >
              {option.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.image}
                  alt=""
                  width={isStyleThumb ? 400 : undefined}
                  height={isStyleThumb ? 400 : undefined}
                  loading={isStyleThumb ? "lazy" : undefined}
                  decoding="async"
                  className="aspect-square w-full rounded-lg bg-stone-50 object-cover"
                />
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
  const [signInPrompt, setSignInPrompt] = useState<"photos" | "download" | "ai" | null>(null);
  const inflightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const styleRunLockRef = useRef(false);
  const mountedRef = useRef(true);
  const photoIdsRef = useRef<string[]>([]);
  const selectedIntentRef = useRef<string | null>(null);
  const guest = !loading && !user;
  const photoCap = guest ? 1 : MAX_PHOTOS;
  const photoCapRef = useRef(photoCap);
  photoCapRef.current = photoCap;

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
      setRestoreNote("Sign in to open this saved sheet. You can still start a new one here.");
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
        if (queryError && missingItemsColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_ITEMS)
            .eq("id", initialSheetId)
            .maybeSingle();
          row = fallback.data ? { ...fallback.data, items: null } : null;
          queryError = fallback.error;
        }
        if (queryError && missingStyleColumn(queryError)) {
          const fallback = await supabase
            .from("sheets")
            .select(SHEET_COLUMNS_WITHOUT_STYLE)
            .eq("id", initialSheetId)
            .maybeSingle();
          row = fallback.data ? { ...fallback.data, style: null, items: null } : null;
          queryError = fallback.error;
        }

        if (cancelled) {
          return;
        }
        const record = row ? toSheetRecord(row) : null;
        if (queryError || !record) {
          setRestoreNote("We couldn't open that sheet.");
          return;
        }

        const restored = sheetItems(record);
        if (!restored.length) {
          setRestoreNote("We couldn't open that sheet.");
          return;
        }
        setRestoreNote(null);
        setPreset(presetFromRecord(record));
        setPhotos(
          restored.map((item, index) => {
            const style = item.style && isStickerStyle(item.style) ? item.style : null;
            return {
              id: `${record.id}:${index}`,
              previewUrl: item.imageUrl,
              storedUrl: item.photoUrl,
              style,
              results: style && item.imageUrl !== item.photoUrl ? { [style]: item.imageUrl } : {},
              uploadFailed: false,
              localOnly: false,
              error: null,
            };
          }),
        );
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
      styleRunLockRef.current = true;
      const storedUrl = photo.storedUrl;
      void (async () => {
        try {
          const payload = await requestStyledImage(storedUrl, style);
          if (!payload.imageUrl) {
            if (payload.needsSignIn && mountedRef.current) {
              setSignInPrompt("ai");
            }
            throw new Error(payload.error);
          }
          const styledUrl = payload.imageUrl;
          if (!mountedRef.current) {
            return;
          }
          try {
            localStorage.setItem(`sheetly-style:${styledUrl.split("#")[0]}`, style);
          } catch {
            // The sheet still shows the styled image in this session.
          }
          setPhotos((current) =>
            current.map((item) =>
              item.id === photo.id
                ? { ...item, results: { ...item.results, [style]: styledUrl }, error: null }
                : item,
            ),
          );
        } catch (error) {
          if (!mountedRef.current) {
            return;
          }
          failedRef.current.add(key);
          const message = error instanceof Error ? error.message : "We couldn't style this photo.";
          setPhotos((current) =>
            current.map((item) => (item.id === photo.id && item.style === style ? { ...item, error: message } : item)),
          );
        } finally {
          inflightRef.current.delete(key);
          if (inflightRef.current.size === 0) {
            styleRunLockRef.current = false;
          }
        }
      })();
    }
    if (inflightRef.current.size === 0) {
      styleRunLockRef.current = false;
    }
  }, [photos]);

  function addPhoto(photo: { id: string; previewUrl: string }) {
    setPhotos((current) =>
      current.length >= photoCapRef.current || current.some((item) => item.id === photo.id)
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
              localOnly: !user,
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
        photo.id === id ? { ...photo, uploadFailed: true, error: "The upload didn't finish. You can still print this photo." } : photo,
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
    if (styleRunLockRef.current) {
      return;
    }
    const style = isStickerStyle(value) ? value : null;
    if (style && guest) {
      // AI styles send the photo to fal.ai, so they need an account; guests keep the Photo style locally.
      setSignInPrompt("ai");
      return;
    }
    if (style) {
      failedRef.current.delete(`${id}:${style}`);
    }
    const photo = photos.find((item) => item.id === id);
    const willRun = Boolean(
      style && photo?.storedUrl && !photo.uploadFailed && !photo.localOnly && !photo.results[style],
    );
    if (willRun) {
      styleRunLockRef.current = true;
    }
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.id !== id) {
          return photo;
        }
        if (style && photo.localOnly) {
          return { ...photo, error: LOCAL_ONLY_AI_ERROR };
        }
        return { ...photo, style, error: photo.uploadFailed ? photo.error : null };
      }),
    );
  }

  function applyStyleToAll(value: string) {
    if (styleRunLockRef.current) {
      return;
    }
    const style = isStickerStyle(value) ? value : null;
    if (style && guest) {
      setSignInPrompt("ai");
      return;
    }
    const willRun = Boolean(
      style &&
        photos.some((photo) => photo.storedUrl && !photo.uploadFailed && !photo.localOnly && !photo.results[style]),
    );
    if (willRun) {
      styleRunLockRef.current = true;
    }
    setPhotos((current) =>
      current.map((photo) => {
        if (style && photo.localOnly) {
          return { ...photo, error: LOCAL_ONLY_AI_ERROR };
        }
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

      <section
        id="upload"
        tabIndex={-1}
        className="scroll-mt-6 rounded-3xl border border-border bg-surface p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-7"
      >
        <h2 className="text-lg font-semibold tracking-tight">Your photos</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {guest
            ? "Add one photo to see your sheet. It stays in this browser until you sign in. Sign in to use AI styles, add more photos, or download it."
            : "Add one photo or a few. Pick a photo, then choose its style."}
        </p>
        <div className="mt-5">
          {photos.length === 0 ? (
            <PhotoUpload
              showHeading={false}
              remainingExtras={photoCap}
              idleLabel={guest ? "Drop a photo here" : undefined}
              idleHint={guest ? "One photo to try. JPG, PNG, or WEBP." : undefined}
              onLimit={guest ? () => setSignInPrompt("photos") : undefined}
              inputId={PHOTO_UPLOAD_INPUT_ID}
              upload={Boolean(user)}
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
                          src={displaySrc(displayUrl(photo))}
                          alt=""
                          className="aspect-square w-full rounded-xl bg-stone-50 object-cover"
                        />
                        <span className="mt-1 block truncate text-xs font-medium">
                          {styleLabel(photo.style) ?? "Photo"}
                        </span>
                        {styling ? <span className="mt-0.5 block text-[10px] text-muted">Styling…</span> : null}
                        {photo.error && !styling ? (
                          <span className="mt-0.5 block text-[10px] text-red-600">Needs a look</span>
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
                  {stylingCount > 0 ? <StyleProgressCard count={stylingCount} /> : null}
                  <StyleChoices
                    label={`Style for photo ${selectedIndex + 1}`}
                    value={selected.style ?? "photo"}
                    photoUrl={displaySrc(selected.previewUrl)}
                    disabled={stylingCount > 0}
                    onChange={(value) => chooseStyle(selected.id, value)}
                  />
                  {photos.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => applyStyleToAll(selected.style ?? "photo")}
                      disabled={stylingCount > 0}
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use this style on every photo
                    </button>
                  ) : null}
                  {selected.error ? (
                    <p role="alert" className="text-sm text-red-600">
                      {selected.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {guest ? (
                <div className="space-y-2">
                  <label className="relative inline-flex cursor-pointer overflow-hidden rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:border-stone-300">
                    <input
                      id={PHOTO_UPLOAD_INPUT_ID}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      aria-label="Add photos"
                      onClick={(event) => {
                        event.preventDefault();
                        setSignInPrompt("photos");
                      }}
                      className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    />
                    Add photos
                  </label>
                  <p className="text-sm text-muted">Sign in to add another photo or download your sheet.</p>
                </div>
              ) : photos.length < MAX_PHOTOS ? (
                <PhotoUpload
                  variant="button"
                  buttonLabel="Add photos"
                  remainingExtras={MAX_PHOTOS - photos.length}
                  inputId={PHOTO_UPLOAD_INPUT_ID}
                  upload={Boolean(user)}
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
          onRequireSignIn={() => setSignInPrompt("download")}
          sheetPhotos={photos.map((photo) => ({
            storedUrl: photo.storedUrl,
            style: photo.style,
            displayUrl: displayUrl(photo),
          }))}
        />
      ) : null}

      <SignInPrompt
        open={signInPrompt !== null}
        title={
          signInPrompt === "download"
            ? "Sign in to download this sheet"
            : signInPrompt === "ai"
              ? "Sign in to try an AI style"
              : "Sign in to add more photos"
        }
        onClose={() => setSignInPrompt(null)}
      />
    </div>
  );
}
