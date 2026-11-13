/**
 * Legal-page helpers. Business contact details are not stored here.
 * Edit those only in lib/site-contact.ts.
 */

import { TAKEDOWN_EMAIL, contactMailtoAddress } from "./site-contact.ts";

export const LEGAL_LAST_UPDATED = "11 November 2026";

export const LEGAL_LAST_UPDATED_ISO = "2026-11-11";

/** This tab only. Not a cookie, and not sent to the server by itself. */
export const RIGHTS_SESSION_KEY = "sheetly-rights-confirmed";

const SHEET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSheetId(value: string | null | undefined): value is string {
  return typeof value === "string" && SHEET_ID.test(value);
}

export function sheetIdFromQuery(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!isSheetId(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

/** Report link. A sheet id is included only when it is a uuid, never a name or email. */
export function reportContentHref(sheetId: string | null | undefined): string {
  if (!isSheetId(sheetId)) {
    return "/copyright";
  }
  return `/copyright?sheet=${encodeURIComponent(sheetId.toLowerCase())}`;
}

const rightsListeners = new Set<() => void>();

export function subscribeRightsConfirmed(listener: () => void): () => void {
  rightsListeners.add(listener);
  return () => {
    rightsListeners.delete(listener);
  };
}

export function readRightsConfirmed(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(RIGHTS_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeRightsConfirmed(
  storage: Pick<Storage, "setItem" | "removeItem">,
  value: boolean,
): void {
  if (value) {
    storage.setItem(RIGHTS_SESSION_KEY, "1");
  } else {
    storage.removeItem(RIGHTS_SESSION_KEY);
  }
  for (const listener of rightsListeners) {
    listener();
  }
}

/** Client snapshot for useSyncExternalStore. A boolean, so it stays referentially stable. */
export function rightsConfirmedSnapshot(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return readRightsConfirmed(window.sessionStorage);
}

export function rightsConfirmedServerSnapshot(): boolean {
  return false;
}

/** Mailto for a takedown. The body is a blank notice, plus a sheet id when we have one. */
export function takedownMailto(sheetId: string | null): string {
  const lines = [
    sheetId ? `Sheet id: ${sheetId}` : "Sheet id:",
    "",
    "Work you own:",
    "",
    "Where it appears (page URL or description):",
    "",
    "Your contact details:",
    "",
    "Good-faith statement: I have a good-faith belief that this use is not authorized by the rights holder, their agent, or the law.",
    "",
    "Accuracy statement: The information in this notice is accurate. I am the owner, or I am allowed to act for the owner.",
    "",
    "Signature (typed name is fine):",
  ];
  const params = new URLSearchParams({
    subject: sheetId ? `Takedown notice ${sheetId}` : "Takedown notice",
    body: lines.join("\n"),
  });
  const address = contactMailtoAddress(TAKEDOWN_EMAIL) ?? TAKEDOWN_EMAIL;
  return `mailto:${address}?${params.toString()}`;
}
