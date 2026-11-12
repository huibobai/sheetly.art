/**
 * Checkout feature flag and the first product.
 *
 * CHECKOUT_ENABLED defaults off. Nothing in the UI or the checkout routes
 * is available until it is the exact string "true". Read it at request time
 * (call `connection()` from `next/server` first). Do not prefix it with
 * NEXT_PUBLIC_.
 *
 * Price lives here. Components receive a formatted label. They do not
 * hard-code an amount.
 *
 * Other env vars, all server-only, all optional until checkout is approved:
 * - PAYMENT_PROVIDER — `mock` is the only adapter that ships. Real adapters
 *   are not wired yet (see lib/checkout/provider.ts).
 * - CHECKOUT_MOCK_SECRET — optional override for the local mock signer.
 *   The built-in default is a test fixture, not a credential.
 * - CHECKOUT_FROM_EMAIL — From address for order mail, once a mailbox exists.
 * - RESEND_API_KEY — when this is unset, order mail is logged and not sent.
 * - SUPABASE_SERVICE_ROLE_KEY — needed for a provider webhook that has no
 *   user session. Not required for the local mock purchase. Do not add it
 *   until checkout is approved. See the orders migration.
 */

export const PRODUCT_KINDS = ["digital", "physical"] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];

export type CheckoutProduct = {
  sku: string;
  name: string;
  /** Minor units. 900 is $9.00. */
  amountCents: number;
  currency: "USD";
  kind: ProductKind;
};

/**
 * Digital sticker-sheet download. Physical prints are a later product with
 * `kind: "physical"` in this same config. They are not sold here.
 */
export const CHECKOUT_PRODUCT: CheckoutProduct = {
  sku: "sticker-sheet-digital",
  name: "Sticker sheet download",
  amountCents: 900,
  currency: "USD",
  kind: "digital",
};

export type CheckoutEnv = {
  CHECKOUT_ENABLED?: string;
  PAYMENT_PROVIDER?: string;
  CHECKOUT_MOCK_SECRET?: string;
  CHECKOUT_FROM_EMAIL?: string;
  RESEND_API_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  [key: string]: string | undefined;
};

export type CheckoutGateInput = {
  env?: CheckoutEnv;
  /**
   * feat/prelaunch-mode owns `isPrelaunch()`. This package does not import it.
   * Pass the result here to close checkout without turning the flag off.
   * While checkout is closed, downloads keep today's free behaviour.
   */
  prelaunch?: boolean;
};

export function isCheckoutEnabled(env: CheckoutEnv = process.env): boolean {
  return env.CHECKOUT_ENABLED === "true";
}

export function isCheckoutOpen(input: CheckoutGateInput = {}): boolean {
  const env = input.env ?? process.env;
  if (!isCheckoutEnabled(env)) {
    return false;
  }
  if (input.prelaunch === true) {
    return false;
  }
  return true;
}

/**
 * The one place routes and pages ask whether checkout is open.
 * When feat/prelaunch-mode is merged, pass its check as `prelaunch`.
 * Do not import that module from here; a missing file would break checkout.
 */
export function checkoutRuntimeGate(env: CheckoutEnv = process.env): CheckoutGateInput {
  return {
    env,
    prelaunch: false,
  };
}

export function checkoutProduct(): CheckoutProduct {
  return CHECKOUT_PRODUCT;
}

export type CheckoutOfferView = {
  productName: string;
  priceLabel: string;
};

/** Null while checkout is closed, so callers render no buy UI. */
export function checkoutOfferView(input: CheckoutGateInput = {}): CheckoutOfferView | null {
  if (!isCheckoutOpen(input)) {
    return null;
  }
  const product = checkoutProduct();
  return {
    productName: product.name,
    priceLabel: formatCheckoutPrice(product.amountCents, product.currency),
  };
}

export function checkoutPageState(input: CheckoutGateInput = {}): "open" | "not-found" {
  return isCheckoutOpen(input) ? "open" : "not-found";
}

export function formatCheckoutPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}
