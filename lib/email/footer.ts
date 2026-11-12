/**
 * Footer for mail this app sends.
 *
 * Built only from lib/site-contact.ts. Nothing in this repo sends product
 * mail yet (sign-in codes go out through Supabase Auth). Order mail should
 * append emailFooterHtml() and emailFooterText() when that flow exists.
 */

import { SITE_CONTACT, type SiteContactField } from "../site-contact.ts";

export const EMAIL_SITE_ORIGIN = "https://sheetly.art";

const FOOTER_LINKS = [
  { path: "/terms", label: "Terms" },
  { path: "/privacy", label: "Privacy" },
  { path: "/contact", label: "Contact" },
] as const;

/** One label per contact field, so a new field cannot ship without a footer line. */
const FOOTER_LABELS = {
  companyLegalName: "Company legal name",
  operatingName: "Operating name",
  postalAddress: "Postal address",
  phone: "Phone",
  takedownEmail: "Takedown and legal email",
  supportEmail: "Support email",
} as const satisfies Record<SiteContactField, string>;

function siteOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function contactLines(): [string, string][] {
  return (Object.keys(SITE_CONTACT) as SiteContactField[]).map((field) => [
    FOOTER_LABELS[field],
    SITE_CONTACT[field],
  ]);
}

/** Plain-text footer: every contact field, then absolute links. */
export function emailFooterText(origin: string = EMAIL_SITE_ORIGIN): string {
  const base = siteOrigin(origin);
  const lines = contactLines().map(([label, value]) => `${label}: ${value}`);
  for (const link of FOOTER_LINKS) {
    lines.push(`${link.label}: ${base}${link.path}`);
  }
  return lines.join("\n");
}

/** HTML footer: every contact field, then links to terms, privacy, and contact. */
export function emailFooterHtml(origin: string = EMAIL_SITE_ORIGIN): string {
  const base = siteOrigin(origin);
  const rows = contactLines()
    .map(([label, value]) => `<p>${escapeHtml(label)}: ${escapeHtml(value).replaceAll("\n", "<br>")}</p>`)
    .join("");
  const links = FOOTER_LINKS.map(
    (link) => `<a href="${escapeHtml(`${base}${link.path}`)}">${escapeHtml(link.label)}</a>`,
  ).join(" · ");
  return `<footer>${rows}<p>${links}</p></footer>`;
}
