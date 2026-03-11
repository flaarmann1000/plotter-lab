import { PlotDocument } from "../types";
import { PageConfig, resolvePageSize } from "./pagePresets";

export interface SvgExportOptions {
  document: PlotDocument;
  page: PageConfig;
  marginMm: number;
  scale: number;
  strokeWidth: number;
  strokeColor?: string;
  background?: string;
}

export function serializePlotDocumentToSvg({
  document,
  page,
  marginMm,
  scale,
  strokeWidth,
  strokeColor = "#0f172a",
  background = "none",
}: SvgExportOptions): string {
  const { width: pageWidth, height: pageHeight } = resolvePageSize(page);
  const availableWidth = Math.max(pageWidth - marginMm * 2, 1);
  const availableHeight = Math.max(pageHeight - marginMm * 2, 1);
  const baseScale = Math.min(
    availableWidth / document.width,
    availableHeight / document.height,
  );
  const effectiveScale = baseScale * scale;
  const offsetX = (pageWidth - document.width * effectiveScale) / 2;
  const offsetY = (pageHeight - document.height * effectiveScale) / 2;

  const layerPaths = document.layers
    .map((layer) => {
      const pathElements = layer.polylines
        .map((polyline) => {
          if (polyline.points.length < 2) return null;
          const commands = polyline.points
            .map((point, index) => {
              const x = (point.x * effectiveScale + offsetX).toFixed(3);
              const y = (point.y * effectiveScale + offsetY).toFixed(3);
              return `${index === 0 ? "M" : "L"}${x} ${y}`;
            })
            .join(" ");
          return `<path d="${commands}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" data-layer="${layer.name}" />`;
        })
        .filter(Boolean)
        .join("");
      return `<g id="${layer.id}" data-layer-name="${layer.name}" stroke="${layer.color}">${pathElements}</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}mm" height="${pageHeight}mm" viewBox="0 0 ${pageWidth} ${pageHeight}" shape-rendering="geometricPrecision">
    <rect width="100%" height="100%" fill="${background}" />
    ${layerPaths}
  </svg>`;
}

