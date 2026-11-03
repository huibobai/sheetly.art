import { Suspense } from "react";
import { StickerCreator } from "@/components/StickerCreator";
import { UploadLink } from "@/components/UploadLink";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10 sm:space-y-12">
      <section className="max-w-2xl space-y-5 pt-2 sm:pt-4">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Make stickers from any photo
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          Add a picture, pick a look, and watch the sheet come together. When you like it, download a file you can print
          at home.
        </p>
        <UploadLink />
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Getting the editor ready…</p>}>
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
