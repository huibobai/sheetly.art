const MAX_EDGE = 2000;
const QUALITY = 0.8;

export type CompressedImage = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const scale = Math.min(1, MAX_EDGE / bitmap.width, MAX_EDGE / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not process this image.");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const webp = await canvasToBlob(canvas, "image/webp", QUALITY);
    if (webp && webp.type === "image/webp") {
      return { blob: webp, contentType: "image/webp", extension: "webp" };
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    if (!jpeg) {
      throw new Error("Could not process this image.");
    }

    return { blob: jpeg, contentType: "image/jpeg", extension: "jpg" };
  } finally {
    bitmap.close();
  }
}
