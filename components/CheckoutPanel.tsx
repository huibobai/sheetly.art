import type { ReactNode } from "react";

export const checkoutLinkClass =
  "font-medium underline decoration-accent-line underline-offset-2 hover:decoration-accent";

export function CheckoutPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sticker-panel mx-auto max-w-lg space-y-4 p-5 sm:p-7">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      {children}
    </section>
  );
}
