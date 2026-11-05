import { Suspense } from "react";
import { StickerCreator } from "@/components/StickerCreator";
import { UploadLink } from "@/components/UploadLink";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10 sm:space-y-12">
      <section className="grid items-center gap-8 pt-2 sm:pt-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="max-w-2xl space-y-5">
          <p className="inline-block -rotate-2 rounded-full bg-sun px-3 py-1 text-sm font-semibold text-ink">
            Free to try · no app needed
          </p>
          <h1 className="font-display text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Your photo, now a <span className="text-accent">sticker sheet</span>
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
            Add a picture, pick a look, and watch the sheet come together. Like it? Download a file you can print at
            home. Printed and delivered to your door is coming soon.
          </p>
          <UploadLink />
        </div>
        <div aria-hidden="true" className="hidden grid-cols-2 gap-4 md:grid">
          <span className="hero-sticker h-24 w-24 -rotate-6 bg-accent-soft">🐶</span>
          <span className="hero-sticker mt-8 h-24 w-24 rotate-6 rounded-full bg-sun">🌼</span>
          <span className="hero-sticker h-24 w-24 rotate-3 bg-mint/30">✌️</span>
        </div>
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Getting the scissors out…</p>}>
        <HomeEditor searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HomeEditor({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const sheetParam = params.sheet;
  const sheetId = typeof sheetParam === "string" ? sheetParam : null;
  return <StickerCreator initialSheetId={sheetId} />;
}
