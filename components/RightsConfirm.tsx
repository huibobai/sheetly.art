"use client";

import { useId } from "react";
import { LegalTextLink } from "@/components/LegalTextLink";

export function RightsConfirm({
  checked,
  hintId,
  onChange,
}: {
  checked: boolean;
  hintId: string;
  onChange: (checked: boolean) => void;
}) {
  const inputId = useId();

  return (
    <div className="panel">
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={hintId}
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
        />
        <div className="text-sm leading-6">
          <label htmlFor={inputId}>
            I own this photo or have permission to use it (and anyone in it is OK with it).
          </label>{" "}
          <LegalTextLink href="/terms" newTab>
            Terms
          </LegalTextLink>
        </div>
      </div>
      <p id={hintId} className="mt-2 text-sm leading-6 text-muted">
        {checked
          ? "AI styles are on for this tab."
          : "AI styles stay off until you tick this. We remember it for this tab only."}
      </p>
    </div>
  );
}
