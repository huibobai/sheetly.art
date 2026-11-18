import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/AuthControls";

export function Header() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" aria-label="sheetly.art home" className="wordmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sheetly-logo.svg" alt="" width={40} height={40} />
          <span>
            sheetly<span className="art">.art</span>
          </span>
        </Link>
        <Suspense fallback={null}>
          <AuthControls />
        </Suspense>
      </div>
    </header>
  );
}
