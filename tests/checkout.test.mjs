import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkoutOfferView, checkoutPageState, checkoutProduct, formatCheckoutPrice, isCheckoutEnabled, isCheckoutOpen } from "../lib/checkout/config.ts";
import { orderConfirmationEmail, paymentFailedEmail, resendTransport, sendOrderEmail } from "../lib/checkout/email.ts";
import { downloadAuthDecision, hasPaidForSheet } from "../lib/checkout/entitlement.ts";
import { handlePostCheckout, handlePostWebhook } from "../lib/checkout/handlers.ts";
import { MemoryOrderStore } from "../lib/checkout/orders.ts";
import { createPaymentProvider, MockProvider, PaymentProviderUnavailableError } from "../lib/checkout/provider.ts";
import { emailFooterHtml, emailFooterText } from "../lib/email/footer.ts";

const SHEET_ID = "11111111-1111-4111-8111-111111111111";
const OPEN_ENV = { CHECKOUT_ENABLED: "true", PAYMENT_PROVIDER: "mock" };

function buyer() {
  return { id: "22222222-2222-4222-8222-222222222222", email: "buyer@example.com", is_anonymous: false };
}

function checkoutRequest(sheetId = SHEET_ID) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sheetId }),
  });
}

test("checkout flag defaults off and only the exact string true turns it on", () => {
  assert.equal(isCheckoutEnabled({}), false);
  assert.equal(isCheckoutEnabled({ CHECKOUT_ENABLED: "true" }), true);
  assert.equal(isCheckoutEnabled({ CHECKOUT_ENABLED: "TRUE" }), false);
  assert.equal(isCheckoutEnabled({ CHECKOUT_ENABLED: "1" }), false);
  assert.equal(isCheckoutEnabled({ CHECKOUT_ENABLED: " true" }), false);
  assert.equal(isCheckoutOpen({ env: {} }), false);
  assert.equal(isCheckoutOpen({ env: { CHECKOUT_ENABLED: "true" }, prelaunch: true }), false);
  assert.equal(checkoutPageState({ env: {} }), "not-found");
  assert.equal(checkoutPageState({ env: OPEN_ENV, prelaunch: true }), "not-found");
  assert.equal(checkoutPageState({ env: OPEN_ENV }), "open");
  assert.equal(checkoutOfferView({ env: {} }), null);
});

test("price comes from config and formats as US dollars", () => {
  const product = checkoutProduct();
  assert.equal(product.amountCents, 900);
  assert.equal(product.currency, "USD");
  assert.equal(product.kind, "digital");
  assert.equal(product.sku, "sticker-sheet-digital");
  assert.equal(formatCheckoutPrice(product.amountCents, product.currency), "$9.00");
  assert.equal(formatCheckoutPrice(1099, "USD"), "$10.99");
  assert.equal(formatCheckoutPrice(0, "USD"), "$0.00");
  const offer = checkoutOfferView({ env: OPEN_ENV });
  assert.equal(offer?.priceLabel, "$9.00");
  assert.equal(offer?.productName, product.name);
});

test("checkout routes and pages stay closed when the flag is off or prelaunch blocks them", async () => {
  const post = await handlePostCheckout(checkoutRequest(), { env: {} });
  const webhook = await handlePostWebhook(new Request("http://localhost/api/checkout/webhook", { method: "POST", body: "{}" }), {
    env: {},
  });
  const prelaunch = await handlePostCheckout(checkoutRequest(), { env: OPEN_ENV, prelaunch: true, user: buyer(), sheetOwned: true });
  assert.equal(post.status, 404);
  assert.equal(webhook.status, 404);
  assert.equal(prelaunch.status, 404);
  assert.equal(await post.text(), "");

  for (const [file, needle] of [
    ["app/api/checkout/route.ts", "checkoutClosedResponse"],
    ["app/api/checkout/webhook/route.ts", "checkoutClosedResponse"],
    ["app/checkout/success/page.tsx", "checkoutPageState"],
    ["app/checkout/cancel/page.tsx", "checkoutPageState"],
    ["app/checkout/mock/page.tsx", "checkoutPageState"],
  ]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(text.includes(needle), true, file);
  }
});

test("a guest cannot start checkout, and the order uses the config price", async () => {
  const provider = createPaymentProvider(OPEN_ENV);
  const store = new MemoryOrderStore();
  const guest = await handlePostCheckout(checkoutRequest(), {
    env: OPEN_ENV,
    user: { id: buyer().id, email: null, is_anonymous: true },
    sheetOwned: true,
    store,
    provider,
    origin: "http://localhost:3000",
  });
  assert.equal(guest.status, 401);
  assert.equal(store.orders.length, 0);

  const started = await handlePostCheckout(checkoutRequest(), {
    env: OPEN_ENV,
    user: buyer(),
    sheetOwned: true,
    store,
    provider,
    origin: "http://localhost:3000",
  });
  assert.equal(started.status, 200);
  assert.equal(store.orders[0].amountCents, checkoutProduct().amountCents);
  assert.equal(store.orders[0].sheetId, SHEET_ID);
});

