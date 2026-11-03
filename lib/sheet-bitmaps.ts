const MAX_UNPINNED = 12;

type Entry = {
  bitmap: ImageBitmap;
  pins: number;
};

const cache = new Map<string, Entry>();

/** A bitmap decoded earlier in this page session, if it is still held. */
export function peekSheetBitmap(url: string) {
  return cache.get(url)?.bitmap;
}

/**
 * Keep a decoded bitmap for the rest of the session. A second decode of the same URL
 * is closed and the first bitmap is returned, so callers can share one ImageBitmap.
 */
export function rememberSheetBitmap(url: string, bitmap: ImageBitmap) {
  const current = cache.get(url);
  if (current) {
    if (current.bitmap !== bitmap) {
      bitmap.close();
    }
    return current.bitmap;
  }
  cache.set(url, { bitmap, pins: 0 });
  evictUnpinned();
  return cache.get(url)?.bitmap ?? bitmap;
}

export function pinSheetBitmap(url: string) {
  const entry = cache.get(url);
  if (!entry) {
    return;
  }
  entry.pins += 1;
}

export function unpinSheetBitmap(url: string) {
  const entry = cache.get(url);
  if (!entry) {
    return;
  }
  entry.pins = Math.max(0, entry.pins - 1);
  evictUnpinned();
}

function evictUnpinned() {
  let unpinned = 0;
  for (const entry of cache.values()) {
    if (entry.pins === 0) {
      unpinned += 1;
    }
  }
  if (unpinned <= MAX_UNPINNED) {
    return;
  }
  for (const [url, entry] of cache) {
    if (unpinned <= MAX_UNPINNED) {
      break;
    }
    if (entry.pins === 0) {
      cache.delete(url);
      entry.bitmap.close();
      unpinned -= 1;
    }
  }
}
