import { Suspense } from "react";
import { StickerCreator } from "@/components/StickerCreator";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10">
      <div className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Make a sticker sheet
        </h1>
        <p className="text-base leading-7 text-muted sm:text-lg">
          Upload photos, choose a style for each one, then download a sheet ready to print.
        </p>
      </div>

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
