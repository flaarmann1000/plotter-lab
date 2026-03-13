"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/Section";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { usePlotterStore } from "@/store/plotterStore";
import { nodeLibrary } from "@/lib/core/nodes/library";
import { NodeInstance, NodeLane } from "@/lib/core/types";

const LANE_ORDER: NodeLane[] = ["data", "geometry", "plot", "global"];
const LANE_LABEL: Record<NodeLane, string> = {
  data: "Lane A - Data",
  geometry: "Lane B - Geometry",
  plot: "Lane C - Plot",
  global: "Global utilities",
};

export function SourcePanel() {
  const presets = usePlotterStore((state) => state.presets);
  const loadPreset = usePlotterStore((state) => state.loadPreset);
  const addNode = usePlotterStore((state) => state.addNode);
  const selectNode = usePlotterStore((state) => state.selectNode);
  const graph = usePlotterStore((state) => state.graph);
  const selectedNodeId = usePlotterStore((state) => state.selectedNodeId);

  const sortedDefinitions = useMemo(
    () =>
      Object.values(nodeLibrary).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [definitionId, setDefinitionId] = useState(
    sortedDefinitions[0]?.id ?? "source-image",
  );

  const nodesByLane = useMemo(() => {
    const groups: Record<NodeLane, NodeInstance[]> = {
      data: [],
      geometry: [],
      plot: [],
      global: [],
    };
    graph.nodes.forEach((node) => {
      const lane = nodeLibrary[node.definitionId]?.lane ?? "global";
      groups[lane as NodeLane].push(node);
    });
    return groups;
  }, [graph.nodes]);

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Graph templates"
        description="Start from one of the curated image, noise, or audio graphs."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset.id)}
              className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-cyan-400/40"
            >
              <span className="block font-semibold text-white">{preset.name}</span>
              <span className="text-slate-500">{preset.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Add node"
        description="Insert more sources, field ops, geometry, or utility nodes."
      >
        <Field label="Node">
          <select
            value={definitionId}
            onChange={(event) => setDefinitionId(event.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
          >
            {sortedDefinitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name} / {definition.category}
              </option>
            ))}
          </select>
        </Field>
        <Button onClick={() => addNode(definitionId)}>Add node</Button>
      </Section>

      <Section
        title="Nodes in graph"
        description="Click a node to reveal its parameters and ports."
      >
        <div className="flex flex-col gap-4 text-xs">
          {LANE_ORDER.map((lane) => (
            <div key={lane}>
              <p className="mb-1 font-semibold uppercase tracking-wide text-slate-300">
                {LANE_LABEL[lane]}
              </p>
              <div className="flex flex-col gap-1">
                {nodesByLane[lane].map((node) => {
                  const definition = nodeLibrary[node.definitionId];
                  const label = node.label ?? definition?.name ?? node.definitionId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => selectNode(node.id)}
                      className={`rounded-md border px-2 py-1 text-left transition ${
                        node.id === selectedNodeId
                          ? "border-cyan-400/60 bg-cyan-500/10 text-white"
                          : "border-white/10 text-slate-300 hover:border-white/30"
                      }`}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="text-[11px] text-slate-500">
                        {definition?.category} / {definition?.lane}
                      </span>
                    </button>
                  );
                })}
                {nodesByLane[lane].length === 0 ? (
                  <p className="rounded-md border border-dashed border-white/10 px-2 py-1 text-slate-500">
                    No nodes in this lane yet.
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
