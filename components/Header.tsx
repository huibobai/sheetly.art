import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/AuthControls";

export function Header() {
  return (
    <header className="border-b-2 border-ink bg-surface/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="sheetly.art home" className="group flex shrink-0 items-center gap-2.5 text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sheetly-logo.svg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 -rotate-6 transition-transform group-hover:rotate-0"
          />
          <span className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            sheetly<span className="text-accent">.art</span>
          </span>
        </Link>
        <Suspense fallback={null}>
          <AuthControls />
        </Suspense>
      </div>
    </header>
  );
}
