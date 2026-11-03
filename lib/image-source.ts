/**
 * Pure helpers that decide which image URLs the server may fetch or hand to fal.
 * They never touch the network, so they are unit tested in lib/image-source.test.ts.
 */

/** Private bucket for new uploads. Objects live at `{auth.uid()}/{uuid}.{ext}`. */
export const PRIVATE_UPLOADS_BUCKET = "uploads_private";

/** Old public bucket. Read-only here so sheets saved before this change keep working. */
export const LEGACY_PUBLIC_UPLOADS_BUCKET = "uploads";

export const UPLOAD_EXTENSIONS = ["jpg", "png", "webp"] as const;
export type UploadExtension = (typeof UPLOAD_EXTENSIONS)[number];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UPLOAD_FILE = new RegExp(`^${UUID}\\.(?:jpg|png|webp)$`, "i");
const LEGACY_FILE = new RegExp(`^${UUID}\\.(?:jpg|jpeg|png|webp)$`, "i");
const USER_ID = new RegExp(`^${UUID}$`, "i");

export type StorageRef =
  | { kind: "private"; bucket: typeof PRIVATE_UPLOADS_BUCKET; path: string; ownerId: string }
  | { kind: "legacy-public"; bucket: typeof LEGACY_PUBLIC_UPLOADS_BUCKET; path: string };

export type ProxyImageSource = StorageRef | { kind: "fal"; url: URL };

function parseHttpsUrl(value: string): URL | null {
  if (typeof value !== "string" || value.length > 2048) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return null;
  }
  return url;
}

/** Hostname of this project's Supabase API, e.g. `abcd.supabase.co`. */
export function projectStorageHost(supabaseUrl: string): string | null {
  return parseHttpsUrl(supabaseUrl)?.hostname.toLowerCase() ?? null;
}

/** Object path for a new upload. The first folder must equal auth.uid() (see the storage policies). */
export function buildUploadPath(userId: string, extension: UploadExtension, fileId: string): string {
  if (!USER_ID.test(userId) || !(UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error("Invalid upload path.");
  }
  const path = `${userId.toLowerCase()}/${fileId.toLowerCase()}.${extension}`;
  if (!UPLOAD_FILE.test(path.split("/")[1])) {
    throw new Error("Invalid upload path.");
  }
  return path;
}

/**
 * Durable reference saved in `sheets` for a private upload. It is not directly viewable:
 * the browser loads it through /api/sheet-image, and /api/generate turns it into a short-lived signed URL.
 */
export function privateUploadRef(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/authenticated/${PRIVATE_UPLOADS_BUCKET}/${path}`;
}

/** Recognise our own project's storage URLs: private refs and legacy public URLs. Anything else is null. */
export function parseStorageRef(value: string, supabaseUrl: string): StorageRef | null {
  const url = parseHttpsUrl(value);
  const host = projectStorageHost(supabaseUrl);
  if (!url || !host || url.hostname.toLowerCase() !== host || url.search) {
    return null;
  }

  const segments = url.pathname.split("/");
  // ["", "storage", "v1", "object", <access>, <bucket>, ...path]
  if (segments.length < 7 || segments[1] !== "storage" || segments[2] !== "v1" || segments[3] !== "object") {
    return null;
  }
  const [access, bucket] = [segments[4], segments[5]];
  const pathSegments = segments.slice(6);
  if (pathSegments.some((part) => !part || part === "." || part === ".." || part.includes("%"))) {
    return null;
  }

  if (access === "authenticated" && bucket === PRIVATE_UPLOADS_BUCKET && pathSegments.length === 2) {
    const [ownerId, file] = pathSegments;
    if (!USER_ID.test(ownerId) || !UPLOAD_FILE.test(file)) {
      return null;
    }
    return { kind: "private", bucket: PRIVATE_UPLOADS_BUCKET, path: pathSegments.join("/"), ownerId: ownerId.toLowerCase() };
  }

  if (access === "public" && bucket === LEGACY_PUBLIC_UPLOADS_BUCKET && pathSegments.length === 1) {
    if (!LEGACY_FILE.test(pathSegments[0])) {
      return null;
    }
    return { kind: "legacy-public", bucket: LEGACY_PUBLIC_UPLOADS_BUCKET, path: pathSegments[0] };
  }

  return null;
}

/** fal CDN hosts that serve generated images (https://fal.ai/docs/documentation/model-apis/media-expiration). */
export function isFalMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "fal.media" || host.endsWith(".fal.media");
}

/** Sources /api/sheet-image may load: our own storage, or fal's CDN. */
export function classifyProxyImageUrl(value: string, supabaseUrl: string): ProxyImageSource | null {
  const storage = parseStorageRef(value, supabaseUrl);
  if (storage) {
    return storage;
  }
  const url = parseHttpsUrl(value);
  if (!url || !isFalMediaHost(url.hostname)) {
    return null;
  }
  url.hash = "";
  return { kind: "fal", url };
}

/**
 * Sources /api/generate may send to fal: the caller's own private upload, or a legacy public upload
 * (which is already public). Never arbitrary hosts.
 */
export function generateSourceFor(value: string, supabaseUrl: string, userId: string): StorageRef | null {
  const ref = parseStorageRef(value, supabaseUrl);
  if (!ref) {
    return null;
  }
  if (ref.kind === "private" && ref.ownerId !== userId.toLowerCase()) {
    return null;
  }
  return ref;
}

/** True when a browser cannot show this URL directly and must go through /api/sheet-image. */
export function needsProxy(value: string): boolean {
  return value.includes(`/storage/v1/object/authenticated/${PRIVATE_UPLOADS_BUCKET}/`);
}

/** Image src for an <img>: private refs go through the authenticated proxy. */
export function displaySrc(value: string): string {
  return needsProxy(value) ? `/api/sheet-image?url=${encodeURIComponent(value.split("#")[0])}` : value;
}
