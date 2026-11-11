import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO } from "@/lib/legal";

export function LegalEmailLink({ children }: { children?: ReactNode }) {
  return (
    <a className="font-medium text-foreground underline decoration-accent-line underline-offset-2 hover:decoration-accent" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
      {children ?? LEGAL_CONTACT_EMAIL}
    </a>
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

export function LegalLinks({ current }: { current: "terms" | "privacy" | "copyright" }) {
  const items = [
    { href: "/terms", id: "terms" as const, label: "Terms" },
    { href: "/privacy", id: "privacy" as const, label: "Privacy" },
    { href: "/copyright", id: "copyright" as const, label: "Report content" },
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
