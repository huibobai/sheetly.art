export const SHEET_COUNTS = [4, 6, 9, 12] as const;

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
const PAGE_MARGIN_MM = 8;
const STICKER_GAP_MM = 3.5;
const CUT_GAP_MM = 0.45;

/** Preview die-cuts stay small. Print die-cuts used to use the full slot, which upscales a 1024px photo. */
export const PREVIEW_WORK_LIMIT = 460;
/**
 * A die-cut is drawn inside a white border, so the photo never needs the whole work canvas.
 * 75% of the source's long edge keeps a 1024px image from being stretched before the per-pixel passes.
 */
export const SOURCE_WORK_FRACTION = 0.75;
export const PREVIEW_DEBOUNCE_MS = 200;

export function cappedWorkSize(input: {
  slotLong: number;
  sourceMaxEdge: number;
  scale: number;
  previewLimit?: number;
  sourceFraction?: number;
}) {
  const previewLimit = input.previewLimit ?? PREVIEW_WORK_LIMIT;
  const sourceFraction = input.sourceFraction ?? SOURCE_WORK_FRACTION;
  const sourceCap = Math.max(1, input.sourceMaxEdge) * sourceFraction;
  const slot = Math.max(0, input.slotLong);
  const limited = input.scale < 1 ? Math.min(slot, previewLimit, sourceCap) : Math.min(slot, sourceCap);
  return Math.max(48, Math.round(limited));
}

/** Expensive subject mask, shared by every border width and sheet background. */
export function cutoutCacheKey(workSize: number) {
  return String(workSize);
}

/** Painted sprite, including the white border. Background is not part of the key. */
export function spriteCacheKey(workSize: number, borderPx: number, cutGapPx: number) {
  return `${workSize}:${borderPx.toFixed(2)}:${cutGapPx.toFixed(2)}`;
}

export function createDebouncedCallback(waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const schedule = (callback: () => void) => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      callback();
    }, waitMs);
  };
  return { schedule, cancel };
}

/**
 * The animation callback runs before paint, so work started there still blocks the frame.
 * Waiting for the following frame lets "Getting the print file ready…" show up first.
 */
export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export type ExtraSticker = {
  id: string;
  previewUrl: string;
  label: string;
};

export type SheetImage = CanvasImageSource & { width: number; height: number };

export type SheetSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function sheetGrid(count: SheetCount, size: SheetSize) {
  if (count === 4) return { cols: 2, rows: 2 };

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

export function layoutStickerSheet(count: SheetCount, size: SheetSize, aspect = 1) {
  const { width, height } = sheetPixels(size);
  const margin = Math.round(PAGE_MARGIN_MM * MM);
  const gap = Math.round(STICKER_GAP_MM * MM);
  const { cols, rows } = sheetGrid(count, size);
  const innerWidth = width - margin * 2;
  const innerHeight = height - margin * 2;
  const shape = Math.min(1.8, Math.max(0.55, aspect));
  const maxWidth = (innerWidth - gap * (cols - 1)) / cols;
  const maxHeight = (innerHeight - gap * (rows - 1)) / rows;
  let cellWidth = maxWidth;
  let cellHeight = cellWidth / shape;
  if (cellHeight > maxHeight) {
    cellHeight = maxHeight;
    cellWidth = cellHeight * shape;
  }
  cellWidth = Math.max(1, Math.floor(cellWidth));
  cellHeight = Math.max(1, Math.floor(cellHeight));
  const gridWidth = cellWidth * cols + gap * (cols - 1);
  const gridHeight = cellHeight * rows + gap * (rows - 1);
  const originX = Math.round((width - gridWidth) / 2);
  const originY = Math.round((height - gridHeight) / 2);
  const slots: SheetSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      slots.push({
        x: originX + col * (cellWidth + gap),
        y: originY + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }

  return { width, height, slots, margin, gap };
}

type Point = { x: number; y: number };

type Bounds = { x: number; y: number; width: number; height: number };

type DieCutSprite = {
  canvas: HTMLCanvasElement;
  contour: Point[][];
  bounds: Bounds;
};

type StickerPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: Bounds;
};

const dieCutCache = new WeakMap<SheetImage, Map<string, DieCutSprite>>();

type ImageRel = { x: number; y: number; w: number; h: number };

type DrawPlacement = {
  scale: number;
  originX: number;
  originY: number;
  drawWidth: number;
  drawHeight: number;
};

type NativeCutout = {
  kind: "native";
  source: ImageData;
  mask: Uint8Array;
  placement: DrawPlacement;
  rel: ImageRel;
};

type RoundedCutout = { kind: "rounded" };

type SubjectCutout = NativeCutout | RoundedCutout;

type SubjectFrame = {
  aspect: number;
  rounded: boolean;
  rel: ImageRel;
};

const cutoutCache = new WeakMap<SheetImage, Map<string, SubjectCutout>>();

type BuildStats = {
  probeMasks: number;
  cutoutMasks: number;
  cutoutHits: number;
  spriteHits: number;
  paints: number;
};

const buildStats: BuildStats = {
  probeMasks: 0,
  cutoutMasks: 0,
  cutoutHits: 0,
  spriteHits: 0,
  paints: 0,
};

export function sheetBuildStats() {
  return { ...buildStats };
}

export function resetSheetBuildStats() {
  buildStats.probeMasks = 0;
  buildStats.cutoutMasks = 0;
  buildStats.cutoutHits = 0;
  buildStats.spriteHits = 0;
  buildStats.paints = 0;
}

export type SheetBuildControl = {
  signal?: AbortSignal;
  afterSticker?: () => void | Promise<void>;
};

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("The sheet build was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function sheetImages(image: SheetImage | readonly SheetImage[]) {
  const images = Array.isArray(image) ? image : [image];
  return images.filter((item) => item.width > 0 && item.height > 0);
}

function colorDistanceSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function isNeutralLight(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min > 226 && max - min < 30;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    return mask;
  }
  const out = new Uint8Array(mask.length);
  const reach = Math.ceil(radius);
  const reachSq = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }
      const y0 = Math.max(0, y - reach);
      const y1 = Math.min(height - 1, y + reach);
      const x0 = Math.max(0, x - reach);
      const x1 = Math.min(width - 1, x + reach);
      for (let ny = y0; ny <= y1; ny += 1) {
        const dy = ny - y;
        const row = ny * width;
        for (let nx = x0; nx <= x1; nx += 1) {
          const dx = nx - x;
          if (dx * dx + dy * dy <= reachSq) {
            out[row + nx] = 1;
          }
        }
      }
    }
  }
  return out;
}

