import { distance } from "../geometry";
import { Polyline } from "../types";
import {
  joinPolylines,
  orderByNearestNeighbor,
  reversePolyline,
} from "./optimize";

export function removeTinyFragments(
  polylines: Polyline[],
  minLength: number,
  measure: (line: Polyline) => number,
): Polyline[] {
  return polylines.filter((line) => measure(line) >= minLength);
}

export function sortPaths(
  polylines: Polyline[],
  joinTolerance: number,
): Polyline[] {
  return orderByNearestNeighbor(polylines, joinTolerance);
}

export function orientPaths(polylines: Polyline[]): Polyline[] {
  if (polylines.length <= 1) return polylines;
  const oriented: Polyline[] = [];
  let previous = polylines[0]!;
  oriented.push(previous);

  for (let i = 1; i < polylines.length; i += 1) {
    let current = polylines[i]!;
    const prevEnd = previous.points[previous.points.length - 1]!;
    const startDist = distance(prevEnd, current.points[0]!);
    const endDist = distance(prevEnd, current.points[current.points.length - 1]!);
    if (endDist < startDist) {
      current = reversePolyline(current);
    }
    oriented.push(current);
    previous = current;
  }

  return oriented;
}

export function joinNearbyEndpoints(
  polylines: Polyline[],
  tolerance: number,
): Polyline[] {
  if (polylines.length <= 1) return polylines;
  const result: Polyline[] = [];
  let current = polylines[0]!;

  for (let i = 1; i < polylines.length; i += 1) {
    const next = polylines[i]!;
    const currentEnd = current.points[current.points.length - 1]!;
    const nextStart = next.points[0]!;
    if (distance(currentEnd, nextStart) <= tolerance) {
      current = joinPolylines(current, next);
    } else {
      result.push(current);
      current = next;
    }
  }

  result.push(current);
  return result;
}
