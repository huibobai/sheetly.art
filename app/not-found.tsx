import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found">
      <div className="container stack-lg">
        <p className="not-found-num">404</p>
        <h1>That page is not on the mat</h1>
        <p className="lead">The sheet you asked for is not here.</p>
        <Link href="/" className="btn btn-primary">
          Make a sheet
        </Link>
      </div>
    </section>
  );
}
