import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/AuthControls";

export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-semibold tracking-tight text-foreground">
          Sheetly
        </Link>
        <Suspense fallback={null}>
          <AuthControls />
        </Suspense>
      </div>
    </header>
  );
}
