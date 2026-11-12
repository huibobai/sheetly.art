import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CheckoutPanel, checkoutLinkClass } from "@/components/CheckoutPanel";
import { completeMockPayment } from "@/app/checkout/mock/actions";
import { checkoutPageState, checkoutProduct, checkoutRuntimeGate, formatCheckoutPrice } from "@/lib/checkout/config";
import { ownOrder } from "@/lib/checkout/load";
import { orderStatusLabel } from "@/lib/checkout/orders";
import { isPermanentUser } from "@/lib/auth-user";
import { isSheetId } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Test checkout · sheetly.art",
  robots: { index: false, follow: false },
};

function firstQuery(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; session?: string | string[] }>;
}) {
  await connection();
  const gate = checkoutRuntimeGate();
  if (checkoutPageState(gate) === "not-found") {
    notFound();
  }
  if ((gate.env?.PAYMENT_PROVIDER ?? "").trim().toLowerCase() !== "mock") {
    notFound();
  }

  const params = await searchParams;
  const orderId = firstQuery(params.order);
  const sessionId = firstQuery(params.session);
  if (!orderId || !sessionId || !isSheetId(orderId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPermanentUser(user)) {
    return (
      <CheckoutPanel title="Test checkout">
        <p className="text-sm leading-6">Sign in to finish this test payment. No payment is taken.</p>
        <p>
          <Link className={checkoutLinkClass} href="/">
            Back home
          </Link>
        </p>
      </CheckoutPanel>
    );
  }

  const order = await ownOrder(orderId);
  if (!order || order.provider !== "mock" || order.providerSessionId !== sessionId) {
    notFound();
  }

  const product = checkoutProduct();
  const name = order.sku === product.sku ? product.name : order.sku;
  const price = formatCheckoutPrice(order.amountCents, order.currency);
  const cancelHref = `/checkout/cancel?order=${encodeURIComponent(order.id)}${
    order.sheetId && isSheetId(order.sheetId) ? `&sheet=${encodeURIComponent(order.sheetId)}` : ""
  }`;

  return (
    <CheckoutPanel title="Test checkout">
      <p className="text-sm leading-6 text-muted">This is a pretend checkout. No payment is taken.</p>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{name}</p>
        <p className="font-semibold">{price}</p>
      </div>
      {order.status === "pending" ? (
        <form action={completeMockPayment}>
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-accent-strong"
          >
            Complete test payment
          </button>
        </form>
      ) : (
        <p className="text-sm">
          This test checkout is already {orderStatusLabel(order.status).toLowerCase()}.{" "}
          <Link className={checkoutLinkClass} href={`/checkout/success?order=${encodeURIComponent(order.id)}`}>
            View the order
          </Link>
        </p>
      )}
      <p>
        <Link className={checkoutLinkClass} href={cancelHref}>
          Cancel
        </Link>
      </p>
    </CheckoutPanel>
  );
}
