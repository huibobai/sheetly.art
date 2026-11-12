export const STICKER_STYLES = [
  "cartoon",
  "kawaii",
  "watercolor",
  "pixel-art",
  "anime",
  "sketch",
  "clay",
  "outline",
] as const;

export type StickerStyle = (typeof STICKER_STYLES)[number];

const STICKER_FINISH =
  "Keep the same subject, pose, and recognizable features. Present one subject as a clean die-cut sticker with a thick even white contour border. Remove the original background and place the sticker on a plain solid background. No text, no watermark, no extra objects.";

export const STYLE_PROMPTS: Record<StickerStyle, string> = {
  cartoon: `Redraw this photo as a bold cartoon sticker. Use thick black outlines, flat vibrant colors, and simple cel shading. ${STICKER_FINISH}`,
  kawaii: `Redraw this photo as a kawaii sticker. Use rounded shapes, soft pastel colors, a gentle blush, and clean thick outlines. ${STICKER_FINISH}`,
  watercolor: `Redraw this photo as a watercolor sticker. Use soft translucent washes, visible paper texture, and delicate ink outlines. ${STICKER_FINISH}`,
  "pixel-art": `Redraw this photo as a retro pixel-art sticker. Use chunky low-resolution pixel art, a limited color palette, and crisp hard edges. ${STICKER_FINISH}`,
  anime: `Redraw this photo as a bold cel-shaded illustration sticker. Use clean ink linework, large expressive eyes, stylized features, and flat cel-shaded color. ${STICKER_FINISH}`,
  sketch: `Redraw this photo as a pencil-sketch sticker. Use visible graphite strokes, light crosshatching, paper texture, and mostly monochrome shading. ${STICKER_FINISH}`,
  clay: `Redraw this photo as a clay-sculpture sticker. Use soft polymer-clay forms, rounded shapes, slight surface texture, and gentle even lighting. ${STICKER_FINISH}`,
  outline: `Redraw this photo as an outline sticker. Use one thick even black contour, a white interior, and almost no fill, like a clean die-cut line drawing. ${STICKER_FINISH}`,
};

export function isStickerStyle(value: string): value is StickerStyle {
  return (STICKER_STYLES as readonly string[]).includes(value);
}

export const STYLE_LABELS: Record<StickerStyle, string> = {
  cartoon: "Cartoon",
  kawaii: "Kawaii",
  watercolor: "Watercolor",
  "pixel-art": "Retro pixel art",
  anime: "Big-eye cartoon",
  sketch: "Sketch",
  clay: "Clay",
  outline: "Outline",
};

export function styleLabel(style: string | null | undefined) {
  if (!style) {
    return null;
  }
  return isStickerStyle(style) ? STYLE_LABELS[style] : style;
}

export function styleIdFromUrl(url: string | null | undefined) {
  if (!url || !url.includes("#")) {
    return null;
  }
  try {
    const id = new URL(url).hash.replace(/^#/, "");
    const style = new URLSearchParams(id).get("style");
    return style && style.length > 0 ? style : null;
  } catch {
    return null;
  }
}

export function urlWithStyle(url: string, style: string | null) {
  const base = url.split("#")[0];
  if (!style) {
    return base;
  }
  return `${base}#style=${encodeURIComponent(style)}`;
}

export function urlWithoutStyle(url: string) {
  return url.split("#")[0];
}
