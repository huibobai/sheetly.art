import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/AuthControls";

export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={240} height={240} className="h-24 w-24" />
          Sheetly
        </Link>
        <Suspense fallback={null}>
          <AuthControls />
        </Suspense>
      </div>
    </header>
  );
}