test("free download decision is unchanged while checkout is closed", () => {
  assert.deepEqual(downloadAuthDecision({ permanent: true, checkoutOpen: false, paid: false }), {
    status: 200,
    body: { ok: true },
  });
  assert.deepEqual(downloadAuthDecision({ permanent: false, checkoutOpen: false, paid: true }), {
    status: 401,
    body: { error: "Sign in to download this sheet.", code: "auth_required" },
  });
  assert.deepEqual(downloadAuthDecision({ permanent: true, checkoutOpen: true, paid: false }), {
    status: 402,
    body: { error: "Buy this download to unlock the file.", code: "payment_required" },
  });
  assert.deepEqual(downloadAuthDecision({ permanent: true, checkoutOpen: true, paid: true }), {
    status: 200,
    body: { ok: true },
  });
});

test("hasPaidForSheet does not look up an order while checkout is closed", async () => {
  let called = false;
  const paid = await hasPaidForSheet({
    userId: buyer().id,
    sheetId: SHEET_ID,
    env: {},
    lookup: async () => {
      called = true;
      return true;
    },
  });
  assert.equal(paid, false);
  assert.equal(called, false);
});

test("mock provider happy path creates a pending order and a signed paid event unlocks the sheet", async () => {
  const provider = createPaymentProvider(OPEN_ENV);
  assert.equal(provider instanceof MockProvider, true);
  const store = new MemoryOrderStore();
  const transportCalls = [];
  const started = await handlePostCheckout(checkoutRequest(), {
    env: OPEN_ENV,
    user: buyer(),
    sheetOwned: true,
    origin: "http://localhost:3000",
    store,
    provider,
    transport: async (message) => {
      transportCalls.push(message);
    },
  });
  assert.equal(started.status, 200);
  const startedBody = await started.json();
  assert.equal(startedBody.url.startsWith("http://localhost:3000/checkout/mock?"), true);
  assert.equal(store.orders.length, 1);
  assert.equal(store.orders[0].status, "pending");
  assert.equal(store.orders[0].amountCents, 900);
  assert.equal(store.orders[0].currency, "USD");
  assert.equal(store.orders[0].provider, "mock");
  assert.equal(store.orders[0].sku, checkoutProduct().sku);

  const signed = provider.signedEvent({
    orderId: store.orders[0].id,
    sessionId: store.orders[0].providerSessionId,
  });
  assert.equal(provider.verifyWebhook(signed.rawBody, signed.signature), true);
  assert.equal(provider.verifyWebhook(`${signed.rawBody} `, signed.signature), false);

  const paid = await handlePostWebhook(
    new Request("http://localhost/api/checkout/webhook", {
      method: "POST",
      headers: { [provider.signatureHeader]: signed.signature },
      body: signed.rawBody,
    }),
    { env: OPEN_ENV, store, provider, origin: "http://localhost:3000" },
  );
  assert.equal(paid.status, 200);
  const paidBody = await paid.json();
  assert.equal(paidBody.duplicate, false);
  assert.equal(paidBody.status, "paid");
  assert.equal(store.orders[0].status, "paid");
  assert.equal(store.events.length, 1);
  assert.equal(transportCalls.length, 0);

  const again = await handlePostWebhook(
    new Request("http://localhost/api/checkout/webhook", {
      method: "POST",
      headers: { [provider.signatureHeader]: signed.signature },
      body: signed.rawBody,
    }),
    { env: OPEN_ENV, store, provider, origin: "http://localhost:3000" },
  );
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(store.events.length, 1);
  assert.equal(store.orders[0].status, "paid");

  const entitled = await hasPaidForSheet({
    userId: buyer().id,
    sheetId: SHEET_ID,
    env: OPEN_ENV,
    lookup: async (query) => (await store.findPaid(query)) !== null,
  });
  assert.equal(entitled, true);

  const failedLater = provider.signedEvent({
    orderId: store.orders[0].id,
    sessionId: store.orders[0].providerSessionId,
    type: "failed",
  });
  const failedResponse = await handlePostWebhook(
    new Request("http://localhost/api/checkout/webhook", {
      method: "POST",
      headers: { [provider.signatureHeader]: failedLater.signature },
      body: failedLater.rawBody,
    }),
    { env: OPEN_ENV, store, provider },
  );
  assert.equal(failedResponse.status, 200);
  assert.equal(store.orders[0].status, "paid");
});

test("webhook rejects a bad signature and does not record an event", async () => {
  const provider = createPaymentProvider(OPEN_ENV);
  const store = new MemoryOrderStore();
  await handlePostCheckout(checkoutRequest(), {
    env: OPEN_ENV,
    user: buyer(),
    sheetOwned: true,
    origin: "http://localhost:3000",
    store,
    provider,
  });
  const signed = provider.signedEvent({
    orderId: store.orders[0].id,
    sessionId: store.orders[0].providerSessionId,
  });
  const rejected = await handlePostWebhook(
    new Request("http://localhost/api/checkout/webhook", {
      method: "POST",
      headers: { [provider.signatureHeader]: "0".repeat(signed.signature.length) },
      body: signed.rawBody,
    }),
    { env: OPEN_ENV, store, provider },
  );
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, "invalid_signature");
  assert.equal(store.orders[0].status, "pending");
  assert.equal(store.events.length, 0);

  const missing = await handlePostWebhook(
    new Request("http://localhost/api/checkout/webhook", {
      method: "POST",
      body: signed.rawBody,
    }),
    { env: OPEN_ENV, store, provider },
  );
  assert.equal(missing.status, 400);
  assert.equal(store.events.length, 0);
});