function distanceSquared(subject: Uint8Array, width: number, height: number) {
  const inf = 1e15;
  const column = new Float32Array(height);
  const partial = new Float32Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      column[y] = subject[y * width + x] ? 0 : inf;
    }
    const transformed = distanceTransform1d(column);
    for (let y = 0; y < height; y += 1) {
      partial[y * width + x] = transformed[y];
    }
  }

  const output = new Float32Array(width * height);
  const row = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) {
      row[x] = partial[offset + x];
    }
    const transformed = distanceTransform1d(row);
    output.set(transformed, offset);
  }
  return output;
}

function distanceTransform1d(values: Float32Array) {
  const length = values.length;
  const output = new Float32Array(length);
  const parabola = new Int32Array(length);
  const bounds = new Float32Array(length + 1);
  let k = 0;
  parabola[0] = 0;
  bounds[0] = -Infinity;
  bounds[1] = Infinity;

  for (let q = 1; q < length; q += 1) {
    let s =
      (values[q] + q * q - (values[parabola[k]] + parabola[k] * parabola[k])) /
      (2 * q - 2 * parabola[k]);
    while (k > 0 && s <= bounds[k]) {
      k -= 1;
      s =
        (values[q] + q * q - (values[parabola[k]] + parabola[k] * parabola[k])) /
        (2 * q - 2 * parabola[k]);
    }
    k += 1;
    parabola[k] = q;
    bounds[k] = s;
    bounds[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < length; q += 1) {
    while (bounds[k + 1] < q) {
      k += 1;
    }
    const distance = q - parabola[k];
    output[q] = distance * distance + values[parabola[k]];
  }
  return output;
}

function backgroundSample(data: Uint8ClampedArray, width: number, height: number) {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const span = Math.max(1, Math.min(maxX - minX, maxY - minY));
  const patch = Math.max(2, Math.round(span * 0.045));
  const origins = [
    [minX, minY],
    [Math.max(minX, maxX - patch + 1), minY],
    [minX, Math.max(minY, maxY - patch + 1)],
    [Math.max(minX, maxX - patch + 1), Math.max(minY, maxY - patch + 1)],
  ];

  for (const [originX, originY] of origins) {
    for (let y = originY; y < originY + patch; y += 1) {
      for (let x = originX; x < originX + patch; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] < 20) {
          continue;
        }
        reds.push(data[offset]);
        greens.push(data[offset + 1]);
        blues.push(data[offset + 2]);
      }
    }
  }

  const median = (values: number[]) => {
    if (!values.length) {
      return 255;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  };

  const red = median(reds);
  const green = median(greens);
  const blue = median(blues);
  const distances = reds
    .map((value, index) => Math.sqrt(colorDistanceSq(value, greens[index], blues[index], red, green, blue)))
    .sort((a, b) => a - b);
  const percentile = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.9))] ?? 10;
  const tolerance = Math.min(48, Math.max(18, percentile + 14));
  return { red, green, blue, tolerance, toleranceSq: tolerance * tolerance };
}

