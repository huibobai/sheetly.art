"use server";

import { isPermanentUser } from "@/lib/auth-user";
import { checkoutPageState, checkoutRuntimeGate } from "@/lib/checkout/config";
import { applySignedWebhook } from "@/lib/checkout/handlers";
import { createCheckoutOrderStore } from "@/lib/checkout/store";
import { EMAIL_SITE_ORIGIN } from "@/lib/email/footer";
import { isSheetId } from "@/lib/legal";
import { createPaymentProvider, MockProvider } from "@/lib/checkout/provider";
import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

async function pageOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host")?.split(",")[0]?.trim() || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (!host) {
    return EMAIL_SITE_ORIGIN;
  }
  return `${proto}://${host}`;
}

/** Records a signed mock payment for the signed-in user's pending order, then leaves the test page. */
export async function completeMockPayment(formData: FormData) {
  await connection();
  const gate = checkoutRuntimeGate();
  if (checkoutPageState(gate) === "not-found") {
    notFound();
  }
  const providerName = (gate.env?.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (providerName !== "mock") {
    notFound();
  }

  const orderId = String(formData.get("orderId") ?? "");
  if (!isSheetId(orderId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPermanentUser(user)) {
    redirect("/");
  }

  const store = createCheckoutOrderStore(supabase, gate.env);
  const order = await store.findByIdForUser(orderId, user.id);
  if (!order || order.provider !== "mock") {
    notFound();
  }
  if (order.status === "paid") {
    redirect(`/checkout/success?order=${encodeURIComponent(order.id)}`);
  }
  if (order.status !== "pending" || !order.providerSessionId) {
    notFound();
  }

  const provider = createPaymentProvider(gate.env);
  if (!(provider instanceof MockProvider)) {
    notFound();
  }

  const signed = provider.signedEvent({
    orderId: order.id,
    sessionId: order.providerSessionId,
  });
  const response = await applySignedWebhook({
    rawBody: signed.rawBody,
    signature: signed.signature,
    provider,
    store,
    env: gate.env,
    origin: await pageOrigin(),
  });

  const sheet = order.sheetId ? `&sheet=${encodeURIComponent(order.sheetId)}` : "";
  if (response.status !== 200) {
    redirect(`/checkout/cancel?order=${encodeURIComponent(order.id)}${sheet}&error=1`);
  }
  redirect(`/checkout/success?order=${encodeURIComponent(order.id)}`);
}
