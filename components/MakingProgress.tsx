"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Playful, stage-based progress shown while an AI style is being drawn.
 * Stages advance on a timer (fal does not report real progress), and the
 * last stage holds until the styled image arrives.
 */
export const MAKING_STAGES = [
  { at: 0, label: "Snipping out your photo", emoji: "✂️" },
  { at: 2500, label: "Trying on the new look", emoji: "🎨" },
  { at: 6500, label: "Adding the white sticker border", emoji: "🤍" },
  { at: 10000, label: "Laying out your sheet", emoji: "🧩" },
  { at: 14000, label: "Peeling off the backing… almost there", emoji: "✨" },
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

const DROP_COLORS = ["#ff5c8a", "#ffc93c", "#2ec4b6", "#7b6cf6"];

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
      {DROP_COLORS.map((color, i) => (
        <span
          key={color}
          className={reducedMotion ? "making-drop is-still" : "making-drop"}
          style={{ backgroundColor: color, animationDelay: `${i * 0.45}s` }}
        />
      ))}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 flex items-end justify-center bg-white/40 p-3 backdrop-blur-[1px]">
        <div role="status" aria-live="polite" aria-atomic="true" className="sticker-card w-full max-w-xs px-4 py-3">
          <div className="flex items-center gap-3">
            {drops}
            <div className="min-w-0">
              <p className="font-display text-sm font-bold">{title}</p>
              <p className="text-sm text-ink-soft">
                {stage.emoji} {stage.label}
              </p>
            </div>
          </div>
          {steps}
          <p className="mt-2 text-xs text-ink-soft">This is your photo version. The new look pops in when it&apos;s done.</p>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sticker-card px-4 py-3">
      <div className="flex items-center gap-3">
        {drops}
        <div>
          <p className="font-display text-sm font-bold">{title}</p>
          <p className="text-sm text-ink-soft">
            {stage.emoji} {stage.label}
          </p>
        </div>
      </div>
      {steps}
    </div>
  );
}