function subjectMask(data: Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  const subject = new Uint8Array(count);
  const background = backgroundSample(data, width, height);
  const barrierLimit = Math.max(background.tolerance + 12, 40);
  const barrierLimitSq = barrierLimit * barrierLimit;
  const barrier = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] < 16) {
      continue;
    }
    if (
      colorDistanceSq(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        background.red,
        background.green,
        background.blue,
      ) > barrierLimitSq
    ) {
      barrier[index] = 1;
    }
  }

  const block = dilateMask(barrier, width, height, 2);
  const removed = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const pushRemoved = (index: number) => {
    if (removed[index] || block[index]) {
      return;
    }
    const offset = index * 4;
    const alpha = data[offset + 3];
    const matches =
      alpha < 16 ||
      colorDistanceSq(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        background.red,
        background.green,
        background.blue,
      ) <= background.toleranceSq ||
      isNeutralLight(data[offset], data[offset + 1], data[offset + 2]);
    if (!matches) {
      return;
    }
    removed[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    pushRemoved(x);
    pushRemoved((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    pushRemoved(y * width);
    pushRemoved(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) pushRemoved(index - 1);
    if (x + 1 < width) pushRemoved(index + 1);
    if (y > 0) pushRemoved(index - width);
    if (y + 1 < height) pushRemoved(index + width);
  }

  for (let index = 0; index < count; index += 1) {
    subject[index] = removed[index] || data[index * 4 + 3] < 12 ? 0 : 1;
  }

  const peelLimit = Math.min(background.tolerance + 36, 78);
  const peelLimitSq = peelLimit * peelLimit;
  for (let pass = 0; pass < 8; pass += 1) {
    const peel: number[] = [];
    for (let index = 0; index < count; index += 1) {
      if (!subject[index]) {
        continue;
      }
      const offset = index * 4;
      const nearBackground =
        colorDistanceSq(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          background.red,
          background.green,
          background.blue,
        ) <= peelLimitSq;
      if (!nearBackground) {
        continue;
      }
      const x = index % width;
      const y = (index / width) | 0;
      const exposed =
        (x > 0 && !subject[index - 1]) ||
        (x + 1 < width && !subject[index + 1]) ||
        (y > 0 && !subject[index - width]) ||
        (y + 1 < height && !subject[index + width]);
      if (exposed) {
        peel.push(index);
      }
    }
    if (!peel.length) {
      break;
    }
    for (const index of peel) {
      subject[index] = 0;
    }
  }

  erodeSubject(subject, width, height, 2.25);
  removeSpecks(subject, width, height);
  return subject;
}

function erodeSubject(subject: Uint8Array, width: number, height: number, radius: number) {
  const outside = new Uint8Array(subject.length);
  for (let index = 0; index < subject.length; index += 1) {
    outside[index] = subject[index] ? 0 : 1;
  }
  const distance = distanceSquared(outside, width, height);
  const limit = radius * radius;
  for (let index = 0; index < subject.length; index += 1) {
    if (subject[index] && distance[index] <= limit) {
      subject[index] = 0;
    }
  }
}

function removeSpecks(subject: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(subject.length);
  const queue = new Int32Array(subject.length);
  const components: number[][] = [];
  let total = 0;

  for (let start = 0; start < subject.length; start += 1) {
    if (!subject[start] || seen[start]) {
      continue;
    }
    const pixels: number[] = [];
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      pixels.push(index);
      const x = index % width;
      const y = (index / width) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const next = ny * width + nx;
          if (subject[next] && !seen[next]) {
            seen[next] = 1;
            queue[tail] = next;
            tail += 1;
          }
        }
      }
    }
    total += pixels.length;
    components.push(pixels);
  }

  const minimum = Math.max(36, Math.round(total * 0.012));
  for (const pixels of components) {
    if (pixels.length >= minimum) {
      continue;
    }
    for (const index of pixels) {
      subject[index] = 0;
    }
  }
}

function maskBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!count) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
}

const frameCache = new WeakMap<SheetImage, SubjectFrame>();

