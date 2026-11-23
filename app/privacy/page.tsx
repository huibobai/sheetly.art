import type { Metadata } from "next";
import { LegalDocument, LegalEmailLink, LegalLinks, LegalSection, SiteContactFacts } from "@/components/LegalDocument";
import { LegalTextLink } from "@/components/LegalTextLink";
import { GUEST_TRANSFER_COOKIE } from "@/lib/guest-migrate";
import { RIGHTS_SESSION_KEY } from "@/lib/legal";
import { SHEET_STATE_STORAGE_KEY } from "@/lib/sheet-state";

export const metadata: Metadata = {
  title: "Privacy · sheetly.art",
  description: "What Sheetly stores, why, which processors receive it, and how to ask for access or deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy"
      lede="This notice is written for visitors in the United States and in the EU. It is our own plain-language notice, not a letter from a lawyer."
    >
      <LegalLinks current="privacy" />

      <LegalSection title="Who we are">
        <p>
          For privacy requests, email the takedown and legal address below. The rules for using the site are on the{" "}
          <LegalTextLink href="/terms">Terms</LegalTextLink>.
        </p>
        <SiteContactFacts />
      </LegalSection>

      <LegalSection title="What we store">
        <ul className="list-disc space-y-2 pl-5">
          <li>Photos you upload. New uploads go to a private storage bucket, under your account id.</li>
          <li>
            Sticker sheets you save while signed in. A row holds the layout (how many stickers, size, background,
            border), the style name, and the web addresses of the photo and of a finished AI picture. It does not hold
            a separate copy of the pixels beyond those addresses and the stored photo.
          </li>
          <li>Your email address, if you sign in with email or if Google sign-in gives us one.</li>
          <li>
            A sign-in session, kept by Supabase. If you use Google, Google and Supabase handle that sign-in. We do not
            get your Google password.
          </li>
          <li>
            Quota counters. One set is per account. For guests, another set is the IP address our host passes in, so
            one network cannot keep making free AI styles. This is not a log of every page you open.
          </li>
          <li>
            The rights tick, stored in this browser tab only, under <code>{RIGHTS_SESSION_KEY}</code>. The AI request
            also sends a yes/no so the server can refuse a style when the answer is no. We do not put your name in
            that field.
          </li>
        </ul>
        <p>We do not sell your photos or your email address.</p>
      </LegalSection>

      <LegalSection title="Why, in plain words">
        <p>We use the data to do the thing you asked for, and to stop abuse.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">You asked us to.</span> Storing the photo, building the sheet, signing you
            in, and sending a sign-in code. In EU terms, that is a contract, or steps you asked for before one.
          </li>
          <li>
            <span className="font-medium">Keeping the service workable.</span> Quota counters, the guest IP counter,
            and the safety check that drops a flagged picture. In EU terms, that is a legitimate interest. The counters
            are limited to that job.
          </li>
          <li>
            <span className="font-medium">You choose the sign-in.</span> Email or Google. You do not have to sign in to
            try the editor. You do have to sign in to download.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Processors">
        <p>These are the companies that handle data for us. We do not control their own retention beyond what we ask.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">Supabase (EU)</span> — accounts, the database, and private file storage.
            Sign-in codes are sent by Supabase Auth.
          </li>
          <li>
            <span className="font-medium">Vercel</span> — hosting the website. On requests that reach it, we read the
            visitor IP it passes through, for the guest quota only.
          </li>
          <li>
            <span className="font-medium">fal.ai, which runs Black Forest Labs&apos; FLUX model</span> — only when you
            pick an AI style. That photo is sent there to draw the sticker. The home page and the sign-in dialog say
            this as well.
          </li>
          <li>
            <span className="font-medium">Resend</span> — email. This website&apos;s code does not call Resend itself.
            Sign-in codes go out through Supabase Auth. Resend is named because it is the email processor for the
            product: if it is the provider that delivers those messages, it sees the address you typed and the message.
            We do not send a newsletter from this app.
          </li>
          <li>
            <span className="font-medium">Google</span> — if you choose Google sign-in. Google receives that sign-in.
            We then keep the session Supabase stores.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies and storage on your device">
        <p>This app does not set an advertising cookie.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>A Supabase sign-in cookie, so you stay signed in.</li>
          <li>
            A short-lived httpOnly cookie named <code>{GUEST_TRANSFER_COOKIE}</code> when a guest session is carried
            across Google sign-in. It holds a guest access token. It lasts at most ten minutes and is cleared when the
            move finishes.
          </li>
          <li>
            <code>sessionStorage</code> key <code>{SHEET_STATE_STORAGE_KEY}</code> — the in-progress sheet (references
            and settings, not a token), so a Google redirect can restore it. It stays in this tab.
          </li>
          <li>
            <code>sessionStorage</code> key <code>{RIGHTS_SESSION_KEY}</code> — that you ticked the rights box, for this
            tab only.
          </li>
          <li>
            <code>localStorage</code> key <code>sheetly-style:</code> plus the picture address — which AI style was used
            for that picture, so a saved sheet can show the name.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We do not automatically delete your photos, your sheets, or your account after a set number of days. That
          deletion flow is not built. There is no delete button for an account. Photos and sheets stay until you ask
          us to delete them, or we remove them (for example after a report).
        </p>
        <p>
          Quota counters are the exception. The database function that counts AI styles is written to delete that
          account&apos;s counter rows older than two days, and a guest IP&apos;s counter rows older than two days, the
          next time that account or IP generates. It does not delete the pictures. If that database function is not
          installed on a given project yet, those rows are not being cleaned up by this app.
        </p>
        <p>
          When we ask fal.ai to draw a sticker, we send a header asking fal not to keep that request in its history.
          fal&apos;s own documentation has described a default history of about 90 days for requests that are stored.
          We still keep the web address of a finished picture that passed our check, inside your sheet. We do not
          control, and have not verified, how long Black Forest Labs keeps a copy. Pictures made before that header
          may still sit in fal&apos;s history for their default time. We do not have fal&apos;s request id for those,
          so we cannot delete them one by one.
        </p>
        <p>
          If a picture fails the safety check, we do not return it and we do not store it. The try still counts toward
          your AI style limit.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>You can email us to ask for:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>access to the personal data we hold about you</li>
          <li>correction of something that is wrong</li>
          <li>deletion</li>
          <li>a restriction, or an objection to a use based on legitimate interest</li>
        </ul>
        <p>
          If you are in the EU or the UK, you can also complain to a data protection supervisory authority, usually the
          one where you live. We are not naming a single authority here, because we are not stating a home country. The
          usual rule there is that we answer within one month. We will handle the email by hand. There is no automatic
          form.
        </p>
        <p>
          If you are in the United States, the same email is how you ask what we hold and how you ask us to delete it.
          We will answer the email. We are not listing a state law program, because that detail is not confirmed.
        </p>
      </LegalSection>

      <LegalSection title="How to ask for deletion">
        <p>
          Email <LegalEmailLink /> from the address on the account, or tell us which address it is. Say what you want
          deleted: the account, particular sheets, or the photos. We will delete what we can reach in our own database
          and storage. We cannot promise a copy is already gone from a processor the moment you write. Say if a child
          has given us a photo or an email. Sheetly is not made for children, and we will delete that.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          <LegalEmailLink />. To report someone else&apos;s content, use the{" "}
          <LegalTextLink href="/copyright">report page</LegalTextLink>. Company name, address, and phone are on the{" "}
          <LegalTextLink href="/contact">contact page</LegalTextLink>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
