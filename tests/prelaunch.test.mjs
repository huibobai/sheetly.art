import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ORDER_CLOSED_MESSAGE,
  ROBOTS_TAG,
  assertNotPrelaunch,
  isBlockedOrderPath,
  isPrelaunch,
  layoutRobots,
  prelaunchResponseHeaders,
  publicPagePaths,
  robotsFile,
  robotsTxt,
  siteOrigin,
} from "../lib/launch.ts";
import {
  DEFAULT_WAITLIST_IP_DAILY,
  DEFAULT_WAITLIST_IP_PER_MINUTE,
  WAITLIST_CONSENT_LABEL,
  classifyWaitlistQuotaError,
  classifyWaitlistWriteError,
  createWaitlistLimiter,
  evaluateWaitlistUsage,
  honeypotTripped,
  interpretWaitlistQuota,
  normalizeWaitlistEmail,
  waitlistLimitsFromEnv,
} from "../lib/waitlist.ts";

test("pre-launch is on unless the flag is explicitly off", () => {
  assert.equal(isPrelaunch({}), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: undefined }), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "" }), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "   " }), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "true" }), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "yes" }), true);
  assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "nope" }), true);
  for (const off of ["false", "FALSE", " false ", "0", "off", "OFF", "no"]) {
    assert.equal(isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: off }), false, off);
  }
  assert.equal(isPrelaunch({ PRELAUNCH_MODE: "false" }), false);
  assert.equal(
    isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "false", PRELAUNCH_MODE: "true" }),
    false,
  );
  assert.equal(
    isPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "", PRELAUNCH_MODE: "no" }),
    false,
  );
});

test("assertNotPrelaunch throws only while pre-launch is on", () => {
  assert.throws(() => assertNotPrelaunch({}), (error) => {
    assert.equal(error.name, "PrelaunchBlockedError");
    assert.equal(error.message, ORDER_CLOSED_MESSAGE);
    return true;
  });
  assert.doesNotThrow(() => assertNotPrelaunch({ NEXT_PUBLIC_PRELAUNCH_MODE: "false" }));
});

test("robots.txt disallows everything in pre-launch and allows with a sitemap after", () => {
  assert.equal(robotsTxt(true, "https://sheetly.art"), "User-Agent: *\nDisallow: /\n");
  assert.equal(robotsFile(true, "https://sheetly.art").sitemap, undefined);
  assert.equal(
    robotsTxt(false, "https://sheetly.art"),
    "User-Agent: *\nAllow: /\n\nSitemap: https://sheetly.art/sitemap.xml\n",
  );
  assert.deepEqual(robotsFile(false, "https://sheetly.art"), {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://sheetly.art/sitemap.xml",
  });
  assert.deepEqual(layoutRobots(true), { index: false, follow: false });
  assert.equal(layoutRobots(false), undefined);
  assert.deepEqual(prelaunchResponseHeaders(true), [{ key: "X-Robots-Tag", value: ROBOTS_TAG }]);
  assert.deepEqual(prelaunchResponseHeaders(false), []);
  assert.equal(ROBOTS_TAG, "noindex, nofollow");
});

test("sitemap lists home plus only the public pages that exist", () => {
  assert.deepEqual(publicPagePaths(() => false), ["/"]);
  assert.deepEqual(
    publicPagePaths((pathname) => pathname === "/privacy" || pathname === "/contact"),
    ["/", "/privacy", "/contact"],
  );
  assert.deepEqual(publicPagePaths(() => true), [
    "/",
    "/terms",
    "/privacy",
    "/copyright",
    "/contact",
    "/waitlist",
  ]);
});

test("site origin prefers an explicit URL, then the production host", () => {
  assert.equal(siteOrigin({}), "https://sheetly.art");
  assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://preview.example.com/path" }), "https://preview.example.com");
  assert.equal(siteOrigin({ SITE_URL: "http://localhost:3000" }), "http://localhost:3000");
  assert.equal(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "sheetly.art" }), "https://sheetly.art");
  assert.equal(siteOrigin({ VERCEL_URL: "sheetly-git-preview.vercel.app" }), "https://sheetly-git-preview.vercel.app");
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: "not a url", VERCEL_URL: "preview.example.com" }),
    "https://preview.example.com",
  );
});

test("order and checkout paths are blocked, the sticker maker is not", () => {
  for (const path of ["/order", "/orders/1", "/checkout", "/buy", "/cart", "/pay", "/payment", "/api/checkout", "/api/orders/abc"]) {
    assert.equal(isBlockedOrderPath(path), true, path);
  }
  for (const path of ["/", "/waitlist", "/api/generate", "/api/waitlist", "/sheets", "/ordering"]) {
    assert.equal(isBlockedOrderPath(path), false, path);
  }
});

