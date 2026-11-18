import Link from "next/link";
import { isPrelaunch } from "@/lib/launch";

export function PrelaunchBanner() {
  if (!isPrelaunch()) {
    return null;
  }

  return (
    <div className="prelaunch-banner">
      <div className="container">
        <span className="prelaunch-badge">Opening soon</span>
        <p>
          Try the sticker maker. Printed sheets are not for sale yet.{" "}
          <Link href="/waitlist">Get an email when we open</Link>
        </p>
      </div>
    </div>
  );
}
