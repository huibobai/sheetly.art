import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <p className="footer-mark">
          sheetly<span className="art">.art</span>
        </p>
        <div className="footer-row">
          <p className="muted">A photo becomes a sticker sheet you can print at home.</p>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/">Home</Link>
            <Link href="/sheets">My sheets</Link>
            <Link href="/#privacy">Privacy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
