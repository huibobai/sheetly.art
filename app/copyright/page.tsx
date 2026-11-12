import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalDocument, LegalEmailLink, LegalLinks, LegalSection, SiteContactFacts } from "@/components/LegalDocument";
import { LegalTextLink } from "@/components/LegalTextLink";
import { sheetIdFromQuery, takedownMailto } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Report content · sheetly.art",
  description: "How to report a photo or sticker sheet that uses your work, and what happens next.",
};

export default function CopyrightPage({ searchParams }: PageProps<"/copyright">) {
  return (
    <Suspense fallback={<CopyrightArticle sheetId={null} />}>
      <CopyrightFromQuery searchParams={searchParams} />
    </Suspense>
  );
}

async function CopyrightFromQuery({ searchParams }: { searchParams: PageProps<"/copyright">["searchParams"] }) {
  const params = await searchParams;
  return <CopyrightArticle sheetId={sheetIdFromQuery(params.sheet)} />;
}

function CopyrightArticle({ sheetId }: { sheetId: string | null }) {
  return (
    <LegalDocument
      title="Report content"
      lede="Use this page to tell us a photo or sticker sheet uses your copyrighted work or your trademark. This is our own plain-language notice, not a letter from a lawyer."
    >
      <LegalLinks current="copyright" />

      {sheetId ? (
        <p className="rounded-2xl border border-border bg-stone-50 px-3 py-3">
          Sheet id from this link: <code className="font-medium text-foreground">{sheetId}</code>. Include it in your
          email. It is not your name or your email address.
        </p>
      ) : null}

      <LegalSection title="How to report">
        <p>
          Email <LegalEmailLink />. A report from the sticker page can include a sheet id in the link. Do not send
          passwords or a copy of someone else&apos;s identity document.
        </p>
        <p>
          <a
            href={takedownMailto(sheetId)}
            className="inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Email a takedown notice
          </a>
        </p>
      </LegalSection>

      <LegalSection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">The work.</span> What you own: a photo, a character, a logo, a name, or
            another work. A link to the original helps.
          </li>
          <li>
            <span className="font-medium">Where it is.</span> The page URL, the sheet id if you have one
            {sheetId ? (
              <>
                {" "}
                (this link has <code>{sheetId}</code>)
              </>
            ) : null}
            , or another description that lets us find it.
          </li>
          <li>
            <span className="font-medium">Your contact details.</span> A name and an email we can reply to.
          </li>
          <li>
            <span className="font-medium">A good-faith statement.</span> That you believe the use is not authorized by
            the rights holder, their agent, or the law.
          </li>
          <li>
            <span className="font-medium">An accuracy statement.</span> That the notice is accurate, and that you are
            the owner or are allowed to act for the owner. If you are writing from the United States, include that the
            statement is made under penalty of perjury.
          </li>
          <li>
            <span className="font-medium">Your signature.</span> A typed name is enough as an electronic signature.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Where to send it">
        <SiteContactFacts />
        <p>
          The same details are on the <LegalTextLink href="/contact">contact page</LegalTextLink>.
        </p>
      </LegalSection>

      <LegalSection title="What happens next">
        <p>
          We read the email. We may disable the content so it is not kept up on a sheet. We may remove a photo we
          host. We may write back if we need a missing piece. We may tell the person who uploaded it that a notice
          arrived. We will not publish your notice on the website.
        </p>
        <p>
          We may not be able to pull back a copy that a processor already stored. Where we can ask, we will. Disabling
          content here does not, by itself, decide who owns the work.
        </p>
      </LegalSection>

      <LegalSection title="If we disabled your content">
        <p>
          If you uploaded the sheet and you think we disabled it by mistake, email the same address. This is the
          counter-notice. Include:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the sheet id or URL</li>
          <li>your contact details</li>
          <li>why you have the rights to use it</li>
          <li>a statement that you believe the removal was a mistake, and that your statement is accurate</li>
          <li>your signature (a typed name is fine)</li>
        </ul>
        <p>
          A full United States counter-notice also asks you to accept a federal court in a district where the service
          is based. We are not naming a court or a country here, because that is not confirmed. Say that you are
          sending a counter-notice. We will tell you if we need anything else before we put the content back. We may
          restore it after we review what you sent. We may also leave it down.
        </p>
      </LegalSection>

      <LegalSection title="Repeat problems">
        <p>
          If someone keeps uploading things they do not have rights to, we may close their account and refuse new
          sheets. One honest mistake is not the same as doing it again after a warning.
        </p>
      </LegalSection>

      <LegalSection title="Other pages">
        <p>
          The <LegalTextLink href="/terms">Terms</LegalTextLink> say you need rights to every photo. The{" "}
          <LegalTextLink href="/privacy">Privacy</LegalTextLink> page says what we store and how to ask for deletion of
          your own data. Deleting your own account is a privacy request. Reporting someone else&apos;s sheet is this
          page.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
