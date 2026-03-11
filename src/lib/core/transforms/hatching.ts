import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface HatchConfig {
  spacing: number;
  threshold: number;
  amplitude: number;
  sampleStep: number;
}

export function generateHatchLines(
  field: ScalarField,
  config: HatchConfig,
): Polyline[] {
  const lines: Polyline[] = [];
  const spacing = Math.max(2, config.spacing);
  const amplitude = Math.max(0, config.amplitude);
  const threshold = Math.min(Math.max(config.threshold, 0), 1);
  const sampleStep = Math.max(1, config.sampleStep);
  let hatchIndex = 0;

  for (let y = 0; y < field.height; y += spacing) {
    let currentPoints: { x: number; y: number }[] = [];

    for (let x = 0; x < field.width; x += sampleStep) {
      const sample = sampleScalarField(field, x, y);
      if (sample > threshold) {
        if (currentPoints.length > 1) {
          lines.push({
            id: `hatch-${hatchIndex}-${lines.length}`,
            points: currentPoints,
          });
        }
        currentPoints = [];
        continue;
      }

      const offset = (1 - sample) * amplitude;
      const yOffset = clamp(y + offset, 0, field.height);
      currentPoints.push({ x, y: yOffset });
    }

    if (currentPoints.length > 1) {
      lines.push({
        id: `hatch-${hatchIndex}-${lines.length}`,
        points: currentPoints,
      });
    }

    hatchIndex += 1;
  }

  return lines;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

