import type { Metadata } from "next";
import { LegalDocument, LegalEmailLink, LegalLinks, LegalSection } from "@/components/LegalDocument";
import { LegalTextLink } from "@/components/LegalTextLink";
import { LEGAL_ENTITY_NAME } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of use · sheetly.art",
  description: "Plain-language terms for using Sheetly, including your photos, what we may refuse, and how to contact us.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of use"
      lede="This is our own plain-language notice for the website. It is not a letter from a lawyer. If you use Sheetly, these are the rules."
    >
      <LegalLinks current="terms" />

      <LegalSection title="Who runs this">
        <p>
          {LEGAL_ENTITY_NAME} runs Sheetly. There is no company number, postal address, or phone number on this page,
          because those details are not confirmed. Contact us at <LegalEmailLink />.
        </p>
      </LegalSection>

      <LegalSection title="What Sheetly is">
        <p>
          Sheetly turns photos you add into a sticker sheet you can download and print at home. You can keep the photo
          as it is, or ask for an AI style. Sign-in is required to download. Printed sheets delivered to your door are
          not offered yet. That service is coming soon.
        </p>
      </LegalSection>

      <LegalSection title="Your photos">
        <p>You warrant, for every photo you upload, that:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>you own it, or you have the rights you need to use it here, and</li>
          <li>the people in it consent to that use.</li>
        </ul>
        <p>
          Before an AI style, you also tick a box that says the same thing. That tick is remembered in this browser tab.
          The server refuses an AI style if the request does not include that confirmation.
        </p>
      </LegalSection>

      <LegalSection title="Brands, characters, and famous people">
        <p>
          Do not upload brands, logos, characters, celebrities, or other copyrighted or trademarked content unless you
          have permission from the rights holder. That includes a photo of a character, a logo in the frame, or a file
          name that asks for one. We block a list of well-known names when they show up in text we would use for an AI
          style. A block is not a legal finding. It is a limit we chose.
        </p>
      </LegalSection>

      <LegalSection title="What we may refuse">
        <p>
          We may refuse, remove, or not print any sheet. We may disable content. We may do that if we think the photo
          breaks these terms, if someone sends a report, if a safety check flags the result, or if we simply decide not
          to make or keep it. We do not have to explain every refusal.
        </p>
      </LegalSection>

      <LegalSection title="Permission you give us">
        <p>
          You give us a license to store and process the photos you upload so we can provide the service. That means
          keeping them so we can show your sheet, sending a photo to the processors listed on the{" "}
          <LegalTextLink href="/privacy">Privacy</LegalTextLink> page when that is needed to make an AI style or to run
          the site, and, once print-and-deliver exists, holding a sheet so a person can review it before it is printed.
          You keep ownership of your photo. This license lasts while we need the photo to do those things, and it ends
          when the photo is deleted, except for copies we cannot reach (see Privacy).
        </p>
      </LegalSection>

      <LegalSection title="You are responsible for your content">
        <p>
          You are responsible for the photos you upload and for the sheets you make from them. If someone has a claim
          because of a photo you did not have rights to, that responsibility is yours.
        </p>
      </LegalSection>

      <LegalSection title="Print and delivery">
        <p>
          Print-and-deliver is coming soon. When it exists, a person will review a sheet before it is printed. No sheet
          may be sent to print unless that review mark is approved. You cannot set the mark yourself. Until that
          service exists, there is nothing to order and nothing is printed by us.
        </p>
      </LegalSection>

      <LegalSection title="Safety checks and limits">
        <p>
          An AI result that fails the model&apos;s safety check is not shown and is not saved. That try still counts
          toward the limit on AI styles, so a blocked picture cannot be retried for free. We also limit how many AI
          styles a signed-in person, a guest, and a guest network can make. Those limits are not a promise that every
          other request will succeed.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You can try the editor as a guest. Download and saved sheets need a sign-in with email or Google. You are
          responsible for the activity on your sign-in. We may close access if these terms are broken, including if
          someone repeatedly uploads things they do not have rights to.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change these terms, we will change the date at the top of this page. The page you are reading is the
          current one. Continued use after the date changes means you are using Sheetly under the newer text.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms: <LegalEmailLink />. To report a photo or sheet, use the{" "}
          <LegalTextLink href="/copyright">report page</LegalTextLink>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
