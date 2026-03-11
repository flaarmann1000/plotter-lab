import { Polyline, PlotDocument, PlotLayer } from "../types";
import { distance, polylineLength } from "../geometry";

export type PathOrderStrategy = "input" | "nearest";

export interface OptimizationSettings {
  simplifyTolerance: number;
  minPathLength: number;
  joinTolerance: number;
  orderStrategy: PathOrderStrategy;
}

export function optimizeDocument(
  document: PlotDocument,
  settings: OptimizationSettings,
): PlotDocument {
  const layers = document.layers.map((layer) =>
    optimizeLayer(layer, settings),
  );
  return { ...document, layers };
}

function optimizeLayer(
  layer: PlotLayer,
  settings: OptimizationSettings,
): PlotLayer {
  const simplified = layer.polylines
    .map((polyline) => simplifyPolyline(polyline, settings.simplifyTolerance))
    .filter(
      (polyline) => polylineLength(polyline) >= settings.minPathLength,
    );

  const ordered =
    settings.orderStrategy === "nearest"
      ? orderByNearestNeighbor(simplified, settings.joinTolerance)
      : simplified;

  return {
    ...layer,
    polylines: ordered,
  };
}

export function simplifyPolyline(
  polyline: Polyline,
  tolerance: number,
): Polyline {
  if (polyline.points.length <= 2 || tolerance <= 0) {
    return polyline;
  }

  const isClosed = Boolean(polyline.closed);
  const workingPoints = isClosed
    ? polyline.points.slice(0, -1)
    : polyline.points;

  if (workingPoints.length <= 2) {
    return polyline;
  }

  const simplified = rdpSimplify(workingPoints, tolerance);
  const resultPoints = isClosed
    ? [...simplified, simplified[0]!]
    : simplified;

  return { ...polyline, points: resultPoints };
}

function rdpSimplify(
  points: Polyline["points"],
  epsilon: number,
): Polyline["points"] {
  if (points.length <= 2) {
    return points;
  }

  const { index, distance: maxDistance } = findFurthestPoint(points);
  if (maxDistance > epsilon) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0]!, points[points.length - 1]!];
}

function findFurthestPoint(points: Polyline["points"]) {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  let maxDistance = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distanceToSegment = perpendicularDistance(points[i]!, start, end);
    if (distanceToSegment > maxDistance) {
      maxDistance = distanceToSegment;
      index = i;
    }
  }

  return { index, distance: maxDistance };
}

function perpendicularDistance(point: { x: number; y: number }, start: {
  x: number;
  y: number;
}, end: { x: number; y: number }) {
  const numerator = Math.abs(
    (end.y - start.y) * point.x -
      (end.x - start.x) * point.y +
      end.x * start.y -
      end.y * start.x,
  );
  const denominator = Math.hypot(end.x - start.x, end.y - start.y);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function orderByNearestNeighbor(
  polylines: Polyline[],
  joinTolerance: number,
): Polyline[] {
  if (polylines.length <= 1) return polylines;

  const remaining = [...polylines];
  const ordered: Polyline[] = [];

  let current = remaining.shift()!;
  ordered.push(current);

  while (remaining.length) {
    const currentEnd = current.points[current.points.length - 1]!;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let reverseCandidate = false;

    remaining.forEach((candidate, index) => {
      const startDistance = distance(currentEnd, candidate.points[0]!);
      if (startDistance < bestDistance) {
        bestDistance = startDistance;
        bestIndex = index;
        reverseCandidate = false;
      }

      const endDistance = distance(
        currentEnd,
        candidate.points[candidate.points.length - 1]!,
      );
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        bestIndex = index;
        reverseCandidate = true;
      }
    });

    let next = remaining.splice(bestIndex, 1)[0]!;
    if (reverseCandidate) {
      next = reversePolyline(next);
    }

    if (bestDistance <= joinTolerance) {
      current = joinPolylines(current, next);
      ordered[ordered.length - 1] = current;
    } else {
      current = next;
      ordered.push(current);
    }
  }

  return ordered;
}

function reversePolyline(polyline: Polyline): Polyline {
  return {
    ...polyline,
    points: [...polyline.points].reverse(),
  };
}

function joinPolylines(a: Polyline, b: Polyline): Polyline {
  return {
    ...a,
    id: `${a.id}-${b.id}`,
    points: a.points.concat(b.points.slice(1)),
  };
}
