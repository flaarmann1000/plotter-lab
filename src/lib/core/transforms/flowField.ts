import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface FlowFieldConfig {
  spacing: number;
  flowLength: number;
  step: number;
  threshold: number;
}

export function generateFlowLines(
  field: ScalarField,
  config: FlowFieldConfig,
): Polyline[] {
  const spacing = Math.max(4, config.spacing);
  const step = Math.max(1, config.step);
  const length = Math.max(step * 2, config.flowLength);
  const threshold = Math.min(Math.max(config.threshold, 0), 1);
  const polylines: Polyline[] = [];
  let index = 0;

  for (let y = spacing / 2; y < field.height; y += spacing) {
    for (let x = spacing / 2; x < field.width; x += spacing) {
      const brightness = sampleScalarField(field, x, y);
      if (brightness > threshold) continue;
      const vector = gradientVector(field, x, y);
      const magnitude = Math.hypot(vector.x, vector.y);
      if (magnitude < 0.01) continue;
      const dirX = vector.x / magnitude;
      const dirY = vector.y / magnitude;
      const points = buildFlowLine(
        field,
        x,
        y,
        dirX,
        dirY,
        step,
        length,
        brightness,
      );
      if (points.length > 1) {
        polylines.push({
          id: `flow-${index}`,
          points,
        });
        index += 1;
      }
    }
  }

  return polylines;
}

function buildFlowLine(
  field: ScalarField,
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  step: number,
  length: number,
  bias: number,
) {
  const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
  let distance = 0;
  while (distance < length) {
    const previous = points[points.length - 1]!;
    const jitter = (0.5 - bias) * 0.8;
    const nextX = previous.x + (dirX + jitter * 0.1) * step;
    const nextY = previous.y + (dirY + jitter * 0.1) * step;
    if (
      nextX < 0 ||
      nextX >= field.width ||
      nextY < 0 ||
      nextY >= field.height
    ) {
      break;
    }
    points.push({ x: nextX, y: nextY });
    distance += step;
  }
  return points;
}

function gradientVector(field: ScalarField, x: number, y: number) {
  const dx =
    sampleScalarField(field, x + 1, y) - sampleScalarField(field, x - 1, y);
  const dy =
    sampleScalarField(field, x, y + 1) - sampleScalarField(field, x, y - 1);
  return { x: -dx, y: -dy };
}

