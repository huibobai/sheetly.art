import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { isPrelaunch } from "@/lib/launch";
import type { WaitlistSource } from "@/lib/waitlist";

export function OpeningSoon({
  source,
  heading = "h2",
}: {
  source: WaitlistSource;
  heading?: "h1" | "h2";
}) {
  const Title = heading;

  if (!isPrelaunch()) {
    return (
      <section className="sticker-panel space-y-3 p-6 sm:p-8">
        <Title className="font-display text-3xl font-bold tracking-tight">Sheetly is open</Title>
        <p className="max-w-2xl text-base leading-7 text-muted">
          Make a sticker sheet on the home page. You can download it and print it at home.
        </p>
        <Link href="/" className="inline-flex font-bold underline">
          Make a sheet
        </Link>
      </section>
    );
  }

  return (
    <section id="opening-soon" aria-labelledby="opening-soon-heading" className="sticker-panel space-y-4 p-6 sm:p-8">
      <p className="inline-block -rotate-2 rounded-full bg-sun px-3 py-1 text-sm font-semibold text-ink">Opening soon</p>
      <Title id="opening-soon-heading" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Sheetly is opening soon
      </Title>
      <p className="max-w-2xl text-base leading-7 text-muted">
        You can try the sticker maker and download a sheet to print at home. Printed sheets are not for sale yet, and
        there is no checkout.
      </p>
      <WaitlistForm source={source} />
    </section>
  );
}
