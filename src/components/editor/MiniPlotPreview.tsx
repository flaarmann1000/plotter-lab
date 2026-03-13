"use client";

import { useMemo } from "react";
import { PlotDocument } from "@/lib/core/types";

interface MiniPlotPreviewProps {
  document?: PlotDocument;
  className?: string;
}

export function MiniPlotPreview({ document, className }: MiniPlotPreviewProps) {
  const paths = useMemo(() => {
    if (!document) return [] as { id: string; d: string }[];
    const items: { id: string; d: string }[] = [];
    document.layers.forEach((layer) => {
      layer.polylines.forEach((polyline) => {
        if (polyline.points.length < 2) return;
        const commands = polyline.points
          .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
          .join(" ");
        items.push({ id: `${layer.id}-${polyline.id}`, d: commands });
      });
    });
    return items;
  }, [document]);

  if (!document) {
    return (
      <div
        className={`flex h-28 w-full items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-[11px] text-slate-500 ${className ?? ""}`}
      >
        Awaiting PlotDocument output
      </div>
    );
  }

  return (
    <div className={`w-full rounded-xl border border-white/10 bg-slate-950/60 p-2 ${className ?? ""}`}>
      <svg
        className="h-28 w-full"
        viewBox={`0 0 ${document.width} ${document.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x={0}
          y={0}
          width={document.width}
          height={document.height}
          rx={4}
          ry={4}
          fill="#0f172a"
          stroke="#1f2937"
          strokeWidth={1}
        />
        <g stroke="#f8fafc" strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          {paths.map((path) => (
            <path key={path.id} d={path.d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
    </div>
  );
}
