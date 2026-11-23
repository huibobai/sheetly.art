import type { Metadata } from "next";
import { LegalDocument, LegalLinks, LegalSection, SiteContactFacts } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Contact · sheetly.art",
  description: "Support email, takedown email, company name, postal address, and phone for Sheetly.",
};

export default function ContactPage() {
  return (
    <LegalDocument
      title="Contact"
      lede="These are the details for the people who run Sheetly. The same details are on the Terms, Privacy, and report pages."
    >
      <LegalLinks current="contact" />

      <LegalSection title="How to reach us">
        <p>
          General questions use the support email. Copyright and trademark notices use the takedown email. The report
          page says what a notice should include.
        </p>
        <SiteContactFacts linkTakedownPage />
      </LegalSection>
    </LegalDocument>
  );
}
