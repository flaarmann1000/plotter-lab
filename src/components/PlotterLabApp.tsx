"use client";

import { PlotPreview } from "@/components/preview/PlotPreview";
import { PlotControlsPanel } from "@/components/panels/PlotControlsPanel";
import { StatsPanel } from "@/components/panels/StatsPanel";
import { NodeEditorCanvas } from "@/components/editor/NodeEditorCanvas";
import { usePipelineRunner } from "@/hooks/usePipelineRunner";
import { usePlotterStore } from "@/store/plotterStore";

export function PlotterLabApp() {
  usePipelineRunner();
  const status = usePlotterStore((state) => state.status);
  const graph = usePlotterStore((state) => state.graph);
  const error = usePlotterStore((state) => state.error);

  const nodeCount = graph.nodes.length;
  const connectionCount = graph.edges.length;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">Plotter Lab - Node Editor</p>
            <p className="text-sm text-slate-400">
              Right-click to insert nodes. Lane A (data) -&gt; Lane B (geometry) -&gt; Lane C (plot). Status {status}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 px-3 py-1">{nodeCount} nodes</span>
            <span className="rounded-full border border-white/10 px-3 py-1">{connectionCount} connections</span>
          </div>
        </div>
        {error ? (
          <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </header>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 xl:flex-row">
        <main className="flex-1">
          <NodeEditorCanvas />
        </main>
        <aside className="flex w-full flex-col gap-4 xl:w-[420px]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
            <PlotPreview />
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
            <StatsPanel />
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
            <PlotControlsPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
