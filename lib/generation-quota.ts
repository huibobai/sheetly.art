/**
 * Limits for /api/generate. Tune with environment variables (server only):
 * - GENERATE_DAILY_LIMIT         AI generations per signed-in user in any rolling 24 h (default 20)
 * - GENERATE_PER_MINUTE_LIMIT    AI generations per user in any rolling 60 seconds (default 3)
 * - GUEST_GENERATE_DAILY_LIMIT   AI generations per anonymous visitor in any rolling 24 h (default 3)
 * - GUEST_IP_DAILY_LIMIT         AI generations per IP across anonymous visitors in any rolling 24 h (default 9)
 * - GUEST_IP_PER_MINUTE_LIMIT    AI generations per IP across anonymous visitors in any rolling 60 seconds (default 6)
 * Values outside 1..1000 fall back to the default.
 *
 * Counting happens in `public.consume_generation_quota`
 * (supabase/migrations/20261103143000_guest_and_ip_quota.sql).
 * `evaluateUsage` is the same window rules, so tests can run without a database.
 * Anonymous users never use the signed-in daily number: they use the guest daily
 * number, capped so it cannot be higher than the signed-in daily number.
 * Signed-in users ignore the IP counters. Do not lower the signed-in defaults.
 */

export const DEFAULT_DAILY_LIMIT = 20;
export const DEFAULT_PER_MINUTE_LIMIT = 3;
export const DEFAULT_GUEST_DAILY_LIMIT = 3;
export const DEFAULT_IP_DAILY_LIMIT = 9;
export const DEFAULT_IP_PER_MINUTE_LIMIT = 6;
export const GUEST_LIMIT_MESSAGE = "Sign in to keep styling";
export const GUEST_LIMIT_CODE = "guest_limit";

const MAX_LIMIT = 1000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type QuotaLimits = {
  perDay: number;
  perMinute: number;
  guestPerDay: number;
  ipPerDay: number;
  ipPerMinute: number;
};

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "" || !/^\d+$/.test(raw.trim())) {
    return fallback;
  }
  const value = Number(raw.trim());
  return value >= 1 && value <= MAX_LIMIT ? value : fallback;
}

export function quotaLimitsFromEnv(env: Record<string, string | undefined>): QuotaLimits {
  return {
    perDay: parseLimit(env.GENERATE_DAILY_LIMIT, DEFAULT_DAILY_LIMIT),
    perMinute: parseLimit(env.GENERATE_PER_MINUTE_LIMIT, DEFAULT_PER_MINUTE_LIMIT),
    guestPerDay: parseLimit(env.GUEST_GENERATE_DAILY_LIMIT, DEFAULT_GUEST_DAILY_LIMIT),
    ipPerDay: parseLimit(env.GUEST_IP_DAILY_LIMIT, DEFAULT_IP_DAILY_LIMIT),
    ipPerMinute: parseLimit(env.GUEST_IP_PER_MINUTE_LIMIT, DEFAULT_IP_PER_MINUTE_LIMIT),
  };
}

/**
 * Arguments for `consume_generation_quota`. The database picks the branch from
 * the JWT `is_anonymous` claim. Signed-in calls pass a null IP so the IP caps
 * are not applied to them. An anonymous call with a null IP is rejected in SQL.
 */
export function quotaRpcArgs(isAnonymous: boolean, limits: QuotaLimits, ip: string | null) {
  return {
    p_daily_limit: limits.perDay,
    p_minute_limit: limits.perMinute,
    p_guest_daily_limit: limits.guestPerDay,
    p_ip: isAnonymous ? ip : null,
    p_ip_daily_limit: limits.ipPerDay,
    p_ip_minute_limit: limits.ipPerMinute,
  };
}

export type QuotaReason = "minute" | "daily" | "guest_daily" | "ip_daily" | "ip_minute";

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: QuotaReason; retryAfterSeconds: number }
  | { allowed: false; reason: "unavailable" };

export function isGuestDailyCap(reason: string | undefined): boolean {
  return reason === "guest_daily" || reason === "ip_daily";
}