function subjectFrame(image: SheetImage): SubjectFrame {
  const cached = frameCache.get(image);
  if (cached) {
    return cached;
  }
  const size = 180;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const fallback: SubjectFrame = { aspect: 1, rounded: true, rel: { x: 0, y: 0, w: 1, h: 1 } };
  if (!context) {
    frameCache.set(image, fallback);
    return fallback;
  }
  const scale = Math.min(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const originX = (size - drawWidth) / 2;
  const originY = (size - drawHeight) / 2;
  context.drawImage(image, originX, originY, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, size, size);
  buildStats.probeMasks += 1;
  const mask = subjectMask(pixels.data, size, size);
  const bounds = maskBounds(mask, size, size);
  const ratio = bounds ? bounds.count / (size * size) : 0;
  const rounded =
    !bounds ||
    ratio < 0.035 ||
    backgroundRemains(mask, size, originX, originY, drawWidth, drawHeight);
  const frame: SubjectFrame = !bounds
    ? fallback
    : {
        aspect: bounds.height > 0 ? bounds.width / bounds.height : 1,
        rounded,
        rel: {
          x: (bounds.x - originX) / drawWidth,
          y: (bounds.y - originY) / drawHeight,
          w: bounds.width / drawWidth,
          h: bounds.height / drawHeight,
        },
      };
  frameCache.set(image, frame);
  return frame;
}

function subjectAspect(image: SheetImage) {
  return subjectFrame(image).aspect;
}

function clampAspect(value: number) {
  return Math.min(1.8, Math.max(0.55, value));
}

function placementFor(image: SheetImage, rel: ImageRel, workSize: number, content: number): DrawPlacement {
  const containedScale = Math.min(content / image.width, content / image.height);
  const subjectLong = Math.max(rel.w * image.width, rel.h * image.height);
  const containedSubjectLong = subjectLong * containedScale;
  const scaleUp = containedSubjectLong > 0 && containedSubjectLong < content * 0.94;
  const scale = scaleUp ? content / subjectLong : containedScale;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  if (!scaleUp) {
    return {
      scale,
      originX: (workSize - drawWidth) / 2,
      originY: (workSize - drawHeight) / 2,
      drawWidth,
      drawHeight,
    };
  }
  const centerX = (rel.x + rel.w / 2) * image.width;
  const centerY = (rel.y + rel.h / 2) * image.height;
  return {
    scale,
    originX: workSize / 2 - centerX * scale,
    originY: workSize / 2 - centerY * scale,
    drawWidth,
    drawHeight,
  };
}

function samePlacement(a: DrawPlacement, b: DrawPlacement) {
  return (
    Math.abs(a.originX - b.originX) < 0.2 &&
    Math.abs(a.originY - b.originY) < 0.2 &&
    Math.abs(a.drawWidth - b.drawWidth) < 0.2 &&
    Math.abs(a.drawHeight - b.drawHeight) < 0.2
  );
}

function drawPlacement(image: SheetImage, placement: DrawPlacement, workSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = workSize;
  canvas.height = workSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not prepare a die-cut sticker.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, workSize, workSize);
  context.drawImage(image, placement.originX, placement.originY, placement.drawWidth, placement.drawHeight);
  return context.getImageData(0, 0, workSize, workSize);
}

function resampleMask(cutout: NativeCutout, placement: DrawPlacement, workSize: number) {
  const mask = new Uint8Array(workSize * workSize);
  const source = cutout.mask;
  const sourceScale = cutout.placement.scale;
  for (let y = 0; y < workSize; y += 1) {
    const imageY = (y - placement.originY) / placement.scale;
    const sourceY = Math.round(cutout.placement.originY + imageY * sourceScale);
    if (sourceY < 0 || sourceY >= workSize) {
      continue;
    }
    const sourceRow = sourceY * workSize;
    const row = y * workSize;
    for (let x = 0; x < workSize; x += 1) {
      const imageX = (x - placement.originX) / placement.scale;
      const sourceX = Math.round(cutout.placement.originX + imageX * sourceScale);
      if (sourceX < 0 || sourceX >= workSize) {
        continue;
      }
      mask[row + x] = source[sourceRow + sourceX];
    }
  }
  return mask;
}

function alphaBounds(image: ImageData): Bounds | null {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function smoothClosed(points: Point[]) {
  const count = points.length;
  if (count < 8) {
    return points;
  }
  const smoothed: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    smoothed.push({
      x: (previous.x + current.x * 4 + next.x) / 6,
      y: (previous.y + current.y * 4 + next.y) / 6,
    });
  }
  return smoothed;
}

