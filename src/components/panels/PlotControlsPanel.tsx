"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { usePlotterStore } from "@/store/plotterStore";
import { serializePlotDocumentToSvg } from "@/lib/core/export/svg";
import { PageConfig, PagePresetId } from "@/lib/core/export/pagePresets";

export function PlotControlsPanel() {
  const document = usePlotterStore((state) => state.document);
  const status = usePlotterStore((state) => state.status);
  const graph = usePlotterStore((state) => state.graph);

  const outputNode = useMemo(
    () => graph.nodes.find((node) => node.definitionId === "output-svg"),
    [graph.nodes],
  );

  const pageConfig = useMemo<PageConfig>(() => {
    if (!outputNode) {
      return { presetId: "letter", orientation: "portrait" };
    }
    const raw = String(outputNode.parameters.page ?? "letter-portrait");
    if (raw === "custom") {
      return { presetId: "letter", orientation: "portrait" };
    }
    const [preset, orient] = raw.split("-");
    return {
      presetId: (preset as PagePresetId) ?? "letter",
      orientation: orient === "landscape" ? "landscape" : "portrait",
    };
  }, [outputNode]);

  const handleExport = () => {
    if (!document || typeof window === "undefined") return;
    const svg = serializePlotDocumentToSvg({
      document,
      page: pageConfig,
      marginMm: 10,
      scale: 1,
      strokeWidth: 0.3,
      strokeColor: "#0f172a",
      background: "none",
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    const filename = (outputNode?.parameters?.title as string | undefined)?.trim() || "plot";
    link.download = `${filename}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Export" description="Download the latest graph result as SVG.">
        <Button onClick={handleExport} disabled={!document || status === "computing"}>
          {document ? "Export SVG" : "Awaiting geometry"}
        </Button>
        {status === "computing" ? (
          <p className="mt-2 text-xs text-slate-400">Evaluating node graph...</p>
        ) : null}
        {!document ? (
          <p className="mt-2 text-xs text-slate-500">
            Connect a pipeline into an SVG Output node to enable exports.
          </p>
        ) : null}
      </Section>
    </div>
  );
}
