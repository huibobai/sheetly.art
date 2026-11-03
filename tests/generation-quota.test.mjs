import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PER_MINUTE_LIMIT,
  interpretQuotaResult,
  quotaLimitsFromEnv,
  quotaMessage,
} from "../lib/generation-quota.ts";

test("defaults are 20 per day and 3 per minute", () => {
  assert.deepEqual(quotaLimitsFromEnv({}), { perDay: 20, perMinute: 3 });
  assert.equal(DEFAULT_DAILY_LIMIT, 20);
  assert.equal(DEFAULT_PER_MINUTE_LIMIT, 3);
});

test("env overrides within 1..1000 are used", () => {
  assert.deepEqual(quotaLimitsFromEnv({ GENERATE_DAILY_LIMIT: "50", GENERATE_PER_MINUTE_LIMIT: " 5 " }), {
    perDay: 50,
    perMinute: 5,
  });
  assert.deepEqual(quotaLimitsFromEnv({ GENERATE_DAILY_LIMIT: "1", GENERATE_PER_MINUTE_LIMIT: "1000" }), {
    perDay: 1,
    perMinute: 1000,
  });
});

test("invalid env values fall back to defaults", () => {
  for (const bad of ["0", "-1", "1001", "abc", "2.5", "", "1e3", "Infinity"]) {
    assert.deepEqual(quotaLimitsFromEnv({ GENERATE_DAILY_LIMIT: bad, GENERATE_PER_MINUTE_LIMIT: bad }), {
      perDay: 20,
      perMinute: 3,
    }, bad);
  }
});

test("interpretQuotaResult maps RPC answers and fails closed", () => {
  assert.deepEqual(interpretQuotaResult({ allowed: true, remaining_today: 3 }), { allowed: true });
  assert.deepEqual(interpretQuotaResult({ allowed: false, reason: "minute", retry_after_seconds: 12.2 }), {
    allowed: false,
    reason: "minute",
    retryAfterSeconds: 13,
  });
  assert.deepEqual(interpretQuotaResult({ allowed: false, reason: "daily", retry_after_seconds: 999999 }), {
    allowed: false,
    reason: "daily",
    retryAfterSeconds: 86400,
  });
  assert.deepEqual(interpretQuotaResult({ allowed: false, reason: "minute" }), {
    allowed: false,
    reason: "minute",
    retryAfterSeconds: 60,
  });
  assert.deepEqual(interpretQuotaResult({ allowed: false, reason: "minute", retry_after_seconds: 0 }), {
    allowed: false,
    reason: "minute",
    retryAfterSeconds: 1,
  });
  for (const odd of [null, undefined, "yes", 1, {}, { allowed: "true" }, { allowed: false, reason: "other" }]) {
    assert.deepEqual(interpretQuotaResult(odd), { allowed: false, reason: "unavailable" });
  }
});

test("messages are friendly and never mention the provider", () => {
  for (const decision of [
    { allowed: false, reason: "minute", retryAfterSeconds: 5 },
    { allowed: false, reason: "daily", retryAfterSeconds: 5 },
    { allowed: false, reason: "unavailable" },
  ]) {
    const message = quotaMessage(decision);
    assert.ok(message.length > 10);
    assert.doesNotMatch(message, /fal|balance|billing/i);
  }
});
