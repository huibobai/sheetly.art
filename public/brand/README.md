# Brand image slots

Marketing replacements go in this folder. The site keeps using the current files until `path` for that slot in `lib/brand-assets.ts` is changed to the new URL (one line per slot). Do not add a new image from anywhere else in the app.

Each slot's `provenance` is `PENDING: replace with Marketing asset`. When a file is replaced, set `provenance` to the source tool, the prompt or other source, the date, and a licence note.

Style preview filenames use the style id. Those ids are stored on saved sheets and in URLs, so they stay as they are. The names people see are in the table below.

There is no Open Graph image.

| Slot | Drop this file | Size | Format | Shown as | Current file | `path` after the switch |
| --- | --- | --- | --- | --- | --- | --- |
| `logo` | `logo.png` | 240×240 | PNG | Raster logo (not in the header today) | `public/logo.png` | `/brand/logo.png` |
| `headerMark` | `header-mark.svg` | 64×64 | SVG | Header icon, drawn at 40×40 CSS pixels | `public/sheetly-logo.svg` | `/brand/header-mark.svg` |
| `favicon` | `favicon.svg` | 64×64 | SVG | Browser icon | `app/icon.svg` | `/brand/favicon.svg` |
| `stylePreviews.cartoon` | `styles/cartoon.webp` | 400×400 | WebP | Cartoon | `public/styles/cartoon.webp` | `/brand/styles/cartoon.webp` |
| `stylePreviews.kawaii` | `styles/kawaii.webp` | 400×400 | WebP | Kawaii | `public/styles/kawaii.webp` | `/brand/styles/kawaii.webp` |
| `stylePreviews.watercolor` | `styles/watercolor.webp` | 400×400 | WebP | Watercolor | `public/styles/watercolor.webp` | `/brand/styles/watercolor.webp` |
| `stylePreviews.pixel-art` | `styles/pixel-art.webp` | 400×400 | WebP | Retro pixel art | `public/styles/pixel-art.webp` | `/brand/styles/pixel-art.webp` |
| `stylePreviews.anime` | `styles/anime.webp` | 400×400 | WebP | Big-eye cartoon | `public/styles/anime.webp` | `/brand/styles/anime.webp` |
| `stylePreviews.sketch` | `styles/sketch.webp` | 400×400 | WebP | Sketch | `public/styles/sketch.webp` | `/brand/styles/sketch.webp` |
| `stylePreviews.clay` | `styles/clay.webp` | 400×400 | WebP | Clay | `public/styles/clay.webp` | `/brand/styles/clay.webp` |
| `stylePreviews.outline` | `styles/outline.webp` | 400×400 | WebP | Outline | `public/styles/outline.webp` | `/brand/styles/outline.webp` |

Square pixels, no text baked into the style previews. SVG slots are the 64×64 viewBox the current files use.

The favicon is the one slot that needs a second edit. Next.js serves `app/icon.svg` at `/icon.svg` because of the file name (`BRAND_ASSETS.favicon.path` is that URL today). After `public/brand/favicon.svg` is in place:

1. Set `BRAND_ASSETS.favicon.path` to `/brand/favicon.svg`.
2. Set `metadata.icons.icon` in `app/layout.tsx` to that same path.
3. Remove `app/icon.svg` so the old icon is not also linked.

The header mark and the style previews update from the `path` change alone. The header reads `headerMark`. The style buttons read `stylePreviews`.