/** Turn the RPC's JSON answer into a decision. Anything unexpected fails closed. */
export function interpretQuotaResult(data: unknown): QuotaDecision {
  if (!data || typeof data !== "object") {
    return { allowed: false, reason: "unavailable" };
  }
  const record = data as { allowed?: unknown; reason?: unknown; retry_after_seconds?: unknown };
  if (record.allowed === true) {
    return { allowed: true };
  }
  const reason = record.reason;
  if (
    record.allowed === false &&
    (reason === "minute" || reason === "daily" || reason === "guest_daily" || reason === "ip_daily" || reason === "ip_minute")
  ) {
    const fallback = reason === "minute" || reason === "ip_minute" ? 60 : 3600;
    const retry = typeof record.retry_after_seconds === "number" && Number.isFinite(record.retry_after_seconds)
      ? Math.min(Math.max(Math.ceil(record.retry_after_seconds), 1), 86400)
      : fallback;
    return { allowed: false, reason, retryAfterSeconds: retry };
  }
  return { allowed: false, reason: "unavailable" };
}

export function quotaMessage(decision: Exclude<QuotaDecision, { allowed: true }>): string {
  if (decision.reason === "minute" || decision.reason === "ip_minute") {
    return "That's a lot of styles in one minute. Wait a minute, then try again.";
  }
  if (decision.reason === "guest_daily" || decision.reason === "ip_daily") {
    return GUEST_LIMIT_MESSAGE;
  }
  if (decision.reason === "daily") {
    return "You've used today's AI styles. Try again tomorrow, or use the Photo style for now.";
  }
  return "AI styles aren't available right now. Please try again later.";
}

export type UsageSample = { atMs: number };

function inWindow(events: UsageSample[], nowMs: number, windowMs: number): UsageSample[] {
  const cutoff = nowMs - windowMs;
  return events.filter((event) => event.atMs > cutoff && event.atMs <= nowMs);
}

function retryAfter(events: UsageSample[], nowMs: number, windowMs: number): number {
  if (!events.length) {
    return Math.ceil(windowMs / 1000);
  }
  const oldest = Math.min(...events.map((event) => event.atMs));
  return Math.min(Math.max(Math.ceil((oldest + windowMs - nowMs) / 1000), 1), 86400);
}

function guestDailyCap(limits: QuotaLimits): number {
  return Math.min(limits.guestPerDay, limits.perDay);
}

/**
 * Decide one generation without writing. Mirrors the SQL function:
 * anonymous callers who have no IP are refused, guest daily is capped by the
 * signed-in daily number, and signed-in callers ignore IP events.
 */
export function evaluateUsage(input: {
  isAnonymous: boolean;
  limits: QuotaLimits;
  nowMs: number;
  userEvents: UsageSample[];
  ip: string | null;
  ipEvents: UsageSample[];
}): QuotaDecision {
  if (input.isAnonymous && !input.ip) {
    return { allowed: false, reason: "unavailable" };
  }

  const minuteLimit = input.limits.perMinute;
  const userMinute = inWindow(input.userEvents, input.nowMs, MINUTE_MS);
  if (userMinute.length >= minuteLimit) {
    return { allowed: false, reason: "minute", retryAfterSeconds: retryAfter(userMinute, input.nowMs, MINUTE_MS) };
  }

  if (input.isAnonymous) {
    const userDay = inWindow(input.userEvents, input.nowMs, DAY_MS);
    if (userDay.length >= guestDailyCap(input.limits)) {
      return { allowed: false, reason: "guest_daily", retryAfterSeconds: retryAfter(userDay, input.nowMs, DAY_MS) };
    }
    const ipMinute = inWindow(input.ipEvents, input.nowMs, MINUTE_MS);
    if (ipMinute.length >= input.limits.ipPerMinute) {
      return { allowed: false, reason: "ip_minute", retryAfterSeconds: retryAfter(ipMinute, input.nowMs, MINUTE_MS) };
    }
    const ipDay = inWindow(input.ipEvents, input.nowMs, DAY_MS);
    if (ipDay.length >= input.limits.ipPerDay) {
      return { allowed: false, reason: "ip_daily", retryAfterSeconds: retryAfter(ipDay, input.nowMs, DAY_MS) };
    }
    return { allowed: true };
  }

  const userDay = inWindow(input.userEvents, input.nowMs, DAY_MS);
  if (userDay.length >= input.limits.perDay) {
    return { allowed: false, reason: "daily", retryAfterSeconds: retryAfter(userDay, input.nowMs, DAY_MS) };
  }
  return { allowed: true };
}
