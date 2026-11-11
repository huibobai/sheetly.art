import Link from "next/link";
import { LEGAL_ENTITY_NAME } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-surface/90">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-muted">{LEGAL_ENTITY_NAME}</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/terms" className="font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent">
            Terms
          </Link>
          <Link href="/privacy" className="font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent">
            Privacy
          </Link>
          <Link href="/copyright" className="font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent">
            Report this content
          </Link>
        </nav>
      </div>
    </footer>
  );
}
