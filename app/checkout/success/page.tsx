import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CheckoutPanel, checkoutLinkClass } from "@/components/CheckoutPanel";
import { checkoutPageState, checkoutRuntimeGate, formatCheckoutPrice } from "@/lib/checkout/config";
import { ownOrder } from "@/lib/checkout/load";
import { orderStatusLabel } from "@/lib/checkout/orders";
import { isSheetId } from "@/lib/legal";

export const instant = false;

export const metadata: Metadata = {
  title: "Order · sheetly.art",
  robots: { index: false, follow: false },
};

function firstQuery(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  await connection();
  if (checkoutPageState(checkoutRuntimeGate()) === "not-found") {
    notFound();
  }

  const params = await searchParams;
  const orderId = firstQuery(params.order);
  const order = orderId ? await ownOrder(orderId) : null;
  const downloadHref =
    order?.status === "paid" && order.sheetId && isSheetId(order.sheetId)
      ? `/?sheet=${encodeURIComponent(order.sheetId)}`
      : null;

  return (
    <CheckoutPanel title="Your order">
      {order ? (
        <>
          <p className="text-sm">
            Status: <span className="font-medium">{orderStatusLabel(order.status)}</span>
          </p>
          <p className="text-sm text-muted">{formatCheckoutPrice(order.amountCents, order.currency)}</p>
          {downloadHref ? (
            <p>
              <Link className={checkoutLinkClass} href={downloadHref}>
                Download your sheet
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted">
              {order.status === "refunded"
                ? "This order was refunded, so the download is locked."
                : "The download stays locked until this order is paid."}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">We couldn&apos;t find that order on this account.</p>
      )}
      <p>
        <Link className={checkoutLinkClass} href="/">
          Back home
        </Link>
      </p>
    </CheckoutPanel>
  );
}
