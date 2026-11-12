/**
 * Order mail. Nothing is sent unless checkout is on and RESEND_API_KEY is set.
 * Tests pass their own transport. The default transport is the only place that
 * calls the mail API, and sendOrderEmail does not reach it when the flag is
 * off or the key is missing.
 */

import { checkoutProduct, formatCheckoutPrice, isCheckoutEnabled, type CheckoutEnv } from "./config.ts";
import { emailFooterHtml, emailFooterText } from "../email/footer.ts";
import type { OrderRecord } from "./orders.ts";

export type OrderEmail = {
  subject: string;
  html: string;
  text: string;
};

export type EmailTransportMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
};

export type EmailTransport = (message: EmailTransportMessage) => Promise<void>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function withFooter(textBody: string, htmlBody: string): { html: string; text: string } {
  return {
    text: `${textBody}\n\n${emailFooterText()}`,
    html: `${htmlBody}${emailFooterHtml()}`,
  };
}

export function orderConfirmationEmail(input: {
  productName: string;
  priceLabel: string;
  orderId: string;
  downloadUrl: string | null;
}): OrderEmail {
  const subject = `Your ${input.productName} is ready`;
  const downloadLine = input.downloadUrl ? `Download: ${input.downloadUrl}` : "Your download is on the order page.";
  const downloadHtml = input.downloadUrl
    ? `<p><a href="${escapeHtml(input.downloadUrl)}">Download your sheet</a></p>`
    : "<p>Your download is on the order page.</p>";
  const body = withFooter(
    [`Thanks for your order.`, ``, `Order: ${input.orderId}`, `Item: ${input.productName}`, `Total: ${input.priceLabel}`, downloadLine].join(
      "\n",
    ),
    [
      `<article>`,
      `<h1>${escapeHtml(subject)}</h1>`,
      `<p>Thanks for your order.</p>`,
      `<p>Order: ${escapeHtml(input.orderId)}</p>`,
      `<p>Item: ${escapeHtml(input.productName)}</p>`,
      `<p>Total: ${escapeHtml(input.priceLabel)}</p>`,
      downloadHtml,
      `</article>`,
    ].join(""),
  );
  return { subject, ...body };
}

export function paymentFailedEmail(input: { productName: string; priceLabel: string; orderId: string; sheetUrl: string | null }): OrderEmail {
  const subject = `Payment wasn't completed`;
  const returnLine = input.sheetUrl ? `You can try again: ${input.sheetUrl}` : "You can return to your sheet and try again.";
  const returnHtml = input.sheetUrl
    ? `<p><a href="${escapeHtml(input.sheetUrl)}">Back to your sheet</a></p>`
    : "<p>You can return to your sheet and try again.</p>";
  const body = withFooter(
    [
      `We couldn't take payment for ${input.productName}.`,
      `You have not been charged.`,
      ``,
      `Order: ${input.orderId}`,
      `Total: ${input.priceLabel}`,
      returnLine,
    ].join("\n"),
    [
      `<article>`,
      `<h1>${escapeHtml(subject)}</h1>`,
      `<p>We couldn't take payment for ${escapeHtml(input.productName)}. You have not been charged.</p>`,
      `<p>Order: ${escapeHtml(input.orderId)}</p>`,
      `<p>Total: ${escapeHtml(input.priceLabel)}</p>`,
      returnHtml,
      `</article>`,
    ].join(""),
  );
  return { subject, ...body };
}

export function emailForOrder(order: OrderRecord, origin: string): OrderEmail | null {
  const product = checkoutProduct();
  const priceLabel = formatCheckoutPrice(order.amountCents, order.currency);
  const productName = order.sku === product.sku ? product.name : order.sku;
  const sheetUrl = order.sheetId ? `${origin}/?sheet=${encodeURIComponent(order.sheetId)}` : null;
  if (order.status === "paid") {
    return orderConfirmationEmail({
      productName,
      priceLabel,
      orderId: order.id,
      downloadUrl: sheetUrl,
    });
  }
  if (order.status === "failed") {
    return paymentFailedEmail({
      productName,
      priceLabel,
      orderId: order.id,
      sheetUrl,
    });
  }
  return null;
}

/** Logs and returns skipped unless checkout is on, a key is set, and a from-address is set. */
export async function sendOrderEmail(
  message: { to: string | null; subject: string; html: string; text: string },
  env: CheckoutEnv = process.env,
  transport: EmailTransport = resendTransport,
): Promise<"sent" | "skipped"> {
  if (!message.to) {
    console.info("[checkout-email] skipped", { reason: "no_recipient", subject: message.subject });
    return "skipped";
  }
  if (!isCheckoutEnabled(env) || !env.RESEND_API_KEY) {
    console.info("[checkout-email] skipped", {
      reason: !isCheckoutEnabled(env) ? "checkout_disabled" : "no_api_key",
      subject: message.subject,
    });
    return "skipped";
  }
  const from = env.CHECKOUT_FROM_EMAIL?.trim();
  if (!from) {
    console.info("[checkout-email] skipped", { reason: "no_from_address", subject: message.subject });
    return "skipped";
  }
  await transport({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    apiKey: env.RESEND_API_KEY,
  });
  return "sent";
}

export async function resendTransport(message: EmailTransportMessage): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${message.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}`);
  }
}
