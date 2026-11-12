import type { StickerStyle } from "@/lib/sticker-styles";

/**
 * Every image Marketing owns: the raster logo, the header mark, the favicon,
 * and one style-preview photo per sticker style.
 *
 * Components read `path`, `alt`, `width`, and `height` from here. Drop a
 * replacement in `public/brand/` (see that folder's README) and change this
 * slot's `path` to the new `/brand/...` URL. Style ids are not stored here;
 * preview keys match the ids saved on sheets and in URLs.
 *
 * There is no Open Graph image.
 */
export const ASSET_PROVENANCE_PENDING = "PENDING: replace with Marketing asset";

export type BrandAsset = {
  /** Public URL, or the App Router file Next serves for the favicon. */
  path: string;
  alt: string;
  width: number;
  height: number;
  /** Source tool, prompt or source, date, and licence note. */
  provenance: string;
};

function slot(path: string, alt: string, width: number, height: number): BrandAsset {
  return {
    path,
    alt,
    width,
    height,
    provenance: ASSET_PROVENANCE_PENDING,
  };
}

export const BRAND_ASSETS: {
  logo: BrandAsset;
  headerMark: BrandAsset;
  favicon: BrandAsset;
  stylePreviews: Record<StickerStyle, BrandAsset>;
} = {
  /** Raster logo. Not shown in the header; the header uses `headerMark`. */
  logo: slot("/logo.png", "sheetly.art logo", 240, 240),
  /** Sheet icon beside the wordmark. Drawn at 40×40 CSS pixels. */
  headerMark: slot("/sheetly-logo.svg", "sheetly.art mark", 64, 64),
  /**
   * Live URL for the favicon. The file on disk is `app/icon.svg`; Next.js
   * serves it at `/icon.svg` because of that file name. Point `path` at
   * `/brand/favicon.svg` only after `metadata.icons` uses it and `app/icon.svg`
   * is removed, otherwise the old icon stays linked.
   */
  favicon: slot("/icon.svg", "sheetly.art", 64, 64),
  stylePreviews: {
    cartoon: slot("/styles/cartoon.webp", "Cartoon style preview", 400, 400),
    kawaii: slot("/styles/kawaii.webp", "Kawaii style preview", 400, 400),
    watercolor: slot("/styles/watercolor.webp", "Watercolor style preview", 400, 400),
    "pixel-art": slot("/styles/pixel-art.webp", "Retro pixel art style preview", 400, 400),
    anime: slot("/styles/anime.webp", "Big-eye cartoon style preview", 400, 400),
    sketch: slot("/styles/sketch.webp", "Sketch style preview", 400, 400),
    clay: slot("/styles/clay.webp", "Clay style preview", 400, 400),
    outline: slot("/styles/outline.webp", "Outline style preview", 400, 400),
  },
};
