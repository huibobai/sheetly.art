export const SHEET_COUNTS = [6, 9, 12] as const;

export type SheetCount = (typeof SHEET_COUNTS)[number];

export type SheetSize = "a4" | "square";

export const SHEET_SIZES: { id: SheetSize; label: string }[] = [
  { id: "a4", label: "A4" },
  { id: "square", label: "Square" },
];

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

const DPI = 300;
const MM = DPI / 25.4;

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
  const width = Math.round(210 * MM);
  if (size === "square") {
    return { width, height: width };
  }
  return { width, height: Math.round(297 * MM) };
}

export function layoutStickerSheet(count: SheetCount, size: SheetSize) {
  const { width, height } = sheetPixels(size);
  const margin = Math.round(14 * MM);
  const gap = Math.round(8 * MM);
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

export function drawStickerSheet(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  options: {
    count: SheetCount;
    size: SheetSize;
    background: SheetBackground;
    padding: number;
  },
) {
  const layout = layoutStickerSheet(options.count, options.size);
  const canvas = context.canvas;
  canvas.width = layout.width;
  canvas.height = layout.height;
  const paddingRatio = Math.min(Math.max(options.padding, 0), 0.28);

  context.clearRect(0, 0, layout.width, layout.height);
  const backgroundColor = SHEET_BACKGROUNDS.find((item) => item.id === options.background)?.color;
  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, layout.width, layout.height);
  }

  for (const slot of layout.slots) {
    const radius = Math.round(slot.size * 0.14);
    const padding = Math.round(slot.size * paddingRatio);
    const inner = Math.max(slot.size - padding * 2, Math.round(slot.size * 0.45));
    const scale = Math.min(inner / image.width, inner / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = slot.x + (slot.size - drawWidth) / 2;
    const drawY = slot.y + (slot.size - drawHeight) / 2;

    context.save();
    if (options.background !== "transparent") {
      context.shadowColor = "rgba(28, 25, 23, 0.1)";
      context.shadowBlur = 18;
      context.shadowOffsetY = 8;
    }
    roundedRect(context, slot.x, slot.y, slot.size, slot.size, radius);
    context.fillStyle = "#ffffff";
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, slot.x, slot.y, slot.size, slot.size, radius);
    context.clip();
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    roundedRect(
      context,
      slot.x + 2,
      slot.y + 2,
      slot.size - 4,
      slot.size - 4,
      Math.max(radius - 2, 0),
    );
    context.lineWidth = 3;
    context.strokeStyle = "#e7e5e4";
    context.stroke();
  }
}
