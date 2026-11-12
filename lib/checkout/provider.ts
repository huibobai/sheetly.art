/**
 * Payment provider boundary.
 *
 * Only MockProvider is implemented. It is a local test checkout: no money
 * moves, and no provider SDK is imported. Select it with PAYMENT_PROVIDER=mock.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CheckoutEnv } from "./config.ts";

export const MOCK_SIGNATURE_HEADER = "x-sheetly-signature";

/**
 * Test fixture used when CHECKOUT_MOCK_SECRET is unset.
 * This is not a credential. Do not use PAYMENT_PROVIDER=mock in production.
 */
export const MOCK_CHECKOUT_SECRET = "mock-checkout-not-a-secret";

export const NORMALIZED_EVENT_TYPES = ["paid", "failed", "refunded", "expired"] as const;

export type NormalizedEventType = (typeof NORMALIZED_EVENT_TYPES)[number];

export type CheckoutSessionRequest = {
  orderId: string;
  sku: string;
  productName: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionResult = {
  sessionId: string;
  redirectUrl: string;
};

export type NormalizedWebhookEvent = {
  id: string;
  type: NormalizedEventType;
  sessionId: string;
  paymentId: string | null;
  orderId: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  readonly signatureHeader: string;
  createCheckoutSession(input: CheckoutSessionRequest): Promise<CheckoutSessionResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent;
}

export class PaymentProviderUnavailableError extends Error {
  constructor(message = "No payment adapter is configured.") {
    super(message);
    this.name = "PaymentProviderUnavailableError";
  }
}

type MockEventBody = {
  id?: unknown;
  type?: unknown;
  sessionId?: unknown;
  paymentId?: unknown;
  orderId?: unknown;
};

function isEventType(value: unknown): value is NormalizedEventType {
  return typeof value === "string" && (NORMALIZED_EVENT_TYPES as readonly string[]).includes(value);
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock";
  readonly signatureHeader = MOCK_SIGNATURE_HEADER;
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  async createCheckoutSession(input: CheckoutSessionRequest): Promise<CheckoutSessionResult> {
    const success = new URL(input.successUrl);
    const cancel = new URL(input.cancelUrl);
    if (success.origin !== cancel.origin) {
      throw new Error("Checkout return URLs must share an origin.");
    }
    const sessionId = `mock_sess_${randomUUID()}`;
    const page = new URL("/checkout/mock", success.origin);
    page.searchParams.set("order", input.orderId);
    page.searchParams.set("session", sessionId);
    return { sessionId, redirectUrl: page.toString() };
  }

  sign(rawBody: string): string {
    return createHmac("sha256", this.#secret).update(rawBody).digest("hex");
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!signature) {
      return false;
    }
    const expected = this.sign(rawBody);
    const actual = signature.trim().toLowerCase();
    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(actual, "utf8");
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent {
    let parsed: MockEventBody;
    try {
      parsed = JSON.parse(rawBody) as MockEventBody;
    } catch {
      throw new Error("invalid_mock_event");
    }
    if (typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id.length > 200) {
      throw new Error("invalid_mock_event");
    }
    if (!isEventType(parsed.type)) {
      throw new Error("invalid_mock_event");
    }
    if (typeof parsed.sessionId !== "string" || parsed.sessionId.length === 0) {
      throw new Error("invalid_mock_event");
    }
    const paymentId = typeof parsed.paymentId === "string" && parsed.paymentId.length > 0 ? parsed.paymentId : null;
    const orderId = typeof parsed.orderId === "string" && parsed.orderId.length > 0 ? parsed.orderId : null;
    return {
      id: parsed.id,
      type: parsed.type,
      sessionId: parsed.sessionId,
      paymentId,
      orderId,
    };
  }

  /** Build a signed test event. The webhook handler verifies it like any other payload. */
  signedEvent(input: {
    orderId: string;
    sessionId: string;
    type?: NormalizedEventType;
    eventId?: string;
    paymentId?: string | null;
  }): { rawBody: string; signature: string } {
    const rawBody = JSON.stringify({
      id: input.eventId ?? `mock:${randomUUID()}`,
      type: input.type ?? "paid",
      sessionId: input.sessionId,
      paymentId: input.paymentId === undefined ? `mock_pay_${randomUUID()}` : input.paymentId,
      orderId: input.orderId,
    });
    return { rawBody, signature: this.sign(rawBody) };
  }
}

export function createPaymentProvider(env: CheckoutEnv = process.env): PaymentProvider {
  const name = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (name === "mock") {
    const secret = env.CHECKOUT_MOCK_SECRET?.trim() || MOCK_CHECKOUT_SECRET;
    return new MockProvider(secret);
  }

  // TODO(checkout): plug a real adapter in here once a provider is chosen.
  // Do not import a provider SDK. Add a class that implements PaymentProvider
  // and return it for that PAYMENT_PROVIDER value.
  //
  // Stripe (PAYMENT_PROVIDER=stripe)
  //   createCheckoutSession: one-time checkout for checkoutProduct()
  //   verifyWebhook: signature over the raw body
  //   parseWebhookEvent: map the provider event onto paid, failed, refunded, or expired
  //
  // PayPal (PAYMENT_PROVIDER=paypal)
  //   createCheckoutSession: order approve link
  //   verifyWebhook: transmission signature
  //   parseWebhookEvent: capture completed -> paid, denied -> failed, refunded, voided -> expired
  //
  // Lemon Squeezy (PAYMENT_PROVIDER=lemonsqueezy)
  //   createCheckoutSession: hosted checkout URL, custom data carries the order id
  //   verifyWebhook: HMAC of the raw body
  //   parseWebhookEvent: order created -> paid, refunded, expired
  //
  // Paddle (PAYMENT_PROVIDER=paddle)
  //   createCheckoutSession: transaction checkout URL
  //   verifyWebhook: signature header
  //   parseWebhookEvent: transaction completed -> paid, payment failed, adjustment refunded, canceled -> expired
  //
  // Those webhooks have no user session. Status writes need
  // SUPABASE_SERVICE_ROLE_KEY. See supabase/migrations/20261112120000_orders.sql.

  throw new PaymentProviderUnavailableError(
    name ? `No payment adapter is configured for "${name}".` : "Set PAYMENT_PROVIDER=mock until a provider adapter is added.",
  );
}
