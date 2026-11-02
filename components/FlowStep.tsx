import type { ReactNode } from "react";

export function FlowStep({
  number,
  title,
  hint,
  complete = false,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            complete ? "bg-accent text-white" : "bg-stone-900 text-white"
          }`}
          aria-hidden="true"
        >
          {complete ? "✓" : number}
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
