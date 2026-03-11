import { Point, Polyline } from "./types";

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function polylineLength(polyline: Polyline): number {
  if (polyline.points.length < 2) {
    return 0;
  }

  let length = 0;
  for (let i = 1; i < polyline.points.length; i += 1) {
    length += distance(polyline.points[i - 1], polyline.points[i]);
  }

  return length;
}

export function totalPolylineCount(layers: Polyline[][]): number {
  return layers.reduce((sum, current) => sum + current.length, 0);
}

export function getPolylineSegmentCount(polyline: Polyline): number {
  return Math.max(polyline.points.length - 1, 0);
}

export function combinePolylineSegmentCount(polylines: Polyline[]): number {
  return polylines.reduce((sum, line) => sum + getPolylineSegmentCount(line), 0);
}

export function clonePolyline(polyline: Polyline): Polyline {
  return {
    ...polyline,
    points: polyline.points.map((p) => ({ ...p })),
  };
}

export function translatePolyline(
  polyline: Polyline,
  dx: number,
  dy: number,
): Polyline {
  return {
    ...polyline,
    points: polyline.points.map((pt) => ({
      x: pt.x + dx,
      y: pt.y + dy,
    })),
  };
}

export function scalePolyline(
  polyline: Polyline,
  scale: number,
  origin: Point = { x: 0, y: 0 },
): Polyline {
  return {
    ...polyline,
    points: polyline.points.map((pt) => ({
      x: (pt.x - origin.x) * scale + origin.x,
      y: (pt.y - origin.y) * scale + origin.y,
    })),
  };
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computePolylineBounds(polyline: Polyline): BoundingBox | null {
  if (!polyline.points.length) {
    return null;
  }

  let minX = polyline.points[0]!.x;
  let minY = polyline.points[0]!.y;
  let maxX = minX;
  let maxY = minY;

  for (const point of polyline.points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

export function combineBounds(bounds: BoundingBox[]): BoundingBox | null {
  if (!bounds.length) return null;
  let minX = bounds[0]!.minX;
  let minY = bounds[0]!.minY;
  let maxX = bounds[0]!.maxX;
  let maxY = bounds[0]!.maxY;

  for (const box of bounds) {
    if (box.minX < minX) minX = box.minX;
    if (box.minY < minY) minY = box.minY;
    if (box.maxX > maxX) maxX = box.maxX;
    if (box.maxY > maxY) maxY = box.maxY;
  }

  return { minX, minY, maxX, maxY };
}