test("unknown provider name is refused without a paid adapter", () => {
  assert.throws(() => createPaymentProvider({ PAYMENT_PROVIDER: "example" }), PaymentProviderUnavailableError);
});

test("order emails include the shared footer, and the sender stays quiet without a key", async () => {
  const confirmation = orderConfirmationEmail({
    productName: checkoutProduct().name,
    priceLabel: formatCheckoutPrice(900, "USD"),
    orderId: "order-1",
    downloadUrl: "https://sheetly.art/?sheet=abc",
  });
  const failed = paymentFailedEmail({
    productName: checkoutProduct().name,
    priceLabel: "$9.00",
    orderId: "order-1",
    sheetUrl: "https://sheetly.art/?sheet=abc",
  });
  const footerHtml = emailFooterHtml();
  const footerText = emailFooterText();
  assert.equal(confirmation.html.includes(footerHtml), true);
  assert.equal(confirmation.text.includes(footerText), true);
  assert.equal(failed.html.includes(footerHtml), true);
  assert.equal(failed.text.includes(footerText), true);
  for (const path of ["/terms", "/privacy", "/contact"]) {
    assert.equal(confirmation.html.includes(path), true, path);
    assert.equal(failed.text.includes(path), true, path);
  }
  assert.equal(confirmation.html.includes("Download your sheet"), true);
  assert.equal(failed.html.includes("Download your sheet"), false);

  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  };
  try {
    const message = { to: "buyer@example.com", subject: "Hello", html: "<p>Hello</p>", text: "Hello" };
    assert.equal(await sendOrderEmail(message, { CHECKOUT_ENABLED: "false", RESEND_API_KEY: "test-key", CHECKOUT_FROM_EMAIL: "orders@example.com" }, resendTransport), "skipped");
    assert.equal(await sendOrderEmail(message, { CHECKOUT_ENABLED: "true", CHECKOUT_FROM_EMAIL: "orders@example.com" }, resendTransport), "skipped");
    assert.equal(await sendOrderEmail(message, { CHECKOUT_ENABLED: "true", RESEND_API_KEY: "test-key" }, resendTransport), "skipped");
    assert.equal(calls.length, 0);
    assert.equal(
      await sendOrderEmail(message, { CHECKOUT_ENABLED: "true", RESEND_API_KEY: "test-key", CHECKOUT_FROM_EMAIL: "orders@example.com" }, resendTransport),
      "sent",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].body.from, "orders@example.com");
    assert.deepEqual(calls[0].body.to, ["buyer@example.com"]);
  } finally {
    globalThis.fetch = previous;
  }
});

test("buy UI does not hard-code the price, and checkout screens do not name a provider", () => {
  const buy = readFileSync(new URL("../components/SheetBuy.tsx", import.meta.url), "utf8");
  const sheet = readFileSync(new URL("../components/StickerSheet.tsx", import.meta.url), "utf8");
  assert.equal(buy.includes("900"), false);
  assert.equal(buy.includes("$9"), false);
  assert.equal(buy.includes("amountCents"), false);
  assert.equal(sheet.includes("checkoutOffer && !checkoutPaid"), true);
  assert.equal(sheet.replaceAll("stone-900", "").includes("900"), false);

  for (const file of [
    "components/SheetBuy.tsx",
    "components/CheckoutPanel.tsx",
    "components/StickerSheet.tsx",
    "app/checkout/success/page.tsx",
    "app/checkout/cancel/page.tsx",
    "app/checkout/mock/page.tsx",
  ]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").toLowerCase();
    for (const brand of ["stripe", "paypal", "lemon squeezy", "lemonsqueezy", "paddle"]) {
      assert.equal(text.includes(brand), false, `${file} mentions ${brand}`);
    }
  }
});

test("orders migration defines both tables, own-row reads, and webhook idempotency", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261112120000_orders.sql", import.meta.url), "utf8");
  assert.equal(sql.includes("create table if not exists public.orders"), true);
  assert.equal(sql.includes("create table if not exists public.order_events"), true);
  assert.equal(sql.includes("orders_provider_session_key unique (provider, provider_session_id)"), true);
  assert.equal(sql.includes("order_events_idempotency_key_key unique (idempotency_key)"), true);
  assert.equal(sql.includes("enable row level security"), true);
  assert.equal(sql.includes("Users can read their orders"), true);
  assert.equal(sql.includes("Users can start a pending order"), true);
  assert.equal(sql.includes("record_mock_checkout_event"), true);
  assert.equal(sql.includes("SUPABASE_SERVICE_ROLE_KEY"), true);
  assert.equal(sql.toLowerCase().includes("drop table"), false);
});
