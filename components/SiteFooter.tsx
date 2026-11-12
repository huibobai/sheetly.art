import Link from "next/link";
import { COMPANY_LEGAL_NAME, OPERATING_NAME } from "@/lib/site-contact";

const footerLinkClass = "font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent";

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-surface/90">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-muted">
          {OPERATING_NAME}
          <span className="px-2" aria-hidden="true">
            ·
          </span>
          {COMPANY_LEGAL_NAME}
        </p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/terms" className={footerLinkClass}>
            Terms
          </Link>
          <Link href="/privacy" className={footerLinkClass}>
            Privacy
          </Link>
          <Link href="/copyright" className={footerLinkClass}>
            Report this content
          </Link>
          <Link href="/contact" className={footerLinkClass}>
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
