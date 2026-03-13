import { ImagePixels, ScalarField } from "../core/types";

export interface ImageFieldMetadata {
  width: number;
  height: number;
  histogram: number[];
}

export interface ImageFieldResult {
  grayscale: ScalarField;
  gradient: ScalarField;
  metadata: ImageFieldMetadata;
  pixels: ImagePixels;
}

interface ImageFieldOptions {
  maxDimension?: number;
}

export async function imageFileToFields(
  file: File,
  options: ImageFieldOptions = {},
): Promise<ImageFieldResult> {
  const maxDimension = options.maxDimension ?? 1100;
  const bitmap = await loadImageBitmap(file);
  const scale =
    Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height)) || 1;

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is not available in this browser.");
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const grayscale = new Float32Array(width * height);
  const histogram = new Array(32).fill(0) as number[];

  for (let i = 0; i < grayscale.length; i += 1) {
    const r = imageData.data[i * 4]!;
    const g = imageData.data[i * 4 + 1]!;
    const b = imageData.data[i * 4 + 2]!;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    grayscale[i] = luma;
    const bucket = Math.min(31, Math.max(0, Math.floor(luma * 32)));
    histogram[bucket] += 1;
  }

  const gradient = computeSobelGradient(grayscale, width, height);

  const pixels: ImagePixels = {
    width,
    height,
    channels: 4,
    data: new Uint8ClampedArray(imageData.data),
  };

  return {
    grayscale: { width, height, data: grayscale },
    gradient: { width, height, data: gradient },
    metadata: {
      width: bitmap.width,
      height: bitmap.height,
      histogram,
    },
    pixels,
  };
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const element = await loadImageElement(imageUrl);
    return await createImageBitmapFromElement(element);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(event);
    img.src = url;
  });
}

async function createImageBitmapFromElement(
  element: CanvasImageSource,
): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(element);
  }

  throw new Error("createImageBitmap is not available in this environment.");
}

function computeSobelGradient(
  grayscale: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const gradient = new Float32Array(grayscale.length);
  let maxMagnitude = 0;

  const index = (x: number, y: number) => y * width + x;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx =
        grayscale[index(x + 1, y - 1)]! +
        2 * grayscale[index(x + 1, y)]! +
        grayscale[index(x + 1, y + 1)]! -
        (grayscale[index(x - 1, y - 1)]! +
          2 * grayscale[index(x - 1, y)]! +
          grayscale[index(x - 1, y + 1)]!);

      const gy =
        grayscale[index(x - 1, y + 1)]! +
        2 * grayscale[index(x, y + 1)]! +
        grayscale[index(x + 1, y + 1)]! -
        (grayscale[index(x - 1, y - 1)]! +
          2 * grayscale[index(x, y - 1)]! +
          grayscale[index(x + 1, y - 1)]!);

      const magnitude = Math.hypot(gx, gy);
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
      }
      gradient[index(x, y)] = magnitude;
    }
  }

  if (maxMagnitude > 0) {
    for (let i = 0; i < gradient.length; i += 1) {
      gradient[i] = Math.min(1, gradient[i]! / maxMagnitude);
    }
  }

  return gradient;
}