function traceContours(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length);
  const contours: Point[][] = [];
  const directions = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  const markComponent = (startX: number, startY: number) => {
    const queue = new Int32Array(mask.length);
    let head = 0;
    let tail = 0;
    const start = startY * width + startX;
    seen[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = (index / width) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            queue[tail] = next;
            tail += 1;
          }
        }
      }
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) {
        continue;
      }
      const points: Point[] = [];
      let px = x;
      let py = y;
      let search = 0;
      const limit = width * height;
      let steps = 0;
      let closed = false;
      while (steps < limit) {
        points.push({ x: px + 0.5, y: py + 0.5 });
        let found = false;
        for (let turn = 0; turn < 8; turn += 1) {
          const direction = (search + turn) % 8;
          const nx = px + directions[direction][0];
          const ny = py + directions[direction][1];
          if (inside(nx, ny)) {
            px = nx;
            py = ny;
            search = (direction + 5) % 8;
            found = true;
            break;
          }
        }
        if (!found) {
          break;
        }
        steps += 1;
        if (px === x && py === y) {
          closed = true;
          break;
        }
      }
      markComponent(x, y);
      if (closed && points.length > 12) {
        let contour = points;
        for (let pass = 0; pass < 2; pass += 1) {
          contour = smoothClosed(contour);
        }
        const step = Math.max(1, Math.round(contour.length / 240));
        const reduced: Point[] = [];
        for (let index = 0; index < contour.length; index += step) {
          reduced.push(contour[index]);
        }
        if (reduced.length > 12) {
          contours.push(reduced);
        }
      }
    }
  }

  return contours;
}

function roundedContour(size: number, inset: number, radius: number) {
  const points: Point[] = [];
  const rectRadius = Math.min(radius, (size - inset * 2) / 2);
  const corners = [
    { cx: size - inset - rectRadius, cy: inset + rectRadius, start: -Math.PI / 2, end: 0 },
    { cx: size - inset - rectRadius, cy: size - inset - rectRadius, start: 0, end: Math.PI / 2 },
    { cx: inset + rectRadius, cy: size - inset - rectRadius, start: Math.PI / 2, end: Math.PI },
    { cx: inset + rectRadius, cy: inset + rectRadius, start: Math.PI, end: Math.PI * 1.5 },
  ];
  for (const corner of corners) {
    for (let step = 0; step <= 6; step += 1) {
      const angle = corner.start + ((corner.end - corner.start) * step) / 6;
      points.push({
        x: corner.cx + Math.cos(angle) * rectRadius,
        y: corner.cy + Math.sin(angle) * rectRadius,
      });
    }
  }
  return [points];
}

function paintDieCut(
  source: ImageData,
  subject: Uint8Array,
  border: number,
  cut: number,
) {
  const { width, height } = source;
  const distance = distanceSquared(subject, width, height);
  const cutLimit = border + cut;
  const shape = new Uint8Array(subject.length);
  const output = new ImageData(width, height);
  const whiteLimit = (border + 1) * (border + 1);
  const shapeLimit = (cutLimit + 0.5) * (cutLimit + 0.5);

  for (let index = 0; index < subject.length; index += 1) {
    const distSq = distance[index];
    if (distSq <= shapeLimit) {
      shape[index] = 1;
    }
    if (distSq > whiteLimit) {
      continue;
    }
    const dist = Math.sqrt(distSq);
    const coverage = Math.min(1, Math.max(0, border + 0.65 - dist));
    const offset = index * 4;
    output.data[offset] = 255;
    output.data[offset + 1] = 255;
    output.data[offset + 2] = 255;
    output.data[offset + 3] = Math.round(coverage * 255);
  }

  for (let index = 0; index < subject.length; index += 1) {
    if (!subject[index]) {
      continue;
    }
    const offset = index * 4;
    output.data[offset] = source.data[offset];
    output.data[offset + 1] = source.data[offset + 1];
    output.data[offset + 2] = source.data[offset + 2];
    output.data[offset + 3] = 255;
  }

  return { output, shape, contour: traceContours(shape, width, height) };
}

function backgroundRemains(
  mask: Uint8Array,
  width: number,
  originX: number,
  originY: number,
  drawWidth: number,
  drawHeight: number,
) {
  const inset = 2;
  const points = [
    [originX + inset, originY + inset],
    [originX + drawWidth - inset - 1, originY + inset],
    [originX + inset, originY + drawHeight - inset - 1],
    [originX + drawWidth - inset - 1, originY + drawHeight - inset - 1],
  ];
  let kept = 0;
  for (const [x, y] of points) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= width) {
      continue;
    }
    if (mask[py * width + px]) {
      kept += 1;
    }
  }
  return kept >= 3;
}

function borderGeometry(workSize: number, slotSize: number, borderPx: number, cutGapPx: number) {
  const raster = workSize / slotSize;
  const border = Math.max(2, borderPx * raster);
  const cut = Math.max(1.25, cutGapPx * raster);
  const margin = border + cut + 2;
  const content = Math.max(8, workSize - margin * 2);
  return { border, cut, margin, content };
}

