"use client";

import { STICKER_STYLES, STYLE_LABELS, type StickerStyle } from "@/lib/sticker-styles";

const STYLE_HINTS: Record<StickerStyle, string> = {
  cartoon: "Bold outlines and bright color",
  kawaii: "Soft, cute, and playful",
  watercolor: "Loose washes and texture",
  "pixel-art": "Chunky pixels, retro charm",
  anime: "Clean lines and expressive eyes",
  sketch: "Pencil strokes and shading",
  clay: "Soft sculpted forms",
  outline: "A single bold contour",
};

export function StylePicker({
  selected,
  onSelect,
  showHeading = true,
}: {
  selected: string;
  onSelect: (styleId: string) => void;
  showHeading?: boolean;
}) {
  return (
    <section className="space-y-3">
      {showHeading ? (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Choose a style</h2>
          <p className="mt-1 text-sm text-muted">Pick a look for your sticker.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STICKER_STYLES.map((id) => {
          const isSelected = selected === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={isSelected}
              className={`rounded-2xl border bg-surface p-3 text-left transition-colors ${
                isSelected
                  ? "border-accent ring-2 ring-orange-100"
                  : "border-border hover:border-stone-300"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/styles/${id}.jpg`}
                alt=""
                className="aspect-square w-full rounded-xl bg-stone-50 object-cover"
              />
              <p className="mt-2 text-sm font-medium">{STYLE_LABELS[id]}</p>
              <p className="mt-0.5 text-xs text-muted sm:text-sm">{STYLE_HINTS[id]}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
