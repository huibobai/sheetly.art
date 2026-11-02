export const SHEET_COUNTS = [6, 9, 12] as const;

export type SheetCount = (typeof SHEET_COUNTS)[number];

export type SheetSize = "a4" | "square" | "4x6";

export const SHEET_SIZES: { id: SheetSize; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "a4", label: "A4" },
  { id: "4x6", label: "4×6" },
];

export function sheetSizeLabel(size: SheetSize) {
  return SHEET_SIZES.find((item) => item.id === size)?.label ?? size;
}

export type SheetBackground = "white" | "transparent" | "blush" | "mint" | "lilac" | "butter";

export const SHEET_BACKGROUNDS: {
  id: SheetBackground;
  label: string;
  color: string | null;
}[] = [
  { id: "white", label: "White", color: "#ffffff" },
  { id: "transparent", label: "Transparent", color: null },
  { id: "blush", label: "Blush", color: "#f8e6e0" },
  { id: "mint", label: "Mint", color: "#e5f3ea" },
  { id: "lilac", label: "Lilac", color: "#eee7f8" },
  { id: "butter", label: "Butter", color: "#fbf3d8" },
];

export const PRINT_DPI = 300;
const MM = PRINT_DPI / 25.4;
const PREVIEW_LONG_EDGE = 1200;
const PAGE_MARGIN_MM = 12;
const STICKER_GAP_MM = 11;
const CUT_INSET_MM = 1.5;

export type ExtraSticker = {
  id: string;
  previewUrl: string;
  label: string;
};

export type SheetImage = CanvasImageSource & { width: number; height: number };

export type SheetSlot = {
  x: number;
  y: number;
  size: number;
};

export function sheetGrid(count: SheetCount, size: SheetSize) {
  if (size === "square") {
    if (count === 6) return { cols: 3, rows: 2 };
    if (count === 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: 3 };
  }

  if (count === 6) return { cols: 2, rows: 3 };
  if (count === 9) return { cols: 3, rows: 3 };
  return { cols: 3, rows: 4 };
}

export function sheetPixels(size: SheetSize) {
  if (size === "square") {
    return { width: 3000, height: 3000 };
  }
  if (size === "4x6") {
    return { width: 1200, height: 1800 };
  }
  return { width: 2480, height: 3508 };
}

export function previewScale(size: SheetSize) {
  const { width, height } = sheetPixels(size);
  return Math.min(1, PREVIEW_LONG_EDGE / Math.max(width, height));
}

export function layoutStickerSheet(count: SheetCount, size: SheetSize) {
  const { width, height } = sheetPixels(size);
  const margin = Math.round(PAGE_MARGIN_MM * MM);
  const gap = Math.round(STICKER_GAP_MM * MM);
  const { cols, rows } = sheetGrid(count, size);
  const innerWidth = width - margin * 2;
  const innerHeight = height - margin * 2;
  const cell = Math.floor(
    Math.min((innerWidth - gap * (cols - 1)) / cols, (innerHeight - gap * (rows - 1)) / rows),
  );
  const gridWidth = cell * cols + gap * (cols - 1);
  const gridHeight = cell * rows + gap * (rows - 1);
  const originX = Math.round((width - gridWidth) / 2);
  const originY = Math.round((height - gridHeight) / 2);
  const slots: SheetSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      slots.push({
        x: originX + col * (cell + gap),
        y: originY + row * (cell + gap),
        size: cell,
      });
    }
  }

  return { width, height, slots, margin, gap };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function sheetImages(image: SheetImage | readonly SheetImage[]) {
  const images = Array.isArray(image) ? image : [image];
  return images.filter((item) => item.width > 0 && item.height > 0);
}

function drawCutGuide(context: CanvasRenderingContext2D, slot: SheetSlot) {
  const radius = Math.round(slot.size * 0.14);
  context.save();
  context.strokeStyle = "#9c958c";
  context.lineWidth = Math.max(2, Math.round(0.35 * MM));
  context.setLineDash([Math.round(2 * MM), Math.round(1.35 * MM)]);
  context.lineCap = "round";
  context.lineJoin = "round";
  roundedRect(context, slot.x, slot.y, slot.size, slot.size, radius);
  context.stroke();
  context.restore();
}

