import { Suspense } from "react";
import Link from "next/link";
import { StickerCreator } from "@/components/StickerCreator";
import { UploadLink } from "@/components/UploadLink";
import { PRIVACY_NOTICE, SHEET_CUT_LINE } from "@/lib/copy";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <section className="hero">
        <div className="container stage-grid">
          <div className="stage-copy">
            <h1>Your photo, now a sticker sheet</h1>
            <p className="lead">Add a picture, pick a look, and print it at home.</p>
            <UploadLink />
          </div>
          <Suspense fallback={<p className="muted">Getting the scissors out…</p>}>
            <HomeEditor searchParams={searchParams} />
          </Suspense>
        </div>
      </section>

      <section className="band reveal">
        <div className="container">
          <div className="section-head">
            <h2>Three moves, then a sheet</h2>
            <p className="lead">The same sheet you are already looking at.</p>
          </div>
          <ol className="steps">
            <li>
              <span className="num">1</span>
              <h3>Add a picture</h3>
              <p>One photo or a bunch. Drop it on the sheet.</p>
            </li>
            <li>
              <span className="num">2</span>
              <h3>Pick a look</h3>
              <p>Tap a style and watch that photo change.</p>
            </li>
            <li>
              <span className="num">3</span>
              <h3>Download the file</h3>
              <p>A PNG you can print at home.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="band band-print reveal">
        <div className="container stack-lg">
          <h2>Print at home today</h2>
          <p>Free to try. No app needed. Download a file you can print at home.</p>
          <p className="statement">Printed and delivered to your door is coming soon.</p>
        </div>
      </section>

      <section className="band band-cut reveal">
        <div className="container cut-layout">
          <div className="section-head">
            <h2>Dashed lines show the scissors</h2>
            <p>{SHEET_CUT_LINE}</p>
          </div>
          <div className="cut-map" role="img" aria-label="A sheet divided by dashed cut lines">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="band band-privacy reveal" id="privacy">
        <div className="container">
          <div className="section-head">
            <h2>Where a photo goes</h2>
          </div>
          <div className="privacy-plate">
            <p>{PRIVACY_NOTICE}</p>
          </div>
        </div>
      </section>

      <section className="band band-close">
        <div className="container stack">
          <h2>Start on the sheet</h2>
          <p>The generator is already open on this page.</p>
          <Link href="#upload" className="btn btn-ghost">
            Back to the sheet
          </Link>
        </div>
      </section>
    </>
  );
}

async function HomeEditor({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const sheetParam = params.sheet;
  const sheetId = typeof sheetParam === "string" ? sheetParam : null;
  return <StickerCreator initialSheetId={sheetId} />;
}
