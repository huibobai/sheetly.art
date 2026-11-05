import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_GUEST_DAILY_LIMIT,
  DEFAULT_IP_DAILY_LIMIT,
  DEFAULT_IP_PER_MINUTE_LIMIT,
  DEFAULT_PER_MINUTE_LIMIT,
  GUEST_LIMIT_MESSAGE,
  evaluateUsage,
  interpretQuotaResult,
  quotaLimitsFromEnv,
  quotaMessage,
  quotaRpcArgs,
} from "../lib/generation-quota.ts";

test("defaults are 20 per day and 3 per minute, guests stay smaller", () => {
  assert.deepEqual(quotaLimitsFromEnv({}), {
    perDay: 20,
    perMinute: 3,
    guestPerDay: 3,
    ipPerDay: 9,
    ipPerMinute: 6,
  });
  assert.equal(DEFAULT_DAILY_LIMIT, 20);
  assert.equal(DEFAULT_PER_MINUTE_LIMIT, 3);
  assert.equal(DEFAULT_GUEST_DAILY_LIMIT, 3);
  assert.equal(DEFAULT_IP_DAILY_LIMIT, 9);
  assert.equal(DEFAULT_IP_PER_MINUTE_LIMIT, 6);
});

test("env overrides within 1..1000 are used", () => {
  assert.deepEqual(
    quotaLimitsFromEnv({
      GENERATE_DAILY_LIMIT: "50",
      GENERATE_PER_MINUTE_LIMIT: " 5 ",
      GUEST_GENERATE_DAILY_LIMIT: "4",
      GUEST_IP_DAILY_LIMIT: "12",
      GUEST_IP_PER_MINUTE_LIMIT: "8",
    }),
    { perDay: 50, perMinute: 5, guestPerDay: 4, ipPerDay: 12, ipPerMinute: 8 },
  );
  assert.deepEqual(quotaLimitsFromEnv({ GENERATE_DAILY_LIMIT: "1", GENERATE_PER_MINUTE_LIMIT: "1000" }), {
    perDay: 1,
    perMinute: 1000,
    guestPerDay: 3,
    ipPerDay: 9,
    ipPerMinute: 6,
  });
});

