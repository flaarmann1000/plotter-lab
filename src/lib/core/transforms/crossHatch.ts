import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface CrossHatchConfig {
  spacing: number;
  threshold: number;
  amplitude: number;
  sampleStep: number;
  families: number;
  angleDelta: number;
}

export function generateCrossHatch(
  field: ScalarField,
  config: CrossHatchConfig,
): Polyline[] {
  const { spacing, threshold, amplitude, sampleStep, families, angleDelta } =
    config;
  const centerX = field.width / 2;
  const centerY = field.height / 2;
  const diag = Math.hypot(field.width, field.height);
  const polylines: Polyline[] = [];
  const familyCount = Math.max(1, families);

  for (let family = 0; family < familyCount; family += 1) {
    const angle =
      ((-familyCount / 2 + family) * angleDelta * Math.PI) / 180 +
      (family % 2 === 0 ? 0 : (Math.PI / 180) * (angleDelta / 2));
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const orthX = -dirY;
    const orthY = dirX;
    let offsetIndex = 0;

    for (let offset = -diag; offset <= diag; offset += Math.max(2, spacing)) {
      const points: { x: number; y: number }[] = [];
      for (let t = -diag; t <= diag; t += Math.max(1, sampleStep)) {
        const x = centerX + dirX * t + orthX * offset;
        const y = centerY + dirY * t + orthY * offset;
        if (!isInside(field, x, y)) {
          if (points.length > 1) {
            polylines.push({
              id: `cross-${family}-${offsetIndex}-${polylines.length}`,
              points: [...points],
            });
          }
          points.length = 0;
          continue;
        }
        const value = sampleScalarField(field, x, y);
        if (value > threshold) {
          if (points.length > 1) {
            polylines.push({
              id: `cross-${family}-${offsetIndex}-${polylines.length}`,
              points: [...points],
            });
          }
          points.length = 0;
          continue;
        }
        const jitter = (1 - value) * amplitude;
        points.push({
          x,
          y: y + jitter * Math.sin(angle * 3.1 + value * Math.PI),
        });
      }
      if (points.length > 1) {
        polylines.push({
          id: `cross-${family}-${offsetIndex}-${polylines.length}`,
          points: [...points],
        });
      }
      offsetIndex += 1;
    }
  }

  return polylines;
}

function isInside(field: ScalarField, x: number, y: number) {
  return x >= 0 && x < field.width && y >= 0 && y < field.height;
}

