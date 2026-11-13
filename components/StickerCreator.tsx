"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DemoSheet } from "@/components/DemoSheet";
import { MakingProgress } from "@/components/MakingProgress";
import { PhotoUpload } from "@/components/PhotoUpload";
import { PHOTO_UPLOAD_INPUT_ID } from "@/components/UploadLink";
import { SignInPrompt, type SignedInResult } from "@/components/SignInPrompt";
import { StickerSheet } from "@/components/StickerSheet";
import type { GoogleLinkFallback } from "@/lib/auth-errors";
import { isAnonymousUser, isPermanentUser } from "@/lib/auth-user";
import { GUEST_LIMIT_CODE, GUEST_LIMIT_MESSAGE } from "@/lib/generation-quota";
import { rewriteStorageOwner } from "@/lib/guest-migrate";
import { displaySrc } from "@/lib/image-source";
import { contentTypeForBlob, uploadPrivateImage, UploadFailure } from "@/lib/private-upload";
import { buildSheetState, clearSheetState, loadSheetState, saveSheetState, type SheetStateSettings } from "@/lib/sheet-state";
import type { SignInPurpose } from "@/lib/sign-in-flow";
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
import type { SheetBackground, SheetCount, SheetSize } from "@/lib/sticker-sheet";
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

async function requestStyledImage(
  imageUrl: string,
  style: StickerStyle,
): Promise<{ imageUrl?: string; error?: string; limitReached?: boolean; needsRetry?: boolean }> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, style }),
  });
  let payload: { imageUrl?: string; error?: string; code?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }
  if (response.ok && payload.imageUrl) {
    return { imageUrl: payload.imageUrl };
  }
  if (response.status === 401) {
    return { error: "We couldn't style this photo. Try choosing the style again.", needsRetry: true };
  }
  if (response.status === 429 && payload.code === GUEST_LIMIT_CODE) {
    return { error: payload.error ?? GUEST_LIMIT_MESSAGE, limitReached: true };
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
    <fieldset className="tray" aria-busy={disabled || undefined}>
      <legend>{label}</legend>
      <div className="tray-grid">
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
              className="chip"
            >
              {option.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.image}
                  alt=""
                  width={isStyleThumb ? 400 : 64}
                  height={isStyleThumb ? 400 : 64}
                  loading={isStyleThumb ? "lazy" : undefined}
                  decoding="async"
                />
              ) : (
                <span className="chip-swatch" />
              )}
              <span>{option.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StickerCreator({ initialSheetId }: { initialSheetId: string | null }) {
  const { user, loading, ensureAnonymousSession } = useAuth();
  const [photos, setPhotos] = useState<SheetPhoto[]>([]);
  const [demoLook, setDemoLook] = useState("photo");
  const demoLookRef = useRef("photo");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preset, setPreset] = useState<SheetPreset | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const [signInPrompt, setSignInPrompt] = useState<SignInPurpose | null>(null);
  const [guestLimit, setGuestLimit] = useState(false);
  const [googleNotice, setGoogleNotice] = useState<GoogleLinkFallback | null>(null);
  const [autoDownload, setAutoDownload] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const inflightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const styleRunLockRef = useRef(false);
  const mountedRef = useRef(true);
  const photoIdsRef = useRef<string[]>([]);
  const selectedIntentRef = useRef<string | null>(null);
  const ensureRef = useRef(ensureAnonymousSession);
  const retryingRef = useRef(new Set<string>());
  useEffect(() => {
    ensureRef.current = ensureAnonymousSession;
  });
  const settingsRef = useRef<SheetStateSettings>({ count: 9, size: "a4", background: "white", padding: 12 });
  const onSettings = useCallback((settings: SheetStateSettings) => {
    settingsRef.current = settings;
  }, []);
  const finishAutoDownload = useCallback(() => setAutoDownload(false), []);
  const permanent = isPermanentUser(user);

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
    const auth = new URLSearchParams(window.location.search).get("auth");
    if (auth !== "google-taken" && auth !== "linking-off") {
      return;
    }
    const timer = window.setTimeout(() => {
      setGoogleNotice(auth);
      setSignInPrompt("download");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    let saved: ReturnType<typeof loadSheetState>;
    try {
      saved = loadSheetState(window.sessionStorage);
    } catch {
      return;
    }
    if (!saved.ok) {
      if (saved.reason !== "empty") {
        try {
          clearSheetState(window.sessionStorage);
        } catch {
          // The bad payload can stay until the tab closes.
        }
      }
      return;
    }
    if (!permanent || !user) {
      return;
    }
    const snapshot = saved.value;
    let cancelled = false;

    void (async () => {
      // Let a strict-mode remount cancel this run before we touch storage.
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      let nextPhotos = snapshot.photos;
      if (snapshot.guestUserId && snapshot.guestUserId !== user.id) {
        try {
          const response = await fetch("/api/guest-migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (response.ok) {
            const body = (await response.json()) as { fromId?: string; toId?: string; sheetsNote?: string | null };
            if (body.fromId && body.toId) {
              nextPhotos = nextPhotos.map((photo) => ({
                ...photo,
                storedUrl: rewriteStorageOwner(photo.storedUrl, body.fromId as string, body.toId as string),
                results: Object.fromEntries(
                  Object.entries(photo.results).map(([key, url]) => [
                    key,
                    rewriteStorageOwner(url, body.fromId as string, body.toId as string),
                  ]),
                ),
              }));
            }
            if (body.sheetsNote) {
              setRestoreNote(body.sheetsNote);
            }
          } else if (mountedRef.current) {
            setRestoreNote("You're signed in, but we couldn't move every photo onto this account. If one is missing, add it once more.");
          }
        } catch {
          if (mountedRef.current) {
            setRestoreNote("You're signed in, but we couldn't move every photo onto this account. If one is missing, add it once more.");
          }
        }
      }
      if (cancelled || !mountedRef.current) {
        return;
      }
      const settings = snapshot.settings;
      setPreset({
        id: "restored",
        source: "photo",
        style: null,
        count: settings.count as SheetCount,
        size: settings.size as SheetSize,
        background: settings.background as SheetBackground,
        padding: settings.padding,
        items: [],
      });
      setPhotos(
        nextPhotos.map((photo) => {
          const style = photo.style && isStickerStyle(photo.style) ? photo.style : null;
          const results: SheetPhoto["results"] = {};
          for (const [key, url] of Object.entries(photo.results)) {
            if (isStickerStyle(key)) {
              results[key] = url;
            }
          }
          return {
            id: photo.id,
            previewUrl: photo.storedUrl,
            storedUrl: photo.storedUrl,
            style,
            results,
            uploadFailed: false,
            localOnly: false,
            error: null,
          };
        }),
      );
      if (snapshot.selectedId) {
        selectedIntentRef.current = snapshot.selectedId;
        setSelectedId(snapshot.selectedId);
      }
      if (snapshot.intent === "download") {
        setAutoDownload(true);
      }
      try {
        clearSheetState(window.sessionStorage);
      } catch {
        // The snapshot is already on the page.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, permanent, user]);

  useEffect(() => {
    if (!initialSheetId || loading) {
      return;
    }
    try {
      if (loadSheetState(window.sessionStorage).ok) {
        return;
      }
    } catch {
      // No saved guest sheet. Open the link as usual.
    }

    if (!permanent) {
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
  }, [initialSheetId, loading, permanent]);

  useEffect(() => {
    for (const photo of photos) {
      const style = photo.style;
      if (!style || !photo.storedUrl || photo.uploadFailed || photo.localOnly || photo.results[style]) {
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
          let payload = await requestStyledImage(storedUrl, style);
          if (!payload.imageUrl && payload.needsRetry) {
            const session = await ensureRef.current();
            if (session.ok) {
              payload = await requestStyledImage(storedUrl, style);
            }
          }
          if (!payload.imageUrl) {
            if (payload.limitReached && mountedRef.current) {
              setGuestLimit(true);
            }
            throw new Error(payload.error || "We couldn't style this photo.");
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

  async function prepareSession() {
    try {
      const result = await ensureAnonymousSession();
      return result.ok;
    } catch {
      return false;
    }
  }

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
              style: isStickerStyle(demoLookRef.current) ? demoLookRef.current : null,
              results: {},
              uploadFailed: false,
              localOnly: false,
              error: null,
            },
          ],
    );
  }

  function storePhoto(id: string, url: string) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, storedUrl: url, localOnly: false, uploadFailed: false, error: null } : photo,
      ),
    );
  }

  function failPhoto(id: string, reason?: string) {
    if (reason === "session") {
      setPhotos((current) =>
        current.map((photo) =>
          photo.id === id
            ? {
                ...photo,
                localOnly: true,
                uploadFailed: false,
                error: "We couldn't store this photo privately just now. You can still preview it. Try adding it again to use an AI style.",
              }
            : photo,
        ),
      );
      return;
    }
    const message =
      reason && reason !== "upload" ? reason : "The upload didn't finish. You can still print this photo.";
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, uploadFailed: true, localOnly: false, error: message } : photo,
      ),
    );
  }

  async function retryUpload(id: string) {
    const photo = photos.find((item) => item.id === id);
    if (!photo || !photo.previewUrl.startsWith("blob:") || retryingRef.current.has(id)) {
      return;
    }
    retryingRef.current.add(id);
    setRetryingId(id);
    setPhotos((current) =>
      current.map((item) => (item.id === id ? { ...item, uploadFailed: false, error: null } : item)),
    );
    try {
      const ready = await prepareSession();
      if (!ready) {
        failPhoto(id, "session");
        return;
      }
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) {
        failPhoto(id, "session");
        return;
      }
      const blob = await fetch(photo.previewUrl).then((response) => response.blob());
      const file = contentTypeForBlob(blob.type);
      const storedRef = await uploadPrivateImage({
        userId: session.user.id,
        fileId: crypto.randomUUID(),
        blob,
        contentType: file.contentType,
        extension: file.extension,
        accessToken: session.access_token,
      });
      storePhoto(id, storedRef);
    } catch (error) {
      failPhoto(id, error instanceof UploadFailure ? error.userMessage : undefined);
    } finally {
      retryingRef.current.delete(id);
      setRetryingId((current) => (current === id ? null : current));
    }
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

  function persistForGoogle(purpose: SignInPurpose) {
    const built = buildSheetState({
      intent: purpose,
      guestUserId: isAnonymousUser(user) ? user?.id ?? null : null,
      photos: photos.map((photo) => ({
        id: photo.id,
        storedUrl: photo.storedUrl,
        style: photo.style,
        results: photo.results,
      })),
      selectedId,
      settings: settingsRef.current,
    });
    if (!built.ok) {
      return false;
    }
    try {
      return saveSheetState(window.sessionStorage, built.value);
    } catch {
      return false;
    }
  }

  function handleSignedIn(result: SignedInResult) {
    if (result.fromId && result.toId) {
      const fromId = result.fromId;
      const toId = result.toId;
      setPhotos((current) =>
        current.map((photo) => ({
          ...photo,
          previewUrl: rewriteStorageOwner(photo.previewUrl, fromId, toId),
          storedUrl: photo.storedUrl ? rewriteStorageOwner(photo.storedUrl, fromId, toId) : photo.storedUrl,
          results: Object.fromEntries(
            Object.entries(photo.results).map(([key, url]) => [key, url ? rewriteStorageOwner(url, fromId, toId) : url]),
          ) as SheetPhoto["results"],
        })),
      );
    }
    if (result.note) {
      setRestoreNote(result.note);
    }
    setGuestLimit(false);
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.error !== GUEST_LIMIT_MESSAGE) {
          return photo;
        }
        if (photo.style) {
          failedRef.current.delete(`${photo.id}:${photo.style}`);
        }
        return { ...photo, error: null };
      }),
    );
    setSignInPrompt(null);
    setGoogleNotice(null);
    if (result.purpose === "download") {
      setAutoDownload(true);
    }
  }

  const selected = photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null;
  const selectedIndex = selected ? photos.findIndex((photo) => photo.id === selected.id) : -1;
  const first = photos[0];
  const firstStyled = first?.style ? first.results[first.style] : null;
  const stylingCount = photos.filter(
    (photo) => photo.style && photo.storedUrl && !photo.uploadFailed && !photo.results[photo.style] && !photo.error,
  ).length;

  const demoOptions = [
    { id: "photo", name: "Photo", image: null as string | null },
    ...STICKER_STYLES.map((id) => ({ id, name: STYLE_LABELS[id], image: `/styles/${id}.webp` })),
  ];

  return (
    <div className="stack-lg">
      {restoreNote ? (
        <p role="status" className="muted">
          {restoreNote}{" "}
          {!permanent && initialSheetId ? (
            <button type="button" onClick={() => setSignInPrompt("save")} className="btn btn-ghost">
              Sign in
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="bench-grid">
        <div id="upload" tabIndex={-1} className="sheet-stack">
          {photos.length === 0 ? (
            <PhotoUpload
              showHeading={false}
              frame="sheet"
              remainingExtras={MAX_PHOTOS}
              inputId={PHOTO_UPLOAD_INPUT_ID}
              idleLabel="Drop a photo on the sheet"
              idleHint="JPG, PNG, or WEBP."
              prepareSession={prepareSession}
              onPhoto={addPhoto}
              onPhotoStored={storePhoto}
              onPhotoFailed={failPhoto}
            >
              <DemoSheet look={demoLook} />
            </PhotoUpload>
          ) : (
            <div className="stack">
              <h2>
                <span>1</span> Your photos
              </h2>
              <p className="muted">One photo or a bunch. Tap one, then pick its look.</p>
              <ul className="live-photos">
                {photos.map((photo, index) => {
                  const styling = Boolean(
                    photo.style && !photo.uploadFailed && !photo.results[photo.style] && !photo.error,
                  );
                  const active = photo.id === selected?.id;
                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          selectedIntentRef.current = photo.id;
                          setSelectedId(photo.id);
                        }}
                        className="thumb"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={displaySrc(displayUrl(photo))} alt="" />
                        <span>
                          {styleLabel(photo.style) ?? "Photo"}
                        </span>
                        {styling ? <span className="muted">Styling…</span> : null}
                        {photo.error && !styling ? <span className="alert">Needs a look</span> : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove photo ${index + 1}`}
                        onClick={() => removePhoto(photo.id)}
                        className="remove-photo"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              {stylingCount > 0 ? <MakingProgress count={stylingCount} /> : null}
              {retryingId === selected?.id ? (
                <p role="status" className="muted">
                  Trying the upload again…
                </p>
              ) : selected?.error ? (
                <div className="stack">
                  <p role="alert" className="alert">
                    {selected.error}
                  </p>
                  {(selected.uploadFailed || selected.localOnly) && selected.previewUrl.startsWith("blob:") ? (
                    <button type="button" onClick={() => void retryUpload(selected.id)} className="btn">
                      Try the upload again
                    </button>
                  ) : null}
                </div>
              ) : null}
              {photos.length < MAX_PHOTOS ? (
                <PhotoUpload
                  variant="button"
                  buttonLabel="Add photos"
                  remainingExtras={MAX_PHOTOS - photos.length}
                  inputId={PHOTO_UPLOAD_INPUT_ID}
                  prepareSession={prepareSession}
                  onPhoto={addPhoto}
                  onPhotoStored={storePhoto}
                  onPhotoFailed={failPhoto}
                />
              ) : null}
            </div>
          )}
          {photos.length === 0 ? (
            <div className="sheet-caption">
              <h2>
                <span>1</span> Your photos
              </h2>
              <p>One photo or a bunch. Tap one, then pick its look.</p>
              <p>Drop a photo on the sheet. JPG, PNG, or WEBP.</p>
            </div>
          ) : null}
        </div>

        {photos.length === 0 ? (
          <fieldset className="tray">
            <legend>Pick a look</legend>
            <div className="tray-grid">
              {demoOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={demoLook === option.id}
                  onClick={() => {
                    demoLookRef.current = option.id;
                    setDemoLook(option.id);
                  }}
                >
                  {option.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.image} alt="" width={400} height={400} />
                  ) : (
                    <span className="chip-swatch" />
                  )}
                  <span>{option.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : selected ? (
          <div className="stack">
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
                className="btn"
              >
                Use on every photo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {guestLimit ? (
        <div className="panel nav-actions">
          <p role="status">
            {GUEST_LIMIT_MESSAGE}
          </p>
          <button
            type="button"
            onClick={() => setSignInPrompt("limit")}
            className="btn btn-primary"
          >
            Sign in
          </button>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <StickerSheet
          key={preset?.id ?? "draft"}
          artworks={photos.map(displayUrl)}
          storedPhotoUrl={first?.storedUrl ?? null}
          generatedUrl={firstStyled ?? null}
          generatedStyle={firstStyled && first?.style ? first.style : null}
          pendingStyles={stylingCount}
          preset={preset}
          autoDownload={autoDownload}
          onAutoDownloadDone={finishAutoDownload}
          onSettings={onSettings}
          onRequireSignIn={() => setSignInPrompt("download")}
          sheetPhotos={photos.map((photo) => ({
            storedUrl: photo.storedUrl,
            style: photo.style,
            displayUrl: displayUrl(photo),
          }))}
        />
      ) : null}

      {signInPrompt ? (
        <SignInPrompt
          key={`${signInPrompt}-${googleNotice ?? "none"}`}
          open
          purpose={signInPrompt}
          notice={googleNotice}
          onClose={() => {
            setSignInPrompt(null);
            setGoogleNotice(null);
          }}
          onBeforeGoogle={persistForGoogle}
          onSignedIn={handleSignedIn}
        />
      ) : null}
    </div>
  );
}
