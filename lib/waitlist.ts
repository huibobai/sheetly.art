/**
 * Waitlist signups for pre-launch. No mail is sent from this app.
 *
 * Per-IP windows match the guest AI limits: 6 attempts a minute and 9 a day
 * (`GUEST_IP_PER_MINUTE_LIMIT` / `GUEST_IP_DAILY_LIMIT` in lib/generation-quota.ts).
 * `evaluateWaitlistUsage` is the same window rule, so tests can run without a database.
 * The route also calls `consume_waitlist_ip_quota` when that function exists.
 */

export const WAITLIST_CONSENT_LABEL = "Email me when Sheetly opens. Unsubscribe anytime.";
export const WAITLIST_SAVED = "You're on the list. We'll email you when Sheetly opens.";
export const WAITLIST_DUPLICATE = "That email is already on the list.";
export const WAITLIST_MISSING = "The waitlist isn't ready yet. Please try again later.";
export const WAITLIST_UNAVAILABLE = "We couldn't save that email. Please try again.";
export const WAITLIST_INVALID_EMAIL = "Enter a valid email address.";
export const WAITLIST_NEED_CONSENT = "Tick the box to get an email when Sheetly opens.";
export const WAITLIST_BAD_REQUEST = "That signup couldn't be accepted.";
export const WAITLIST_RATE_LIMIT = "That's a lot of signups from this network. Wait a bit, then try again.";
export const WAITLIST_CLOSED = "Sheetly is open. There is no waitlist to join.";

export const WAITLIST_SOURCES = ["homepage", "waitlist"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export const DEFAULT_WAITLIST_IP_PER_MINUTE = 6;
export const DEFAULT_WAITLIST_IP_DAILY = 9;

const MAX_LIMIT = 1000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One @, a dotted hostname, and no spaces. Local part max 64, whole address max 254.
 * The address is trimmed and lowercased. Anything else is rejected.
 */
const EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeWaitlistEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) {
    return null;
  }
  if (email.includes("..") || /\s/.test(email)) {
    return null;
  }
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) {
    return null;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 253) {
    return null;
  }
  if (local.startsWith(".") || local.endsWith(".")) {
    return null;
  }
  if (!EMAIL.test(email)) {
    return null;
  }
  return email;
}

export function parseWaitlistSource(raw: unknown): WaitlistSource | null {
  if (raw === "homepage" || raw === "waitlist") {
    return raw;
  }
  return null;
}

/** Hidden field. A non-empty value means a bot filled it; the route pretends the signup worked. */
export function honeypotTripped(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return typeof value === "number" || typeof value === "boolean";
}

export type WaitlistLimits = {
  perMinute: number;
  perDay: number;
};

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "" || !/^\d+$/.test(raw.trim())) {
    return fallback;
  }
  const value = Number(raw.trim());
  return value >= 1 && value <= MAX_LIMIT ? value : fallback;
}

export function waitlistLimitsFromEnv(env: Record<string, string | undefined>): WaitlistLimits {
  return {
    perMinute: parseLimit(env.WAITLIST_IP_PER_MINUTE_LIMIT, DEFAULT_WAITLIST_IP_PER_MINUTE),
    perDay: parseLimit(env.WAITLIST_IP_DAILY_LIMIT, DEFAULT_WAITLIST_IP_DAILY),
  };
}

export type WaitlistSample = { atMs: number };

export type WaitlistLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "minute" | "daily"; retryAfterSeconds: number };

export type WaitlistDecision = WaitlistLimitDecision | { allowed: false; reason: "unavailable" };

function inWindow(events: WaitlistSample[], nowMs: number, windowMs: number): WaitlistSample[] {
  const cutoff = nowMs - windowMs;
  return events.filter((event) => event.atMs > cutoff && event.atMs <= nowMs);
}

function retryAfter(events: WaitlistSample[], nowMs: number, windowMs: number): number {
  if (!events.length) {
    return Math.ceil(windowMs / 1000);
  }
  const oldest = Math.min(...events.map((event) => event.atMs));
  return Math.min(Math.max(Math.ceil((oldest + windowMs - nowMs) / 1000), 1), 86400);
}

/** Decide one signup attempt without writing. Minute cap first, then the rolling day. */
export function evaluateWaitlistUsage(input: {
  nowMs: number;
  events: WaitlistSample[];
  limits: WaitlistLimits;
}): WaitlistLimitDecision {
  const minute = inWindow(input.events, input.nowMs, MINUTE_MS);
  if (minute.length >= input.limits.perMinute) {
    return { allowed: false, reason: "minute", retryAfterSeconds: retryAfter(minute, input.nowMs, MINUTE_MS) };
  }
  const day = inWindow(input.events, input.nowMs, DAY_MS);
  if (day.length >= input.limits.perDay) {
    return { allowed: false, reason: "daily", retryAfterSeconds: retryAfter(day, input.nowMs, DAY_MS) };
  }
  return { allowed: true };
}

/**
 * Per-process fallback used when `consume_waitlist_ip_quota` is not installed yet.
 * The database function is what limits signups across servers. This map only
 * covers the current process, and it stores timestamps, not email addresses.
 */
export function createWaitlistLimiter() {
  const buckets = new Map<string, number[]>();

  return {
    consume(ip: string, nowMs: number, limits: WaitlistLimits): WaitlistLimitDecision {
      const dayCutoff = nowMs - DAY_MS;
      const kept = (buckets.get(ip) ?? []).filter((at) => at > dayCutoff && at <= nowMs);
      const decision = evaluateWaitlistUsage({
        nowMs,
        events: kept.map((atMs) => ({ atMs })),
        limits,
      });
      if (decision.allowed) {
        kept.push(nowMs);
      }
      if (kept.length > 0) {
        buckets.set(ip, kept);
      } else {
        buckets.delete(ip);
      }
      if (buckets.size > 5000) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) {
          buckets.delete(oldest);
        }
      }
      return decision;
    },
  };
}

export function interpretWaitlistQuota(data: unknown): WaitlistDecision {
  if (!data || typeof data !== "object") {
    return { allowed: false, reason: "unavailable" };
  }
  const record = data as { allowed?: unknown; reason?: unknown; retry_after_seconds?: unknown };
  if (record.allowed === true) {
    return { allowed: true };
  }
  const reason = record.reason;
  if (record.allowed === false && (reason === "minute" || reason === "daily")) {
    const fallback = reason === "minute" ? 60 : 3600;
    const retry =
      typeof record.retry_after_seconds === "number" && Number.isFinite(record.retry_after_seconds)
        ? Math.min(Math.max(Math.ceil(record.retry_after_seconds), 1), 86400)
        : fallback;
    return { allowed: false, reason, retryAfterSeconds: retry };
  }
  return { allowed: false, reason: "unavailable" };
}

type DbError = { code?: string; message?: string };

export function classifyWaitlistQuotaError(error: DbError): "missing" | "unavailable" {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (
    code === "PGRST202" ||
    code === "42883" ||
    (message.includes("consume_waitlist_ip_quota") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find")))
  ) {
    return "missing";
  }
  return "unavailable";
}

export type WaitlistWriteKind = "duplicate" | "missing" | "unavailable";

export function classifyWaitlistWriteError(error: DbError): WaitlistWriteKind {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "23505" || message.includes("duplicate key") || message.includes("waitlist_email")) {
    return "duplicate";
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("waitlist") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find the table")))
  ) {
    return "missing";
  }
  return "unavailable";
}
