import { Delaunay } from "d3-delaunay";
import { sampleScalarField } from "../fields/sample";
import { Polyline, ScalarField } from "../types";

export interface VoronoiConfig {
  pointCount: number;
  relaxations: number;
}

export function generateVoronoiPolylines(
  field: ScalarField,
  config: VoronoiConfig,
): Polyline[] {
  const target = Math.max(20, config.pointCount);
  const relaxations = Math.max(0, Math.floor(config.relaxations));
  const points = samplePoints(field, target);
  if (!points.length) return [];

  const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
  let voronoi = delaunay.voronoi([0, 0, field.width, field.height]);

  for (let i = 0; i < relaxations; i += 1) {
    const relaxed = Array.from({ length: points.length }, (_, index) => {
      const polygon = voronoi.cellPolygon(index);
      if (!polygon) return points[index]!;
      const { x, y } = polygon.reduce(
        (acc, [px, py]) => ({ x: acc.x + px, y: acc.y + py }),
        { x: 0, y: 0 },
      );
      return {
        x: x / polygon.length,
        y: y / polygon.length,
      };
    });
    voronoi = Delaunay.from(relaxed, (p) => p.x, (p) => p.y).voronoi([
      0,
      0,
      field.width,
      field.height,
    ]);
  }

  const polylines: Polyline[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon || polygon.length < 3) continue;
    polylines.push({
      id: `voronoi-${i}`,
      points: polygon.map(([x, y]) => ({ x, y })),
      closed: true,
    });
  }

  return polylines;
}

function samplePoints(field: ScalarField, target: number) {
  const stride = Math.max(
    6,
    Math.floor(Math.sqrt((field.width * field.height) / target)),
  );
  const points: { x: number; y: number }[] = [];
  for (let y = stride / 2; y < field.height; y += stride) {
    for (let x = stride / 2; x < field.width; x += stride) {
      const value = sampleScalarField(field, x, y);
      const probability = 1 - value;
      const noise = pseudoRandom(x, y);
      if (noise < probability) {
        points.push({
          x: clamp(x + (noise - 0.5) * stride * 0.8, 0, field.width),
          y: clamp(y + (probability - 0.5) * stride * 0.8, 0, field.height),
        });
      }
    }
  }
  return points;
}

function pseudoRandom(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

