import Link from "next/link";

export function LegalTextLink({
  href,
  children,
  newTab = false,
}: {
  href: string;
  children: string;
  newTab?: boolean;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-foreground underline decoration-accent-line underline-offset-2 hover:decoration-accent"
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </Link>
  );
}