function spriteFromPaint(
  workSize: number,
  painted: ReturnType<typeof paintDieCut>,
  cut: number,
): DieCutSprite {
  const canvas = document.createElement("canvas");
  canvas.width = workSize;
  canvas.height = workSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare a die-cut sticker.");
  }
  context.putImageData(painted.output, 0, 0);
  return {
    canvas,
    contour: painted.contour.length ? painted.contour : roundedContour(workSize, cut + 1, workSize * 0.18),
    bounds: alphaBounds(painted.output) ?? { x: 0, y: 0, width: workSize, height: workSize },
  };
}

function buildCutout(image: SheetImage, workSize: number, content: number): SubjectCutout {
  const frame = subjectFrame(image);
  if (frame.rounded) {
    return { kind: "rounded" };
  }
  // The 180px probe already found the subject, so the photo is drawn at its final size and masked once.
  const placement = placementFor(image, frame.rel, workSize, content);
  const source = drawPlacement(image, placement, workSize);
  buildStats.cutoutMasks += 1;
  const mask = subjectMask(source.data, workSize, workSize);
  const bounds = maskBounds(mask, workSize, workSize);
  const ratio = bounds ? bounds.count / (workSize * workSize) : 0;
  if (
    !bounds ||
    bounds.width < 1 ||
    bounds.height < 1 ||
    ratio < 0.035 ||
    ratio > 0.94 ||
    backgroundRemains(mask, workSize, placement.originX, placement.originY, placement.drawWidth, placement.drawHeight)
  ) {
    return { kind: "rounded" };
  }
  return {
    kind: "native",
    source,
    mask,
    placement,
    rel: {
      x: (bounds.x - placement.originX) / placement.drawWidth,
      y: (bounds.y - placement.originY) / placement.drawHeight,
      w: bounds.width / placement.drawWidth,
      h: bounds.height / placement.drawHeight,
    },
  };
}

export function cachedByKey<T extends object, V>(
  cache: WeakMap<T, Map<string, V>>,
  image: T,
  key: string,
  create: () => V,
) {
  let bucket = cache.get(image);
  const existing = bucket?.get(key);
  if (existing) {
    return { value: existing, reused: true as const };
  }
  const value = create();
  if (!bucket) {
    bucket = new Map();
    cache.set(image, bucket);
  }
  bucket.set(key, value);
  return { value, reused: false as const };
}

function cutoutFor(image: SheetImage, workSize: number, content: number) {
  const found = cachedByKey(cutoutCache, image, cutoutCacheKey(workSize), () => buildCutout(image, workSize, content));
  if (found.reused) {
    buildStats.cutoutHits += 1;
  }
  return found.value;
}

function paintCutout(
  image: SheetImage,
  cutout: NativeCutout,
  workSize: number,
  content: number,
  border: number,
  cut: number,
) {
  const placement = placementFor(image, cutout.rel, workSize, content);
  const aligned = samePlacement(cutout.placement, placement);
  const source = aligned ? cutout.source : drawPlacement(image, placement, workSize);
  const mask = aligned ? cutout.mask : resampleMask(cutout, placement, workSize);
  buildStats.paints += 1;
  return spriteFromPaint(workSize, paintDieCut(source, mask, border, cut), cut);
}

function buildDieCut(
  image: SheetImage,
  slotSize: number,
  borderPx: number,
  cutGapPx: number,
  workSize: number,
) {
  const { border, cut, margin, content } = borderGeometry(workSize, slotSize, borderPx, cutGapPx);
  const cutout = cutoutFor(image, workSize, content);
  if (cutout.kind === "rounded") {
    return roundedDieCut(image, workSize, margin, border);
  }
  return paintCutout(image, cutout, workSize, content, border, cut);
}

function roundedDieCut(image: SheetImage, size: number, margin: number, border: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare a die-cut sticker.");
  }
  const outer = Math.max(1, size - margin);
  const origin = (size - outer) / 2;
  const radius = outer * 0.16;
  const inner = Math.max(1, outer - border * 2);
  const innerOrigin = origin + border;
  const innerRadius = Math.max(0, radius - border);
  context.beginPath();
  context.roundRect(origin, origin, outer, outer, radius);
  context.fillStyle = "#ffffff";
  context.fill();
  context.save();
  context.beginPath();
  context.roundRect(innerOrigin, innerOrigin, inner, inner, innerRadius);
  context.clip();
  const fit = Math.min(inner / image.width, inner / image.height);
  const drawWidth = image.width * fit;
  const drawHeight = image.height * fit;
  context.drawImage(
    image,
    innerOrigin + (inner - drawWidth) / 2,
    innerOrigin + (inner - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.restore();
  return {
    canvas,
    contour: roundedContour(size, (size - outer) / 2, radius),
    bounds: { x: origin, y: origin, width: outer, height: outer },
  };
}

function whiteBorderPx(paddingRatio: number, slotSize: number) {
  const amount = Math.min(Math.max(paddingRatio, 0), 0.28) / 0.28;
  const millimeters = 1.7 + amount * 4;
  return Math.max(4, Math.min(millimeters * MM, slotSize * 0.11));
}

function dieCutFor(
  image: SheetImage,
  slotSize: number,
  borderPx: number,
  cutGapPx: number,
  workSize: number,
) {
  const found = cachedByKey(dieCutCache, image, spriteCacheKey(workSize, borderPx, cutGapPx), () =>
    buildDieCut(image, slotSize, borderPx, cutGapPx, workSize),
  );
  if (found.reused) {
    buildStats.spriteHits += 1;
  }
  return found.value;
}

function placeDieCut(sprite: DieCutSprite, slot: SheetSlot): StickerPlacement {
  const fit = Math.min(slot.width / sprite.bounds.width, slot.height / sprite.bounds.height);
  const width = sprite.bounds.width * fit;
  const height = sprite.bounds.height * fit;
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
    bounds: sprite.bounds,
  };
}

