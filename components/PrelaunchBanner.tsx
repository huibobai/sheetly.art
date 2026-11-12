import Link from "next/link";
import { isPrelaunch } from "@/lib/launch";

export function PrelaunchBanner() {
  if (!isPrelaunch()) {
    return null;
  }

  return (
    <div className="border-b-2 border-ink bg-sun text-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <span className="inline-flex -rotate-1 items-center rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase">
          Opening soon
        </span>
        <p className="text-center font-medium">
          Try the sticker maker. Printed sheets are not for sale yet.{" "}
          <Link href="/waitlist" className="font-bold underline">
            Get an email when we open
          </Link>
        </p>
      </div>
    </div>
  );
}
