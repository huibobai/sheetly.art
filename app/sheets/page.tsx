import Link from "next/link";
import { SheetsList } from "@/components/SheetsList";

export default function SheetsPage() {
  return (
    <>
      <section className="library">
        <div className="container">
          <SheetsList />
        </div>
      </section>

      <section className="band reveal">
        <div className="container">
          <div className="section-head">
            <h2>A sheet you can open again</h2>
          </div>
          <ol className="steps">
            <li>
              <span className="num">1</span>
              <h3>Sign in</h3>
              <p>Saved sheets stay with the account that made them.</p>
            </li>
            <li>
              <span className="num">2</span>
              <h3>Open the sheet</h3>
              <p>Each saved sheet comes back as a die-cut page.</p>
            </li>
            <li>
              <span className="num">3</span>
              <h3>Download it again</h3>
              <p>The print file is the same one you saved.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="band band-print reveal">
        <div className="container">
          <p className="statement">Printed and delivered to your door is coming soon.</p>
        </div>
      </section>

      <section className="band band-close">
        <div className="container stack">
          <h2>No sheet yet</h2>
          <p>You can still make a sheet on the home page before you sign in.</p>
          <Link href="/" className="btn btn-ghost">
            Make a sheet
          </Link>
        </div>
      </section>
    </>
  );
}
