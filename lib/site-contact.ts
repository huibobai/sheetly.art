/**
 * Business contact details.
 *
 * THIS IS THE ONLY PLACE TO EDIT THESE BEFORE LAUNCH.
 * Do not copy the strings into pages, footers, emails, or lib/legal.ts.
 * Import this module. Terms, Privacy, the copyright / takedown page, /contact,
 * the site footer, and lib/email/footer.ts all read from here.
 *
 * Every value is a placeholder. Replace the whole value when the real detail
 * exists, and leave no "[PLACEHOLDER:" text behind.
 *
 * CONTACT_PLACEHOLDERS_PENDING is true while any value still contains that
 * mark. contactPlaceholderReport() lists the remaining fields and their text,
 * so a launch checklist or a test can see what is left.
 *
 * Fill these in before launch:
 * - companyLegalName — about 19 Nov, when the Hong Kong company exists
 * - phone — Hong Kong number, about 14 Nov
 * - postalAddress — the postal address
 * - takedownEmail — a working inbox at legal@sheetly.art
 *   (sheetly.art has no MX records yet, so that mailbox cannot receive mail)
 * - operatingName — the name the business trades under
 * - supportEmail — the general support inbox
 */

export const PLACEHOLDER_MARK = "[PLACEHOLDER:";

export const SITE_CONTACT = {
  companyLegalName: "[PLACEHOLDER: company legal name - HK company pending]",
  operatingName: "[PLACEHOLDER: operating name]",
  postalAddress: "[PLACEHOLDER: postal address]",
  phone: "[PLACEHOLDER: HK phone]",
  takedownEmail: "legal@sheetly.art [PLACEHOLDER: inbox not set up]",
  supportEmail: "[PLACEHOLDER: general support email]",
} as const;

export type SiteContactField = keyof typeof SITE_CONTACT;

export const COMPANY_LEGAL_NAME = SITE_CONTACT.companyLegalName;
export const OPERATING_NAME = SITE_CONTACT.operatingName;
export const POSTAL_ADDRESS = SITE_CONTACT.postalAddress;
export const PHONE = SITE_CONTACT.phone;
export const TAKEDOWN_EMAIL = SITE_CONTACT.takedownEmail;
export const SUPPORT_EMAIL = SITE_CONTACT.supportEmail;

const MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First token, when it is an email address. A placeholder-only value returns null. */
export function contactMailtoAddress(value: string): string | null {
  const candidate = value.trim().split(/\s+/)[0] ?? "";
  if (!MAILBOX.test(candidate)) {
    return null;
  }
  return candidate;
}

export type ContactPlaceholder = {
  field: string;
  value: string;
};

/**
 * Fields whose value still contains "[PLACEHOLDER:".
 * Pass a record to preview what remains after a launch edit.
 */
export function contactPlaceholderReport(
  contact: Readonly<Record<string, string>> = SITE_CONTACT,
): ContactPlaceholder[] {
  return Object.entries(contact)
    .filter(([, value]) => value.includes(PLACEHOLDER_MARK))
    .map(([field, value]) => ({ field, value }));
}

/** Field names that still need a real value. */
export const CONTACT_PLACEHOLDER_FIELDS: readonly SiteContactField[] = contactPlaceholderReport().map(
  (row) => row.field as SiteContactField,
);

/**
 * True while any contact field is still a placeholder.
 * A launch check should require this to be false. An empty list is not a
 * stand-in: an empty array is truthy in JavaScript, so use this boolean.
 */
export const CONTACT_PLACEHOLDERS_PENDING: boolean = CONTACT_PLACEHOLDER_FIELDS.length > 0;
