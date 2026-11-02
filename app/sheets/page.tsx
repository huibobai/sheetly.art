import Link from "next/link";
import { SheetsList } from "@/components/SheetsList";

export default function SheetsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">My sheets</h1>
          <p className="text-sm text-muted">Open a saved sheet to download it again.</p>
        </div>
        <Link href="/" className="text-sm font-medium">
          New sheet
        </Link>
      </div>
      <SheetsList />
    </div>
  );
}
