"use client";

import { useEffect } from "react";
import { PlotPreview } from "@/components/preview/PlotPreview";
import { SourcePanel } from "@/components/panels/SourcePanel";
import { TransformPanel } from "@/components/panels/TransformPanel";
import { PlotControlsPanel } from "@/components/panels/PlotControlsPanel";
import { StatsPanel } from "@/components/panels/StatsPanel";
import { usePipelineRunner } from "@/hooks/usePipelineRunner";
import { usePlotterStore } from "@/store/plotterStore";

export function PlotterLabApp() {
  usePipelineRunner();
  const status = usePlotterStore((state) => state.status);
  const sourceKind = usePlotterStore((state) => state.sourceKind);
  const hasNoiseField = usePlotterStore((state) => Boolean(state.noise.field));
  const regenerateNoiseField = usePlotterStore(
    (state) => state.regenerateNoiseField,
  );

  useEffect(() => {
    if (!hasNoiseField) {
      regenerateNoiseField();
    }
  }, [hasNoiseField, regenerateNoiseField]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">Plotter Lab</p>
            <p className="text-sm text-slate-400">
              Plotter-first pipeline - Source {sourceKind} - Status {status}
            </p>
          </div>
          <div className="flex gap-2 text-xs text-slate-400">
            <span>Input - Transform - Optimize - Export</span>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 xl:flex-row">
        <aside className="flex w-full flex-col gap-4 xl:w-80">
          <SourcePanel />
          <TransformPanel />
        </aside>
        <main className="flex-1">
          <PlotPreview />
        </main>
        <aside className="flex w-full flex-col gap-4 xl:w-80">
          <StatsPanel />
          <PlotControlsPanel />
        </aside>
      </div>
    </div>
  );
}
