import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface HalftoneSpiralConfig {
  turns: number;
  density: number;
}

export function generateHalftoneSpiral(
  field: ScalarField,
  config: HalftoneSpiralConfig,
): Polyline[] {
  const turns = Math.max(1, config.turns);
  const density = Math.min(Math.max(config.density, 0.1), 1.5);
  const steps = Math.max(800, Math.round(turns * 1200));
  const centerX = field.width / 2;
  const centerY = field.height / 2;
  const maxRadius = Math.min(field.width, field.height) / 2;
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI * 2 * turns;
    const baseRadius = maxRadius * t;
    const sampleX = centerX + Math.cos(angle) * baseRadius;
    const sampleY = centerY + Math.sin(angle) * baseRadius;
    const brightness = sampleScalarField(field, sampleX, sampleY);
    const radius =
      baseRadius * (0.6 + (1 - brightness) * density * 0.5) + 0.5;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    points.push({ x, y });
  }

  return [
    {
      id: "halftone-spiral",
      points,
    },
  ];
}

