"use client";

import { STICKER_STYLES, STYLE_LABELS, type StickerStyle } from "@/lib/sticker-styles";

const STYLE_HINTS: Record<StickerStyle, string> = {
  cartoon: "Bold outlines and bright color",
  kawaii: "Soft, cute, and playful",
  watercolor: "Loose washes and texture",
  "pixel-art": "Chunky pixels, retro charm",
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STICKER_STYLES.map((id) => {
          const isSelected = selected === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={isSelected}
              className={`rounded-2xl border bg-surface p-4 text-left transition-colors ${
                isSelected
                  ? "border-accent ring-2 ring-orange-100"
                  : "border-border hover:border-stone-300"
              }`}
            >
              <div
                className={`mb-3 h-16 rounded-xl ${
                  id === "cartoon"
                    ? "bg-linear-to-br from-amber-200 to-orange-300"
                    : id === "kawaii"
                      ? "bg-linear-to-br from-pink-200 to-rose-300"
                      : id === "watercolor"
                        ? "bg-linear-to-br from-sky-200 to-indigo-200"
                        : "bg-linear-to-br from-emerald-200 to-lime-300"
                }`}
              />
              <p className="font-medium">{STYLE_LABELS[id]}</p>
              <p className="mt-1 text-sm text-muted">{STYLE_HINTS[id]}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
