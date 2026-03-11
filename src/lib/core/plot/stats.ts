import { PlotDocument, PlotStats } from "../types";
import { distance, polylineLength } from "../geometry";

export function computePlotStats(document: PlotDocument): PlotStats {
  let pathCount = 0;
  let segmentCount = 0;
  let penDownLength = 0;
  let penUpLength = 0;

  document.layers.forEach((layer) => {
    const polylines = layer.polylines;
    pathCount += polylines.length;
    polylines.forEach((polyline, index) => {
      const length = polylineLength(polyline);
      penDownLength += length;
      segmentCount += Math.max(polyline.points.length - 1, 0);

      if (index < polylines.length - 1) {
        const currentEnd = polyline.points[polyline.points.length - 1];
        const nextStart = polylines[index + 1]!.points[0];
        if (currentEnd && nextStart) {
          penUpLength += distance(currentEnd, nextStart);
        }
      }
    });
  });

  return {
    pathCount,
    segmentCount,
    penDownLength,
    penUpLength,
    totalTravel: penDownLength + penUpLength,
  };
}

