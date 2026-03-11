import { ScalarField } from "../types";

export function blurScalarField(
  field: ScalarField,
  radius: number,
): ScalarField {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return field;

  const width = field.width;
  const height = field.height;
  const horiz = new Float32Array(width * height);
  const result = new Float32Array(width * height);
  const kernelSize = r * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -r; x <= r; x += 1) {
      sum += sample(field.data, width, height, x, y);
    }
    for (let x = 0; x < width; x += 1) {
      horiz[y * width + x] = sum / kernelSize;
      const minus = x - r;
      const plus = x + r + 1;
      sum += sample(field.data, width, height, plus, y);
      sum -= sample(field.data, width, height, minus, y);
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) {
      sum += sample(horiz, width, height, x, y);
    }
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = sum / kernelSize;
      const minus = y - r;
      const plus = y + r + 1;
      sum += sample(horiz, width, height, x, plus);
      sum -= sample(horiz, width, height, x, minus);
    }
  }

  return { width, height, data: result };
}

function sample(
  data: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  return data[clampedY * width + clampedX] ?? 0;
}