function slotChrome(layout: ReturnType<typeof layoutStickerSheet>, padding: number) {
  const slot = layout.slots[0];
  const slotLong = Math.max(slot.width, slot.height);
  const slotShort = Math.min(slot.width, slot.height);
  const borderPx = whiteBorderPx(padding, slotShort);
  const cutGapPx = Math.max(2, CUT_GAP_MM * MM);
  const chrome = borderPx + cutGapPx;
  const chromeLimit = slotShort * 0.16;
  const chromeScale = chrome > chromeLimit ? chromeLimit / chrome : 1;
  return {
    slotLong,
    slotShort,
    borderPx: borderPx * chromeScale,
    cutGapPx: cutGapPx * chromeScale,
  };
}

function dieCutAt(
  image: SheetImage,
  chrome: ReturnType<typeof slotChrome>,
  scale: number,
) {
  const workSize = cappedWorkSize({
    slotLong: chrome.slotLong,
    sourceMaxEdge: Math.max(image.width, image.height),
    scale,
  });
  return dieCutFor(image, chrome.slotLong, chrome.borderPx, chrome.cutGapPx, workSize);
}

function drawnAspect(prepared: DieCutSprite[]) {
  return (
    prepared.reduce((sum, sprite) => sum + sprite.bounds.width / Math.max(1, sprite.bounds.height), 0) /
    prepared.length
  );
}

/**
 * Cell shape follows the subjects, not the white border. A new photo can still
 * reflow the grid when its shape is different, but the cut-out cache is per bitmap
 * and work size, so the other stickers are not masked again.
 */
function layoutForSubjects(images: SheetImage[], count: SheetCount, size: SheetSize) {
  const aspect = images.reduce((sum, artwork) => sum + subjectAspect(artwork), 0) / images.length;
  return layoutStickerSheet(count, size, aspect);
}

function buildDieCuts(images: SheetImage[], layout: ReturnType<typeof layoutStickerSheet>, padding: number, scale: number) {
  const chrome = slotChrome(layout, padding);
  const prepared = images.map((artwork) => dieCutAt(artwork, chrome, scale));
  return { prepared, slotShort: chrome.slotShort, layout };
}

async function buildDieCutsAsync(
  images: SheetImage[],
  layout: ReturnType<typeof layoutStickerSheet>,
  padding: number,
  scale: number,
  control?: SheetBuildControl,
) {
  const chrome = slotChrome(layout, padding);
  const prepared: DieCutSprite[] = [];
  for (const artwork of images) {
    throwIfCancelled(control?.signal);
    prepared.push(dieCutAt(artwork, chrome, scale));
    if (control?.afterSticker) {
      await control.afterSticker();
    }
  }
  return { prepared, slotShort: chrome.slotShort, layout };
}

function fitDieCuts(images: SheetImage[], count: SheetCount, size: SheetSize, padding: number, scale: number) {
  let layout = layoutForSubjects(images, count, size);
  let built = buildDieCuts(images, layout, padding, scale);
  const next = clampAspect(drawnAspect(built.prepared));
  const current = layout.slots[0].width / Math.max(1, layout.slots[0].height);
  if (Math.abs(next - current) > 0.02) {
    layout = layoutStickerSheet(count, size, next);
    built = buildDieCuts(images, layout, padding, scale);
  }
  return { layout: built.layout, prepared: built.prepared, slotShort: built.slotShort };
}