test("waitlist emails are trimmed, lowercased, and rejected when they are not addresses", () => {
  assert.equal(normalizeWaitlistEmail("  Ada@Example.com "), "ada@example.com");
  assert.equal(normalizeWaitlistEmail("a.b+tag@sub.example.co"), "a.b+tag@sub.example.co");
  assert.equal(normalizeWaitlistEmail("a@b.c"), "a@b.c");
  for (const bad of [
    "",
    "   ",
    "not-an-email",
    "a@b",
    "a@b.",
    "@example.com",
    "user@",
    "user@@example.com",
    "user example@example.com",
    "user@example",
    ".user@example.com",
    "user.@example.com",
    "user..name@example.com",
    "user@-example.com",
    "user@example-.com",
    "user@exam_ple.com",
    "user@exam\nple.com",
    `${"a".repeat(65)}@example.com`,
    `a@${"b".repeat(250)}.com`,
    12,
    null,
    undefined,
  ]) {
    assert.equal(normalizeWaitlistEmail(bad), null, String(bad));
  }
});

test("consent label is the sentence shown next to the checkbox", () => {
  assert.equal(WAITLIST_CONSENT_LABEL, "Email me when Sheetly opens. Unsubscribe anytime.");
});

test("honeypot trips on any filled value and ignores an empty one", () => {
  assert.equal(honeypotTripped(undefined), false);
  assert.equal(honeypotTripped(""), false);
  assert.equal(honeypotTripped("   "), false);
  assert.equal(honeypotTripped("http://spam.example"), true);
  assert.equal(honeypotTripped(1), true);
  assert.equal(honeypotTripped(true), true);
});

test("waitlist IP limits default like the guest IP caps and ignore bad values", () => {
  assert.deepEqual(waitlistLimitsFromEnv({}), {
    perMinute: DEFAULT_WAITLIST_IP_PER_MINUTE,
    perDay: DEFAULT_WAITLIST_IP_DAILY,
  });
  assert.equal(DEFAULT_WAITLIST_IP_PER_MINUTE, 6);
  assert.equal(DEFAULT_WAITLIST_IP_DAILY, 9);
  assert.deepEqual(
    waitlistLimitsFromEnv({ WAITLIST_IP_PER_MINUTE_LIMIT: " 4 ", WAITLIST_IP_DAILY_LIMIT: "10" }),
    { perMinute: 4, perDay: 10 },
  );
  assert.deepEqual(
    waitlistLimitsFromEnv({ WAITLIST_IP_PER_MINUTE_LIMIT: "0", WAITLIST_IP_DAILY_LIMIT: "nope" }),
    { perMinute: 6, perDay: 9 },
  );
});

test("waitlist rate limit uses a rolling minute and then a rolling day", () => {
  const limits = { perMinute: 2, perDay: 3 };
  const now = 1_700_000_000_000;
  assert.deepEqual(evaluateWaitlistUsage({ nowMs: now, events: [], limits }), { allowed: true });
  const minute = evaluateWaitlistUsage({
    nowMs: now,
    events: [{ atMs: now - 1000 }, { atMs: now - 500 }],
    limits,
  });
  assert.equal(minute.allowed, false);
  assert.equal(minute.reason, "minute");
  assert.ok(minute.retryAfterSeconds >= 1 && minute.retryAfterSeconds <= 60);

  const daily = evaluateWaitlistUsage({
    nowMs: now,
    events: [
      { atMs: now - 2 * 60_000 },
      { atMs: now - 3 * 60_000 },
      { atMs: now - 4 * 60_000 },
    ],
    limits,
  });
  assert.equal(daily.allowed, false);
  assert.equal(daily.reason, "daily");

  const limiter = createWaitlistLimiter();
  assert.equal(limiter.consume("203.0.113.9", now, limits).allowed, true);
  assert.equal(limiter.consume("203.0.113.9", now + 1, limits).allowed, true);
  assert.equal(limiter.consume("203.0.113.9", now + 2, limits).allowed, false);
  assert.equal(limiter.consume("203.0.113.10", now + 2, limits).allowed, true);
});

test("database errors for a missing waitlist are friendly, duplicates are not failures", () => {
  assert.equal(classifyWaitlistWriteError({ code: "23505", message: "duplicate key" }), "duplicate");
  assert.equal(classifyWaitlistWriteError({ code: "PGRST205", message: "Could not find the table public.waitlist" }), "missing");
  assert.equal(classifyWaitlistWriteError({ code: "42P01", message: 'relation "public.waitlist" does not exist' }), "missing");
  assert.equal(classifyWaitlistWriteError({ message: "Could not find the table 'public.waitlist' in the schema cache" }), "missing");
  assert.equal(classifyWaitlistWriteError({ code: "08006", message: "connection failure" }), "unavailable");
  assert.equal(classifyWaitlistQuotaError({ code: "PGRST202", message: "Could not find the function consume_waitlist_ip_quota" }), "missing");
  assert.equal(classifyWaitlistQuotaError({ code: "42883", message: "function consume_waitlist_ip_quota does not exist" }), "missing");
  assert.equal(classifyWaitlistQuotaError({ message: "timeout" }), "unavailable");
  assert.deepEqual(interpretWaitlistQuota({ allowed: true }), { allowed: true });
  assert.deepEqual(interpretWaitlistQuota({ allowed: false, reason: "minute", retry_after_seconds: 12.2 }), {
    allowed: false,
    reason: "minute",
    retryAfterSeconds: 13,
  });
  assert.deepEqual(interpretWaitlistQuota(null), { allowed: false, reason: "unavailable" });
});
