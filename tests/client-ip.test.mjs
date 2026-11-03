import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIpFromHeaders, normalizeClientIp, resolveGuestIp } from "../lib/client-ip.ts";

function headers(values) {
  return new Headers(values);
}

test("the first x-forwarded-for hop is the visitor", () => {
  const ip = clientIpFromHeaders(headers({
    "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2",
    "x-real-ip": "198.51.100.4",
  }));
  assert.equal(ip, "203.0.113.9");
});

test("x-real-ip is used when the forwarded header is missing or junk", () => {
  assert.equal(clientIpFromHeaders(headers({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  assert.equal(
    clientIpFromHeaders(headers({ "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.20" })),
    "198.51.100.20",
  );
});

test("nonsense and spoof-looking values are dropped", () => {
  assert.equal(normalizeClientIp(""), null);
  assert.equal(normalizeClientIp("999.1.1.1"), null);
  assert.equal(normalizeClientIp("1.2.3.4.5"), null);
  assert.equal(normalizeClientIp("javascript:alert(1)"), null);
  assert.equal(normalizeClientIp("203.0.113.4:443"), "203.0.113.4");
  assert.equal(clientIpFromHeaders(headers({})), null);
});

test("production fails closed without a proxy header, other environments share a local bucket", () => {
  const empty = headers({});
  assert.equal(resolveGuestIp(empty, "production"), null);
  assert.equal(resolveGuestIp(empty, "development"), "127.0.0.1");
  assert.equal(resolveGuestIp(headers({ "x-real-ip": "203.0.113.4" }), "production"), "203.0.113.4");
});
