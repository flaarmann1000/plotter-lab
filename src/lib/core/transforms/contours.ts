import { contours as d3Contours } from "d3-contour";
import type { ContourMultiPolygon } from "d3-contour";
import { Polyline, ScalarField } from "../types";

export interface ContourTaskInput {
  field: ScalarField;
  thresholds: number[];
  smoothing?: number;
}

export function generateContourPolylines({
  field,
  thresholds,
  smoothing = 0,
}: ContourTaskInput): Polyline[] {
  if (!thresholds.length) return [];
  const contourGenerator = d3Contours()
    .size([field.width, field.height])
    .smooth(smoothing > 0.5);
  const scalarValues = Array.from(field.data);

  const lines: Polyline[] = [];

  thresholds.forEach((threshold, tIndex) => {
    const contour = contourGenerator.contour(
      scalarValues,
      threshold,
    ) as ContourMultiPolygon;
    contour.coordinates.forEach((multi, multiIndex) => {
      multi.forEach((ring, ringIndex) => {
        const points = ring.map(([x, y]) => ({ x, y }));
        if (points.length > 1) {
          lines.push({
            id: `contour-${tIndex}-${multiIndex}-${ringIndex}-${points.length}`,
            points,
            closed: true,
            metadata: { threshold },
          });
        }
      });
    });
  });

  return lines;
}
