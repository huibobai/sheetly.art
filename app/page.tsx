import Image from "next/image";
import { Suspense } from "react";
import { StickerCreator } from "@/components/StickerCreator";
import { UploadLink } from "@/components/UploadLink";
import { STICKER_STYLES, STYLE_LABELS } from "@/lib/sticker-styles";

const STEPS = [
  {
    title: "Upload",
    body: "Add a photo of a person, pet, or anything you want to keep. One photo is enough to try a sheet.",
  },
  {
    title: "Style",
    body: "Pick a look. The sticker sheet updates on the page, so you can compare styles before you commit.",
  },
  {
    title: "Download",
    body: "Save a die-cut sheet with a white border and cut lines, ready for a home printer.",
  },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-14 sm:space-y-16">
      <section className="max-w-2xl space-y-5 pt-2 sm:pt-4">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn any photo into custom stickers
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          Upload a picture, choose a style, and preview the whole sticker sheet. Download a die-cut file when you are
          ready to print.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <UploadLink />
          <a
            href="#styles"
            className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold text-foreground hover:border-stone-300 sm:w-auto"
          >
            See the styles
          </a>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-8 space-y-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-1 text-sm leading-6 text-muted sm:text-base">Upload, style, then download.</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="styles" className="scroll-mt-8 space-y-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Styles from one photo</h2>
          <p className="mt-1 text-sm leading-6 text-muted sm:text-base">
            The same picture, drawn eight ways. Choose a style and your own photo follows that look.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STICKER_STYLES.map((id) => (
            <li key={id} className="rounded-2xl border border-border bg-surface p-2.5">
              <Image
                src={`/styles/${id}.jpg`}
                alt={`Example of the ${STYLE_LABELS[id]} sticker style`}
                width={512}
                height={512}
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 22vw, 45vw"
                className="aspect-square w-full rounded-xl bg-stone-50 object-cover"
              />
              <p className="px-1 pt-2 text-sm font-medium">{STYLE_LABELS[id]}</p>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Loading the editor…</p>}>
        <HomeEditor searchParams={searchParams} />
      </Suspense>

      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight">Try a sheet</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Start with one photo. You can preview the sheet, then sign in to download it or add more photos.
          </p>
        </div>
        <UploadLink />
      </section>
    </div>
  );
}

async function HomeEditor({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const sheetParam = params.sheet;
  const sheetId = typeof sheetParam === "string" ? sheetParam : null;
  return <StickerCreator initialSheetId={sheetId} />;
}
