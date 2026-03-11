import { PlotDocument, PlotTransform } from "../types";
import { PageConfig, resolvePageSize } from "./pagePresets";

export interface PlacementOptions {
  marginMm: number;
  scale: number;
}

export function getPlotPlacement(
  document: PlotDocument,
  page: PageConfig,
  options: PlacementOptions,
): PlotTransform & { pageWidth: number; pageHeight: number } {
  const { width: pageWidth, height: pageHeight } = resolvePageSize(page);
  const availableWidth = Math.max(pageWidth - options.marginMm * 2, 1);
  const availableHeight = Math.max(pageHeight - options.marginMm * 2, 1);
  const baseScale = Math.min(
    availableWidth / document.width,
    availableHeight / document.height,
  );
  const scale = baseScale * options.scale;
  const offsetX = (pageWidth - document.width * scale) / 2;
  const offsetY = (pageHeight - document.height * scale) / 2;

  return { scale, offsetX, offsetY, pageWidth, pageHeight };
}

