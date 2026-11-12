import Link from "next/link";
import type { ReactNode } from "react";
import { LegalTextLink } from "@/components/LegalTextLink";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO } from "@/lib/legal";
import {
  COMPANY_LEGAL_NAME,
  OPERATING_NAME,
  PHONE,
  POSTAL_ADDRESS,
  SUPPORT_EMAIL,
  TAKEDOWN_EMAIL,
  contactMailtoAddress,
} from "@/lib/site-contact";

const emailLinkClass =
  "font-medium text-foreground underline decoration-accent-line underline-offset-2 hover:decoration-accent";

function EmailValue({ value, children }: { value: string; children?: ReactNode }) {
  const address = contactMailtoAddress(value);
  const label = children ?? value;
  if (!address) {
    return <span className="font-medium text-foreground">{label}</span>;
  }
  return (
    <a className={emailLinkClass} href={`mailto:${address}`}>
      {label}
    </a>
  );
}

export function LegalEmailLink({ children }: { children?: ReactNode }) {
  return <EmailValue value={TAKEDOWN_EMAIL}>{children}</EmailValue>;
}

export function SupportEmailLink({ children }: { children?: ReactNode }) {
  return <EmailValue value={SUPPORT_EMAIL}>{children}</EmailValue>;
}

const CONTACT_FACTS = [
  ["Operating name", OPERATING_NAME],
  ["Company legal name", COMPANY_LEGAL_NAME],
  ["Postal address", POSTAL_ADDRESS],
  ["Phone", PHONE],
] as const;

/** Operator details from lib/site-contact.ts. The same list is on every legal page and on /contact. */
export function SiteContactFacts({ linkTakedownPage = false }: { linkTakedownPage?: boolean }) {
  return (
    <dl className="space-y-3">
      {CONTACT_FACTS.map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium text-foreground">{label}</dt>
          <dd className="whitespace-pre-line">{value}</dd>
        </div>
      ))}
      <div>
        <dt className="font-medium text-foreground">Support email</dt>
        <dd>
          <SupportEmailLink />
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Takedown and legal email</dt>
        <dd>
          <LegalEmailLink />
          {linkTakedownPage ? (
            <>
              . What to include is on the <LegalTextLink href="/copyright">report page</LegalTextLink>.
            </>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

export function LegalDocument({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <article className="sticker-panel mx-auto max-w-3xl p-5 sm:p-8">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm font-semibold">
        Last updated: <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
      </p>
      <p className="mt-4 text-sm leading-6 text-muted">{lede}</p>
      <div className="mt-8 space-y-8 text-sm leading-6">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function LegalLinks({ current }: { current: "terms" | "privacy" | "copyright" | "contact" }) {
  const items = [
    { href: "/terms", id: "terms" as const, label: "Terms" },
    { href: "/privacy", id: "privacy" as const, label: "Privacy" },
    { href: "/copyright", id: "copyright" as const, label: "Report content" },
    { href: "/contact", id: "contact" as const, label: "Contact" },
  ];
  return (
    <nav aria-label="Legal pages" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {items.map((item) =>
        item.id === current ? (
          <span key={item.id} aria-current="page" className="font-semibold text-foreground">
            {item.label}
          </span>
        ) : (
          <Link
            key={item.id}
            href={item.href}
            className="font-medium text-foreground underline decoration-accent-line underline-offset-2 hover:decoration-accent"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
