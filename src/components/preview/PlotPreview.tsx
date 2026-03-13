"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { usePlotterStore } from "@/store/plotterStore";

interface PathShape {
  id: string;
  d: string;
  color: string;
}

export function PlotPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const document = usePlotterStore((state) => state.document);
  const stats = usePlotterStore((state) => state.stats);
  const status = usePlotterStore((state) => state.status);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{
    pointerId: number;
    originX: number;
    originY: number;
    startPan: { x: number; y: number };
  } | null>(null);

  const placement = useMemo(() => {
    if (!document) return null;
    return {
      pageWidth: document.width,
      pageHeight: document.height,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };
  }, [document]);

  const shapes = useMemo<PathShape[]>(() => {
    if (!document || !placement) return [];
    const toPageCoords = (x: number, y: number) => ({
      x: x * placement.scale + placement.offsetX,
      y: y * placement.scale + placement.offsetY,
    });
    const items: PathShape[] = [];
    document.layers.forEach((layer) => {
      layer.polylines.forEach((polyline) => {
        if (polyline.points.length < 2) return;
        const commands = polyline.points
          .map((point, index) => {
            const { x, y } = toPageCoords(point.x, point.y);
            return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ");
        items.push({
          id: `${layer.id}-${polyline.id}`,
          d: commands,
          color: "#060606",
        });
      });
    });
    return items;
  }, [document, placement]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startPan: { ...pan },
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || !containerRef.current) return;
    if (dragState.pointerId !== event.pointerId) return;

    const bounds = containerRef.current.getBoundingClientRect();
    const mmPerPixelX =
      (placement?.pageWidth ?? bounds.width) / Math.max(bounds.width, 1);
    const mmPerPixelY =
      (placement?.pageHeight ?? bounds.height) / Math.max(bounds.height, 1);
    const deltaX = (event.clientX - dragState.originX) * mmPerPixelX;
    const deltaY = (event.clientY - dragState.originY) * mmPerPixelY;
    setPan({
      x: dragState.startPan.x + deltaX / zoom,
      y: dragState.startPan.y + deltaY / zoom,
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    if (dragState.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragState(null);
    }
  };

  const zoomIn = () => setZoom((value) => Math.min(3, value + 0.2));
  const zoomOut = () => setZoom((value) => Math.max(0.5, value - 0.2));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Plot preview</p>
          <p className="text-xs text-slate-400">
            Zoom ({zoom.toFixed(2)}x) - Paths {stats?.pathCount ?? 0}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
          >
            Reset
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={clsx(
          "relative h-[70vh] w-full flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white",
          dragState && "cursor-grabbing",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {document && placement ? (
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${placement.pageWidth} ${placement.pageHeight}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              x={0}
              y={0}
              width={placement.pageWidth}
              height={placement.pageHeight}
              fill="#ffffff"
              stroke="#d4d4d8"
              strokeWidth={0.6}
            />
            <g
              transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
              strokeWidth={0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              {shapes.map((shape) => (
                <path
                  key={shape.id}
                  d={shape.d}
                  stroke={shape.color}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            {status === "loading"
              ? "Loading source..."
              : "Import an input or generate noise to begin."}
          </div>
        )}
        {status === "computing" ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-end bg-gradient-to-b from-slate-950/40 via-transparent to-transparent p-4 text-xs text-slate-300">
            Updating pipeline...
          </div>
        ) : null}
      </div>
    </div>
  );
}