test("invalid env values fall back to defaults", () => {
  for (const bad of ["0", "-1", "1001", "abc", "2.5", "", "1e3", "Infinity"]) {
    assert.deepEqual(quotaLimitsFromEnv({
      GENERATE_DAILY_LIMIT: bad,
      GENERATE_PER_MINUTE_LIMIT: bad,
      GUEST_GENERATE_DAILY_LIMIT: bad,
      GUEST_IP_DAILY_LIMIT: bad,
      GUEST_IP_PER_MINUTE_LIMIT: bad,
    }), {
      perDay: 20,
      perMinute: 3,
      guestPerDay: 3,
      ipPerDay: 9,
      ipPerMinute: 6,
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

test("messages say which limit was hit and when to try again", () => {
  const minute = quotaMessage({ allowed: false, reason: "minute", retryAfterSeconds: 5 });
  assert.equal(minute, "That's a lot of styles in one minute. Wait a minute, then try again.");
  const daily = quotaMessage({ allowed: false, reason: "daily", retryAfterSeconds: 5 });
  assert.equal(daily, "You've used today's AI styles. Try again tomorrow, or use the Photo style for now.");
  const unavailable = quotaMessage({ allowed: false, reason: "unavailable" });
  assert.match(unavailable, /later/i);
  assert.equal(quotaMessage({ allowed: false, reason: "guest_daily", retryAfterSeconds: 5 }), GUEST_LIMIT_MESSAGE);
  assert.equal(quotaMessage({ allowed: false, reason: "ip_daily", retryAfterSeconds: 5 }), GUEST_LIMIT_MESSAGE);
  assert.equal(quotaMessage({ allowed: false, reason: "ip_minute", retryAfterSeconds: 5 }), minute);
});

test("the RPC args keep signed-in calls off the IP cap", () => {
  const limits = quotaLimitsFromEnv({});
  assert.equal(quotaRpcArgs(false, limits, "203.0.113.4").p_ip, null);
  assert.equal(quotaRpcArgs(false, limits, "203.0.113.4").p_daily_limit, 20);
  assert.equal(quotaRpcArgs(true, limits, "203.0.113.4").p_ip, "203.0.113.4");
  assert.equal(quotaRpcArgs(true, limits, "203.0.113.4").p_guest_daily_limit, 3);
  assert.equal(quotaRpcArgs(true, limits, null).p_ip, null);
});

const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

function simulate(limits, calls) {
  const users = new Map();
  const ips = new Map();
  return calls.map((call) => {
    const userEvents = users.get(call.user) ?? [];
    const ipEvents = call.ip ? ips.get(call.ip) ?? [] : [];
    const decision = evaluateUsage({
      isAnonymous: call.isAnonymous,
      limits,
      nowMs: call.at,
      userEvents: userEvents.map((atMs) => ({ atMs })),
      ip: call.ip,
      ipEvents: ipEvents.map((atMs) => ({ atMs })),
    });
    if (decision.allowed) {
      userEvents.push(call.at);
      users.set(call.user, userEvents);
      if (call.isAnonymous && call.ip) {
        ipEvents.push(call.at);
        ips.set(call.ip, ipEvents);
      }
    }
    return decision;
  });
}

test("anonymous visitors use the guest daily cap, not the signed-in one", () => {
  const limits = quotaLimitsFromEnv({});
  const at = 1_700_000_000_000;
  const guest = simulate(limits, [
    { user: "guest", isAnonymous: true, ip: "203.0.113.8", at },
    { user: "guest", isAnonymous: true, ip: "203.0.113.8", at: at + 1000 },
    { user: "guest", isAnonymous: true, ip: "203.0.113.8", at: at + MINUTE + 1000 },
    { user: "guest", isAnonymous: true, ip: "203.0.113.8", at: at + MINUTE * 2 },
  ]);
  assert.equal(guest[0].allowed, true);
  assert.equal(guest[1].allowed, true);
  assert.equal(guest[2].allowed, true);
  assert.equal(guest[3].allowed, false);
  assert.equal(guest[3].reason, "guest_daily");

  const signedIn = simulate(limits, Array.from({ length: 4 }, (_, index) => ({
    user: "member",
    isAnonymous: false,
    ip: "203.0.113.8",
    at: at + index * (MINUTE + 1000),
  })));
  assert.equal(signedIn.every((item) => item.allowed), true);
});

test("a guest cannot be given a daily cap above the signed-in cap", () => {
  const limits = quotaLimitsFromEnv({ GUEST_GENERATE_DAILY_LIMIT: "100", GENERATE_DAILY_LIMIT: "5" });
  const at = 1_700_000_000_000;
  const calls = Array.from({ length: 6 }, (_, index) => ({
    user: "guest",
    isAnonymous: true,
    ip: "203.0.113.9",
    at: at + index * (MINUTE + 1000),
  }));
  const results = simulate(limits, calls);
  assert.equal(results.slice(0, 5).every((item) => item.allowed), true);
  assert.equal(results[5].reason, "guest_daily");
});

test("per-minute cap still applies to guests and to signed-in users", () => {
  const limits = quotaLimitsFromEnv({});
  const at = 1_700_000_000_000;
  const burst = Array.from({ length: 4 }, (_, index) => ({
    user: "same",
    isAnonymous: false,
    ip: "198.51.100.2",
    at: at + index * 1000,
  }));
  const signedIn = simulate(limits, burst);
  assert.equal(signedIn[2].allowed, true);
  assert.equal(signedIn[3].reason, "minute");

  const guest = simulate(limits, burst.map((call) => ({ ...call, user: "guest", isAnonymous: true })));
  assert.equal(guest[3].reason, "minute");
});

test("one IP is capped across anonymous visitors, and signed-in users ignore that cap", () => {
  const limits = quotaLimitsFromEnv({
    GUEST_GENERATE_DAILY_LIMIT: "3",
    GUEST_IP_DAILY_LIMIT: "4",
    GUEST_IP_PER_MINUTE_LIMIT: "2",
    GENERATE_PER_MINUTE_LIMIT: "10",
  });
  const at = 1_700_000_000_000;
  const minute = simulate(limits, [
    { user: "a", isAnonymous: true, ip: "192.0.2.10", at },
    { user: "b", isAnonymous: true, ip: "192.0.2.10", at: at + 1000 },
    { user: "c", isAnonymous: true, ip: "192.0.2.10", at: at + 2000 },
  ]);
  assert.equal(minute[1].allowed, true);
  assert.equal(minute[2].reason, "ip_minute");

  const later = at + MINUTE + DAY;
  const daily = simulate(limits, [
    { user: "a", isAnonymous: true, ip: "192.0.2.11", at: later },
    { user: "a", isAnonymous: true, ip: "192.0.2.11", at: later + MINUTE },
    { user: "b", isAnonymous: true, ip: "192.0.2.11", at: later + MINUTE * 2 },
    { user: "b", isAnonymous: true, ip: "192.0.2.11", at: later + MINUTE * 3 },
    { user: "c", isAnonymous: true, ip: "192.0.2.11", at: later + MINUTE * 4 },
    { user: "member", isAnonymous: false, ip: "192.0.2.11", at: later + MINUTE * 5 },
  ]);
  assert.equal(daily[3].allowed, true);
  assert.equal(daily[4].reason, "ip_daily");
  assert.equal(daily[5].allowed, true);
});

test("an anonymous call with no IP is refused and does not spend a signed-in slot", () => {
  const limits = quotaLimitsFromEnv({});
  const at = 1_700_000_000_000;
  const decision = evaluateUsage({
    isAnonymous: true,
    limits,
    nowMs: at,
    userEvents: [],
    ip: null,
    ipEvents: [],
  });
  assert.deepEqual(decision, { allowed: false, reason: "unavailable" });
  const after = evaluateUsage({
    isAnonymous: false,
    limits,
    nowMs: at,
    userEvents: [],
    ip: null,
    ipEvents: [{ atMs: at }],
  });
  assert.deepEqual(after, { allowed: true });
});

test("guest and IP reasons from the database are recognised", () => {
  assert.equal(interpretQuotaResult({ allowed: false, reason: "guest_daily", retry_after_seconds: 10 }).reason, "guest_daily");
  assert.equal(interpretQuotaResult({ allowed: false, reason: "ip_daily" }).retryAfterSeconds, 3600);
  assert.equal(interpretQuotaResult({ allowed: false, reason: "ip_minute", retry_after_seconds: 4.2 }).retryAfterSeconds, 5);
});
