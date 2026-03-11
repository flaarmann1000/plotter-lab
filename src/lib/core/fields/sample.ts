import { ScalarField } from "../types";

export function sampleScalarField(
  field: ScalarField,
  x: number,
  y: number,
): number {
  const clampedX = Math.max(0, Math.min(field.width - 1, x));
  const clampedY = Math.max(0, Math.min(field.height - 1, y));
  const x0 = Math.floor(clampedX);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y0 = Math.floor(clampedY);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const dx = clampedX - x0;
  const dy = clampedY - y0;
  const index = (xx: number, yy: number) => yy * field.width + xx;

  const topLeft = field.data[index(x0, y0)] ?? 0;
  const topRight = field.data[index(x1, y0)] ?? topLeft;
  const bottomLeft = field.data[index(x0, y1)] ?? topLeft;
  const bottomRight = field.data[index(x1, y1)] ?? topRight;

  const top = topLeft * (1 - dx) + topRight * dx;
  const bottom = bottomLeft * (1 - dx) + bottomRight * dx;
  return top * (1 - dy) + bottom * dy;
}

