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
      <section className="band">
        <div className="container stack-lg">
          <Title>Sheetly is open</Title>
          <p className="lead">Make a sticker sheet on the home page. You can download it and print it at home.</p>
          <Link href="/" className="btn btn-primary">
            Make a sheet
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section id="opening-soon" aria-labelledby="opening-soon-heading" className="band">
      <div className="container stack-lg">
        <div className="section-head">
          <p className="prelaunch-badge">Opening soon</p>
          <Title id="opening-soon-heading">Sheetly is opening soon</Title>
          <p className="lead">
            You can try the sticker maker and download a sheet to print at home. Printed sheets are not for sale yet,
            and there is no checkout.
          </p>
        </div>
        <WaitlistForm source={source} />
      </div>
    </section>
  );
}
