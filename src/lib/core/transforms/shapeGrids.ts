import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface DotGridConfig {
  spacing: number;
  radius: number;
  sides?: number;
}

export interface CircleGridConfig {
  spacing: number;
  radius: number;
  sides: number;
}

export interface LineClusterConfig {
  spacing: number;
  length: number;
  count: number;
  angleJog: number;
}

export interface TriangleGridConfig {
  spacing: number;
  size: number;
}

export function generateDotGrid(
  field: ScalarField,
  config: DotGridConfig,
): Polyline[] {
  return iterateGrid(field, config.spacing, (x, y, strength) => {
    const radius = config.radius * strength;
    if (radius < 0.5) return null;
    return circlePolyline(x, y, radius, config.sides ?? 12, `dot-${x}-${y}`);
  });
}

export function generateCircleGrid(
  field: ScalarField,
  config: CircleGridConfig,
): Polyline[] {
  return iterateGrid(field, config.spacing, (x, y, strength) => {
    const radius = Math.max(0.8, config.radius * strength);
    return circlePolyline(x, y, radius, config.sides, `circle-${x}-${y}`);
  });
}

export function generateLineClusters(
  field: ScalarField,
  config: LineClusterConfig,
): Polyline[] {
  return iterateGrid(field, config.spacing, (x, y, strength) => {
    if (strength <= 0.05) return null;
    const polylines: Polyline[] = [];
    const baseAngle = (strength - 0.5) * config.angleJog * (Math.PI / 180);
    const spacing = (config.length * 0.4) / Math.max(1, config.count - 1);
    for (let i = 0; i < config.count; i += 1) {
      const offset = (i - (config.count - 1) / 2) * spacing;
      const angle = baseAngle + (offset / config.length) * 0.2;
      const half = (config.length * strength) / 2;
      const dx = Math.cos(angle) * half;
      const dy = Math.sin(angle) * half;
      const line: Polyline = {
        id: `line-${x}-${y}-${i}`,
        points: [
          { x: x - dx, y: y - dy - offset * 0.2 },
          { x: x + dx, y: y + dy - offset * 0.2 },
        ],
      };
      polylines.push(line);
    }
    return polylines;
  });
}

export function generateTriangleGrid(
  field: ScalarField,
  config: TriangleGridConfig,
): Polyline[] {
  return iterateGrid(field, config.spacing, (x, y, strength) => {
    const size = config.size * strength;
    if (size < 2) return null;
    const height = (Math.sqrt(3) / 2) * size;
    const points = [
      { x, y: y - (2 / 3) * height },
      { x: x - size / 2, y: y + height / 3 },
      { x: x + size / 2, y: y + height / 3 },
      { x, y: y - (2 / 3) * height },
    ];
    return [
      {
        id: `tri-${x}-${y}`,
        points,
        closed: true,
      },
    ];
  });
}

function iterateGrid(
  field: ScalarField,
  spacing: number,
  fn: (x: number, y: number, strength: number) => Polyline | Polyline[] | null,
): Polyline[] {
  const polylines: Polyline[] = [];
  const step = Math.max(4, spacing);
  for (let y = step / 2; y < field.height; y += step) {
    for (let x = step / 2; x < field.width; x += step) {
      const brightness = sampleScalarField(field, x, y);
      const strength = 1 - brightness;
      const result = fn(x, y, strength);
      if (!result) continue;
      if (Array.isArray(result)) {
        polylines.push(...result);
      } else {
        polylines.push(result);
      }
    }
  }
  return polylines;
}

function circlePolyline(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  id: string,
): Polyline {
  const points = [];
  const segments = Math.max(6, Math.floor(sides));
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return { id, points, closed: true };
}
