import type { Metadata } from "next";
import { OpeningSoon } from "@/components/OpeningSoon";
import { isPrelaunch } from "@/lib/launch";

const prelaunch = isPrelaunch();

export const metadata: Metadata = {
  title: prelaunch ? "Opening soon · sheetly.art" : "sheetly.art",
  description: prelaunch
    ? "Sheetly is opening soon. Leave your email and we'll write when printed sticker sheets are for sale."
    : "Sheetly is open. Make a sticker sheet and print it at home.",
};

export default function WaitlistPage() {
  return <OpeningSoon source="waitlist" heading="h1" />;
}
