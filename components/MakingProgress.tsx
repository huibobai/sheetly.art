"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Playful, stage-based progress shown while an AI style is being drawn.
 * Stages advance on a timer (fal does not report real progress), and the
 * last stage holds until the styled image arrives.
 */
export const MAKING_STAGES = [
  { at: 0, label: "Snipping out your photo" },
  { at: 2500, label: "Trying on the new look" },
  { at: 6500, label: "Adding the white sticker border" },
  { at: 10000, label: "Laying out your sheet" },
  { at: 14000, label: "Peeling off the backing… almost there" },
] as const;

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function stageIndexFor(elapsedMs: number) {
  let index = 0;
  MAKING_STAGES.forEach((stage, i) => {
    if (elapsedMs >= stage.at) index = i;
  });
  return index;
}

const DROP_TONES = ["drop-accent", "drop-sun", "drop-mint", "drop-grape"];

export function MakingProgress({ count, variant = "card" }: { count: number; variant?: "card" | "overlay" }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 500);
    return () => window.clearInterval(timer);
  }, []);

  const index = stageIndexFor(elapsed);
  const stage = MAKING_STAGES[index];
  const title = count > 1 ? `Making ${count} stickers` : "Making your sticker";

  const steps = (
    <ol className="mt-3 flex gap-1.5" aria-hidden="true">
      {MAKING_STAGES.map((item, i) => (
        <li
          key={item.label}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= index ? "bg-accent" : "bg-ink/10"}`}
        />
      ))}
    </ol>
  );

  const drops = (
    <div className="making-drops" aria-hidden="true">
      {DROP_TONES.map((tone) => (
        <span key={tone} className={reducedMotion ? `making-drop is-still ${tone}` : `making-drop ${tone}`} />
      ))}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="making-scrim">
        <div role="status" aria-live="polite" aria-atomic="true" className="panel">
          <div className="nav-actions">
            {drops}
            <div>
              <p>{title}</p>
              <p className="muted">{stage.label}</p>
            </div>
          </div>
          {steps}
          <p className="muted">This is your photo version. The new look pops in when it&apos;s done.</p>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="panel">
      <div className="nav-actions">
        {drops}
        <div>
          <p>{title}</p>
          <p className="muted">{stage.label}</p>
        </div>
      </div>
      {steps}
    </div>
  );
}
