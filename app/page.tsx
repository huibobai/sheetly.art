import { Suspense } from "react";
import { StickerCreator } from "@/components/StickerCreator";
import { UploadLink } from "@/components/UploadLink";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-5 pt-2 sm:pt-4">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn any photo into custom stickers
        </h1>
        <p className="text-base leading-7 text-muted sm:text-lg">
          Upload a photo, choose a style, and download a die-cut sheet ready to print.
        </p>
        <UploadLink />
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Loading the editor…</p>}>
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
