"use client";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Section } from "@/components/ui/Section";
import { usePlotterStore } from "@/store/plotterStore";
import { PAGE_PRESETS, PagePresetId } from "@/lib/core/export/pagePresets";
import { serializePlotDocumentToSvg } from "@/lib/core/export/svg";

export function PlotControlsPanel() {
  const plotDocument = usePlotterStore((state) => state.document);
  const plotConfig = usePlotterStore((state) => state.plotConfig);
  const updatePlotConfig = usePlotterStore((state) => state.updatePlotConfig);
  const setPageConfig = usePlotterStore((state) => state.setPageConfig);
  const stats = usePlotterStore((state) => state.stats);
  const error = usePlotterStore((state) => state.error);

  const handleExport = () => {
    if (!plotDocument || typeof window === "undefined") return;
    const svg = serializePlotDocumentToSvg({
      document: plotDocument,
      page: plotConfig.page,
      marginMm: plotConfig.marginMm,
      scale: plotConfig.scale,
      strokeWidth: plotConfig.strokeWidth,
      strokeColor: "#0f172a",
      background: "none",
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "plotter-lab.svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Plot optimization"
        description="Cleanup and ordering before export."
      >
        <Field
          label="Simplification tolerance"
          description={`${plotConfig.simplifyTolerance.toFixed(2)} px`}
          htmlFor="simplify"
        >
          <input
            id="simplify"
            type="range"
            min={0}
            max={4}
            step={0.1}
            value={plotConfig.simplifyTolerance}
            onChange={(event) =>
              updatePlotConfig({
                simplifyTolerance: Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          label="Minimum path length"
          description={`${plotConfig.minPathLength.toFixed(0)} px`}
          htmlFor="min-length"
        >
          <input
            id="min-length"
            type="range"
            min={0}
            max={60}
            step={2}
            value={plotConfig.minPathLength}
            onChange={(event) =>
              updatePlotConfig({
                minPathLength: Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          label="Join tolerance"
          description={`${plotConfig.joinTolerance.toFixed(0)} px`}
          htmlFor="join"
        >
          <input
            id="join"
            type="range"
            min={0}
            max={50}
            step={2}
            value={plotConfig.joinTolerance}
            onChange={(event) =>
              updatePlotConfig({
                joinTolerance: Number(event.target.value),
              })
            }
          />
        </Field>
        <Field label="Path ordering strategy">
          <select
            value={plotConfig.orderStrategy}
            onChange={(event) =>
              updatePlotConfig({
                orderStrategy: event.target.value as typeof plotConfig.orderStrategy,
              })
            }
            className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
          >
            <option value="nearest">Nearest neighbor</option>
            <option value="input">Input order</option>
          </select>
        </Field>
        <Field
          label="Preview stroke width"
          description={`${plotConfig.strokeWidth.toFixed(2)} mm`}
          htmlFor="stroke"
        >
          <input
            id="stroke"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={plotConfig.strokeWidth}
            onChange={(event) =>
              updatePlotConfig({
                strokeWidth: Number(event.target.value),
              })
            }
          />
        </Field>
      </Section>

      <Section title="Page & export" description="Scale to paper and save SVG.">
        <Field label="Page preset">
          <select
            value={plotConfig.page.presetId}
            onChange={(event) =>
              setPageConfig({
                ...plotConfig.page,
                presetId: event.target.value as PagePresetId,
              })
            }
            className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
          >
            {Object.values(PAGE_PRESETS).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orientation">
          <div className="flex gap-2 text-xs">
            {(["portrait", "landscape"] as const).map((orientation) => (
              <button
                key={orientation}
                type="button"
                onClick={() =>
                  setPageConfig({ ...plotConfig.page, orientation })
                }
                className={
                  plotConfig.page.orientation === orientation
                    ? "flex-1 rounded-md border border-cyan-400/30 bg-cyan-500/20 py-1 text-cyan-100"
                    : "flex-1 rounded-md border border-white/10 py-1 text-slate-300"
                }
              >
                {orientation}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Margins"
          description={`${plotConfig.marginMm.toFixed(0)} mm`}
          htmlFor="margin"
        >
          <input
            id="margin"
            type="range"
            min={5}
            max={40}
            step={1}
            value={plotConfig.marginMm}
            onChange={(event) =>
              updatePlotConfig({
                marginMm: Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          label="Scale"
          description={`${(plotConfig.scale * 100).toFixed(0)}%`}
          htmlFor="scale"
        >
          <input
            id="scale"
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={plotConfig.scale}
            onChange={(event) =>
              updatePlotConfig({
                scale: Number(event.target.value),
              })
            }
          />
        </Field>
        <Button onClick={handleExport} disabled={!plotDocument}>
          {plotDocument ? "Export SVG" : "Awaiting geometry"}
        </Button>
        {stats ? (
          <p className="text-xs text-slate-400">
            Length: {stats.penDownLength.toFixed(0)} units - Travel:{" "}
            {stats.penUpLength.toFixed(0)} units
          </p>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </Section>
    </div>
  );
}
