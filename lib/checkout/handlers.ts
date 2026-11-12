import { randomUUID } from "node:crypto";
import { isPermanentUser } from "../auth-user.ts";
import { isSheetId } from "../legal.ts";
import { checkoutProduct, isCheckoutOpen, type CheckoutEnv } from "./config.ts";
import { emailForOrder, sendOrderEmail, type EmailTransport } from "./email.ts";
import { newPendingOrder, openProviderSession, type OrderStore } from "./orders.ts";
import { createPaymentProvider, PaymentProviderUnavailableError, type PaymentProvider } from "./provider.ts";

export type CheckoutUser = {
  id: string;
  email: string | null;
  is_anonymous?: boolean;
};

export type CheckoutHandlerDeps = {
  env?: CheckoutEnv;
  /** Pass isPrelaunch() from feat/prelaunch-mode. This handler does not import it. */
  prelaunch?: boolean;
  user?: CheckoutUser | null;
  sheetOwned?: boolean;
  origin?: string;
  store?: OrderStore;
  provider?: PaymentProvider;
  transport?: EmailTransport;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function checkoutClosedResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function gateOf(deps: CheckoutHandlerDeps) {
  return {
    env: deps.env ?? process.env,
    prelaunch: deps.prelaunch,
  };
}

export async function handlePostCheckout(request: Request, deps: CheckoutHandlerDeps = {}): Promise<Response> {
  const gate = gateOf(deps);
  if (!isCheckoutOpen(gate)) {
    return checkoutClosedResponse();
  }

  const user = deps.user ?? null;
  if (!isPermanentUser(user)) {
    return json({ error: "Sign in to buy this download.", code: "auth_required" }, 401);
  }

  let body: { sheetId?: unknown };
  try {
    body = (await request.json()) as { sheetId?: unknown };
  } catch {
    body = {};
  }
  const sheetId = typeof body.sheetId === "string" ? body.sheetId : "";
  if (!isSheetId(sheetId)) {
    return json({ error: "Choose a saved sheet to buy." }, 400);
  }
  if (!deps.sheetOwned) {
    return json({ error: "We couldn't find that sheet." }, 404);
  }
  if (!deps.store) {
    return json({ error: "order_writer_unavailable" }, 503);
  }

  let provider: PaymentProvider;
  try {
    provider = deps.provider ?? createPaymentProvider(gate.env);
  } catch (error) {
    console.error("[checkout] provider", error instanceof Error ? error.message : error);
    return json({ error: "payment_provider_unavailable" }, 503);
  }

  const product = checkoutProduct();
  const origin = deps.origin ?? originFromRequest(request);
  try {
    const paid = await deps.store.findPaid({
      userId: user.id,
      sheetId,
      sku: product.sku,
      provider: provider.name,
    });
    if (paid) {
      return json(
        {
          url: `${origin}/checkout/success?order=${encodeURIComponent(paid.id)}`,
          alreadyPaid: true,
        },
        200,
      );
    }
  } catch (error) {
    console.error("[checkout] paid lookup", error);
    return json({ error: "We couldn't start checkout. Please try again." }, 500);
  }

  const orderId = randomUUID();
  let session: { sessionId: string; redirectUrl: string };
  try {
    session = await openProviderSession({
      orderId,
      sheetId,
      product,
      customerEmail: user.email,
      origin,
      provider,
    });
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) {
      return json({ error: "payment_provider_unavailable" }, 503);
    }
    console.error("[checkout] session", error);
    return json({ error: "We couldn't start checkout. Please try again." }, 500);
  }

  const order = newPendingOrder({
    id: orderId,
    userId: user.id,
    sheetId,
    product,
    provider: provider.name,
    providerSessionId: session.sessionId,
    customerEmail: user.email,
  });

  try {
    await deps.store.insertPending(order);
  } catch (error) {
    console.error("[checkout] insert", error);
    return json({ error: "We couldn't start checkout. Please try again." }, 500);
  }

  return json({ url: session.redirectUrl }, 200);
}

export async function applySignedWebhook(input: {
  rawBody: string;
  signature: string | null;
  provider: PaymentProvider;
  store: OrderStore;
  env?: CheckoutEnv;
  origin: string;
  transport?: EmailTransport;
}): Promise<Response> {
  if (!input.provider.verifyWebhook(input.rawBody, input.signature)) {
    return json({ error: "invalid_signature" }, 400);
  }

  let event;
  try {
    event = input.provider.parseWebhookEvent(input.rawBody);
  } catch {
    return json({ error: "invalid_event" }, 400);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(input.rawBody) as unknown;
  } catch {
    payload = { raw: input.rawBody };
  }

  const result = await input.store.applyEvent(event, payload, input.provider.name);
  if (result.kind === "duplicate") {
    return json({ ok: true, duplicate: true }, 200);
  }
  if (result.kind === "unmatched") {
    return json({ error: "order_not_found" }, 404);
  }
  if (result.kind === "unavailable") {
    return json({ error: "order_writer_unavailable" }, 503);
  }

  if (result.previousStatus !== result.order.status) {
    const message = emailForOrder(result.order, input.origin);
    if (message) {
      try {
        await sendOrderEmail(
          { to: result.order.customerEmail, ...message },
          input.env ?? process.env,
          input.transport,
        );
      } catch (error) {
        console.error("[checkout-email] send", error);
      }
    }
  }

  return json({ ok: true, duplicate: false, status: result.order.status, orderId: result.order.id }, 200);
}

export async function handlePostWebhook(request: Request, deps: CheckoutHandlerDeps = {}): Promise<Response> {
  const gate = gateOf(deps);
  if (!isCheckoutOpen(gate)) {
    return checkoutClosedResponse();
  }

  let provider: PaymentProvider;
  try {
    provider = deps.provider ?? createPaymentProvider(gate.env);
  } catch (error) {
    console.error("[checkout] provider", error instanceof Error ? error.message : error);
    return json({ error: "payment_provider_unavailable" }, 503);
  }
  if (!deps.store) {
    return json({ error: "order_writer_unavailable" }, 503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get(provider.signatureHeader);
  return applySignedWebhook({
    rawBody,
    signature,
    provider,
    store: deps.store,
    env: gate.env,
    origin: deps.origin ?? originFromRequest(request),
    transport: deps.transport,
  });
}
