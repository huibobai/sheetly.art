/**
 * Visitor IP for guest AI limits.
 *
 * Assumption: this app is reached through Vercel. Vercel overwrites
 * `x-forwarded-for` and sets `x-real-ip`, so a browser cannot prepend a fake
 * address. We take the first hop of `x-forwarded-for` (the client), then
 * `x-real-ip`. If neither is a plausible IP:
 * - production fails closed (the guest request is refused)
 * - any other NODE_ENV uses 127.0.0.1 so local dev still has one shared bucket
 *
 * These headers are not trustworthy if the process is exposed without that
 * proxy. Per-visitor limits still apply either way.
 */

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function normalizeClientIp(raw: string): string | null {
  let value = raw.trim();
  if (!value || value.length > 64) {
    return null;
  }
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  }
  const zone = value.indexOf("%");
  if (zone !== -1) {
    value = value.slice(0, zone);
  }
  if (IPV4.test(value.split(":")[0] ?? "") && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }
  value = value.toLowerCase();
  if (IPV4.test(value)) {
    const parts = value.split(".");
    if (parts.every((part) => Number(part) <= 255)) {
      return value;
    }
    return null;
  }
  if (!/^[0-9a-f:]+$/.test(value)) {
    return null;
  }
  const groups = value.split(":");
  if (groups.length < 3 || groups.length > 8) {
    return null;
  }
  if (value.includes(":::")) {
    return null;
  }
  const empty = groups.filter((part) => part === "").length;
  if (empty > 2) {
    return null;
  }
  if (empty === 2 && !(value.startsWith("::") || value.endsWith("::"))) {
    return null;
  }
  if (groups.some((part) => part.length > 4)) {
    return null;
  }
  return value;
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0] ?? "";
    const parsed = normalizeClientIp(first);
    if (parsed) {
      return parsed;
    }
  }
  const real = headers.get("x-real-ip");
  if (real) {
    return normalizeClientIp(real);
  }
  return null;
}

export function resolveGuestIp(headers: Headers, nodeEnv: string | undefined): string | null {
  const parsed = clientIpFromHeaders(headers);
  if (parsed) {
    return parsed;
  }
  if (nodeEnv !== "production") {
    return "127.0.0.1";
  }
  return null;
}