async function fitDieCutsAsync(
  images: SheetImage[],
  count: SheetCount,
  size: SheetSize,
  padding: number,
  scale: number,
  control?: SheetBuildControl,
) {
  let layout = layoutForSubjects(images, count, size);
  let built = await buildDieCutsAsync(images, layout, padding, scale, control);
  const next = clampAspect(drawnAspect(built.prepared));
  const current = layout.slots[0].width / Math.max(1, layout.slots[0].height);
  if (Math.abs(next - current) > 0.02) {
    throwIfCancelled(control?.signal);
    layout = layoutStickerSheet(count, size, next);
    built = await buildDieCutsAsync(images, layout, padding, scale, control);
  }
  return { layout: built.layout, prepared: built.prepared, slotShort: built.slotShort };
}

function strokeContours(context: CanvasRenderingContext2D, contours: Point[][], placement: StickerPlacement) {
  const scaleX = placement.width / placement.bounds.width;
  const scaleY = placement.height / placement.bounds.height;
  context.beginPath();
  for (const contour of contours) {
    if (contour.length < 3) {
      continue;
    }
    context.moveTo(
      placement.x + (contour[0].x - placement.bounds.x) * scaleX,
      placement.y + (contour[0].y - placement.bounds.y) * scaleY,
    );
    for (let index = 1; index < contour.length; index += 1) {
      context.lineTo(
        placement.x + (contour[index].x - placement.bounds.x) * scaleX,
        placement.y + (contour[index].y - placement.bounds.y) * scaleY,
      );
    }
    context.closePath();
  }
  context.stroke();
}

type SheetDrawOptions = {
  count: SheetCount;
  size: SheetSize;
  background: SheetBackground;
  padding: number;
  scale?: number;
};

function prepareSheetCanvas(context: CanvasRenderingContext2D, options: SheetDrawOptions) {
  const scale = options.scale ?? 1;
  const page = sheetPixels(options.size);
  const canvas = context.canvas;
  canvas.width = Math.max(1, Math.round(page.width * scale));
  canvas.height = Math.max(1, Math.round(page.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, page.width, page.height);
  const backgroundColor = SHEET_BACKGROUNDS.find((item) => item.id === options.background)?.color;
  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, page.width, page.height);
  }
  return { scale, page };
}

function compositeStickers(
  context: CanvasRenderingContext2D,
  background: SheetBackground,
  built: { layout: ReturnType<typeof layoutStickerSheet>; prepared: DieCutSprite[]; slotShort: number },
) {
  built.layout.slots.forEach((cell, index) => {
    const sprite = built.prepared[index % built.prepared.length];
    const placement = placeDieCut(sprite, cell);
    context.save();
    if (background !== "transparent") {
      context.shadowColor = "rgba(28, 25, 23, 0.13)";
      context.shadowBlur = Math.max(8, built.slotShort * 0.028);
      context.shadowOffsetY = Math.max(3, built.slotShort * 0.01);
    }
    context.drawImage(
      sprite.canvas,
      placement.bounds.x,
      placement.bounds.y,
      placement.bounds.width,
      placement.bounds.height,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
    );
    context.restore();
  });

  context.save();
  context.shadowColor = "transparent";
  context.strokeStyle = "#9c958c";
  context.lineWidth = Math.max(1.5, 0.28 * MM);
  context.setLineDash([1.55 * MM, 1.15 * MM]);
  context.lineCap = "round";
  context.lineJoin = "round";
  built.layout.slots.forEach((cell, index) => {
    const sprite = built.prepared[index % built.prepared.length];
    strokeContours(context, sprite.contour, placeDieCut(sprite, cell));
  });
  context.restore();
}

export function drawStickerSheet(
  context: CanvasRenderingContext2D,
  image: SheetImage | readonly SheetImage[],
  options: SheetDrawOptions,
) {
  const images = sheetImages(image);
  const { scale } = prepareSheetCanvas(context, options);
  if (!images.length) {
    return;
  }
  const built = fitDieCuts(images, options.count, options.size, options.padding, scale);
  compositeStickers(context, options.background, built);
}

export async function drawStickerSheetAsync(
  context: CanvasRenderingContext2D,
  image: SheetImage | readonly SheetImage[],
  options: SheetDrawOptions,
  control?: SheetBuildControl,
) {
  const images = sheetImages(image);
  const { scale } = prepareSheetCanvas(context, options);
  if (!images.length) {
    return;
  }
  const built = await fitDieCutsAsync(images, options.count, options.size, options.padding, scale, control);
  throwIfCancelled(control?.signal);
  compositeStickers(context, options.background, built);
}

/** Build print-resolution cut-outs without touching the preview canvas. Safe to cancel between stickers. */
export async function warmPrintDieCuts(
  image: SheetImage | readonly SheetImage[],
  options: {
    count: SheetCount;
    size: SheetSize;
    padding: number;
  },
  control?: SheetBuildControl,
) {
  const images = sheetImages(image);
  if (!images.length) {
    return;
  }
  await fitDieCutsAsync(images, options.count, options.size, options.padding, 1, control);
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