export function drawStickerSheet(
  context: CanvasRenderingContext2D,
  image: SheetImage | readonly SheetImage[],
  options: {
    count: SheetCount;
    size: SheetSize;
    background: SheetBackground;
    padding: number;
    scale?: number;
  },
) {
  const images = sheetImages(image);
  const layout = layoutStickerSheet(options.count, options.size);
  const scale = options.scale ?? 1;
  const canvas = context.canvas;
  canvas.width = Math.max(1, Math.round(layout.width * scale));
  canvas.height = Math.max(1, Math.round(layout.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const paddingRatio = Math.min(Math.max(options.padding, 0), 0.28);
  const inset = Math.round(CUT_INSET_MM * MM);

  context.clearRect(0, 0, layout.width, layout.height);
  const backgroundColor = SHEET_BACKGROUNDS.find((item) => item.id === options.background)?.color;
  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, layout.width, layout.height);
  }

  if (!images.length) {
    return;
  }

  layout.slots.forEach((slot, index) => {
    const artwork = images[index % images.length];
    const cardSize = Math.max(1, slot.size - inset * 2);
    const cardX = slot.x + inset;
    const cardY = slot.y + inset;
    const radius = Math.round(cardSize * 0.14);
    const padding = Math.round(cardSize * paddingRatio);
    const inner = Math.max(cardSize - padding * 2, Math.round(cardSize * 0.45));
    const fit = Math.min(inner / artwork.width, inner / artwork.height);
    const drawWidth = artwork.width * fit;
    const drawHeight = artwork.height * fit;
    const drawX = cardX + (cardSize - drawWidth) / 2;
    const drawY = cardY + (cardSize - drawHeight) / 2;

    context.save();
    if (options.background !== "transparent") {
      context.shadowColor = "rgba(28, 25, 23, 0.1)";
      context.shadowBlur = 18;
      context.shadowOffsetY = 8;
    }
    roundedRect(context, cardX, cardY, cardSize, cardSize, radius);
    context.fillStyle = "#ffffff";
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, cardX, cardY, cardSize, cardSize, radius);
    context.clip();
    context.drawImage(artwork, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    roundedRect(
      context,
      cardX + 2,
      cardY + 2,
      cardSize - 4,
      cardSize - 4,
      Math.max(radius - 2, 0),
    );
    context.setLineDash([]);
    context.lineWidth = 3;
    context.strokeStyle = "#e7e5e4";
    context.stroke();
  });

  for (const slot of layout.slots) {
    drawCutGuide(context, slot);
  }
}

function pngCrc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function pngBlobWithDpi(blob: Blob, dpi = PRINT_DPI) {
  const source = new Uint8Array(await blob.arrayBuffer());
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (source.length < 8 || pngSignature.some((byte, index) => source[index] !== byte)) {
    return blob;
  }

  const ppm = Math.round((dpi / 25.4) * 1000);
  const chunkData = new Uint8Array(9);
  const dataView = new DataView(chunkData.buffer);
  dataView.setUint32(0, ppm);
  dataView.setUint32(4, ppm);
  chunkData[8] = 1;

  const typeAndData = new Uint8Array(13);
  typeAndData.set([112, 72, 89, 115], 0);
  typeAndData.set(chunkData, 4);
  const crc = pngCrc32(typeAndData);

  const chunk = new Uint8Array(21);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9);
  chunk.set(typeAndData, 4);
  chunkView.setUint32(17, crc);

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let offset = 8;
  while (offset + 8 <= source.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      source[offset + 4],
      source[offset + 5],
      source[offset + 6],
      source[offset + 7],
    );
    if (type === "IHDR") {
      const insertAt = offset + 12 + length;
      const output = new Uint8Array(source.length + chunk.length);
      output.set(source.subarray(0, insertAt), 0);
      output.set(chunk, insertAt);
      output.set(source.subarray(insertAt), insertAt + chunk.length);
      return new Blob([output], { type: "image/png" });
    }
    offset += 12 + length;
  }

  return blob;
}
