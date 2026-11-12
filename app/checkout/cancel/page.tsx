import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CheckoutPanel, checkoutLinkClass } from "@/components/CheckoutPanel";
import { checkoutPageState, checkoutRuntimeGate } from "@/lib/checkout/config";
import { isSheetId } from "@/lib/legal";

export const instant = false;

export const metadata: Metadata = {
  title: "Checkout cancelled · sheetly.art",
  robots: { index: false, follow: false },
};

function firstQuery(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export default async function CheckoutCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string | string[]; error?: string | string[] }>;
}) {
  await connection();
  if (checkoutPageState(checkoutRuntimeGate()) === "not-found") {
    notFound();
  }

  const params = await searchParams;
  const sheet = firstQuery(params.sheet);
  const failed = firstQuery(params.error) === "1";
  const href = sheet && isSheetId(sheet) ? `/?sheet=${encodeURIComponent(sheet)}` : "/";

  return (
    <CheckoutPanel title="Checkout cancelled">
      <p className="text-sm leading-6">
        {failed
          ? "We couldn't finish that test payment. Nothing was charged."
          : "You left checkout. Nothing was charged."}
      </p>
      <p>
        <Link className={checkoutLinkClass} href={href}>
          Back to your sheet
        </Link>
      </p>
    </CheckoutPanel>
  );
}
