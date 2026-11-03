/**
 * Per-user limits for /api/generate. Tune with environment variables (server only):
 * - GENERATE_DAILY_LIMIT       AI generations per user in any rolling 24 hours (default 20)
 * - GENERATE_PER_MINUTE_LIMIT  AI generations per user in any rolling 60 seconds (default 3)
 * Values outside 1..1000 fall back to the default. The counting happens in the
 * `public.consume_generation_quota` database function (supabase/migrations/20261103120000_generation_quota.sql).
 */

export const DEFAULT_DAILY_LIMIT = 20;
export const DEFAULT_PER_MINUTE_LIMIT = 3;
const MAX_LIMIT = 1000;

export type QuotaLimits = { perDay: number; perMinute: number };

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
  };
}

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: "minute" | "daily"; retryAfterSeconds: number }
  | { allowed: false; reason: "unavailable" };

/** Turn the RPC's JSON answer into a decision. Anything unexpected fails closed. */
export function interpretQuotaResult(data: unknown): QuotaDecision {
  if (!data || typeof data !== "object") {
    return { allowed: false, reason: "unavailable" };
  }
  const record = data as { allowed?: unknown; reason?: unknown; retry_after_seconds?: unknown };
  if (record.allowed === true) {
    return { allowed: true };
  }
  if (record.allowed === false && (record.reason === "minute" || record.reason === "daily")) {
    const retry = typeof record.retry_after_seconds === "number" && Number.isFinite(record.retry_after_seconds)
      ? Math.min(Math.max(Math.ceil(record.retry_after_seconds), 1), 86400)
      : record.reason === "minute" ? 60 : 3600;
    return { allowed: false, reason: record.reason, retryAfterSeconds: retry };
  }
  return { allowed: false, reason: "unavailable" };
}

export function quotaMessage(decision: Exclude<QuotaDecision, { allowed: true }>): string {
  if (decision.reason === "minute") {
    return "You're styling photos a little fast. Wait a minute, then try again.";
  }
  if (decision.reason === "daily") {
    return "You've reached today's limit for AI styles. Try again tomorrow, or use the Photo style.";
  }
  return "AI styles are unavailable right now. Please try again later.";
}
