"use client";

import clsx from "clsx";
import { ChangeEvent } from "react";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { usePlotterStore } from "@/store/plotterStore";
import { nodeLibrary } from "@/lib/core/nodes/library";
import {
  GraphEdge,
  NodeInstance,
  NodeParameterDefinition,
  NodePortDefinition,
  NodeRuntimeState,
} from "@/lib/core/types";
import { ImageFieldResult } from "@/lib/image/imageField";
import { SampledSignal } from "@/lib/core/types";

interface NodeInspectorPanelProps {
  className?: string;
}

type NodeAssets = Partial<{ image: ImageFieldResult; audio: SampledSignal }>;

type NodeRuntimeMap = Record<string, NodeRuntimeState>;

export function NodeInspectorPanel({ className }: NodeInspectorPanelProps) {
  const graph = usePlotterStore((state) => state.graph);
  const selectedNodeId = usePlotterStore((state) => state.selectedNodeId);
  const selectNode = usePlotterStore((state) => state.selectNode);
  const updateNodeParameters = usePlotterStore((state) => state.updateNodeParameters);
  const disconnectEdge = usePlotterStore((state) => state.disconnectEdge);
  const removeNode = usePlotterStore((state) => state.removeNode);
  const assets = usePlotterStore((state) => state.assets);
  const loadImageIntoNode = usePlotterStore((state) => state.loadImageIntoNode);
  const loadAudioIntoNode = usePlotterStore((state) => state.loadAudioIntoNode);
  const nodeStates = usePlotterStore((state) => state.nodeStates) as NodeRuntimeMap;

  const node = graph.nodes.find((entry) => entry.id === selectedNodeId);
  if (!node) {
    return (
      <div
        data-node-inspector="true"
        className={clsx(
          "rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs text-slate-400",
          className,
        )}
      >
        <p>Select a node to edit parameters, load files, and inspect connections.</p>
      </div>
    );
  }

  const definition = nodeLibrary[node.definitionId];
  if (!definition) {
    return null;
  }

  const runtime = nodeStates[node.id];
  const incoming = graph.edges.filter((edge) => edge.to.nodeId === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from.nodeId === node.id);

  const handleRemove = () => {
    removeNode(node.id);
    selectNode(undefined);
  };

  return (
    <div
      data-node-inspector="true"
      className={clsx(
        "max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-xs text-slate-200",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{node.label ?? definition.name}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {definition.category} · Lane {definition.lane}
          </p>
        </div>
        <div className="text-right text-[11px]">
          <p className={clsx("font-semibold", statusColor(runtime?.status))}>
            {runtime?.status ?? "idle"}
          </p>
          {runtime?.error ? <p className="text-rose-300">{runtime.error}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => selectNode(undefined)}>
          Deselect
        </Button>
        <Button size="sm" variant="ghost" onClick={handleRemove}>
          Remove node
        </Button>
      </div>

      {definition.parameters.length ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Parameters
          </p>
          {definition.parameters.map((param) => (
            <Field
              key={`${node.id}-${param.id}`}
              label={`${param.label}${param.unit ? ` (${param.unit})` : ""}`}
              description={param.description}
            >
              {renderParameterControl(node, param, (patch) => updateNodeParameters(node.id, patch))}
            </Field>
          ))}
        </div>
      ) : null}

      {definition.inputs.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Connections
          </p>
          {definition.inputs.map((input) => (
            <InputSummary
              key={`${node.id}-${input.id}`}
              input={input}
              edges={incoming.filter((edge) => edge.to.portId === input.id)}
              disconnectEdge={disconnectEdge}
            />
          ))}
          {incoming.length === 0 ? (
            <p className="text-[11px] text-slate-500">No inputs connected yet.</p>
          ) : null}
          {outgoing.length ? (
            <div className="pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Outputs</p>
              <ul className="mt-1 space-y-1">
                {outgoing.map((edge) => (
                  <li key={edge.id} className="rounded-md border border-white/5 px-2 py-1 text-slate-300">
                    → {edge.to.nodeId}.{edge.to.portId}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {node.definitionId === "source-image" ? (
        <SourceImageFields nodeId={node.id} assets={assets[node.id]} loadImage={loadImageIntoNode} />
      ) : null}
      {node.definitionId === "source-wav" ? (
        <SourceAudioFields nodeId={node.id} assets={assets[node.id]} loadAudio={loadAudioIntoNode} />
      ) : null}
    </div>
  );
}

function InputSummary({
  input,
  edges,
  disconnectEdge,
}: {
  input: NodePortDefinition;
  edges: GraphEdge[];
  disconnectEdge: (edgeId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/60 p-2">
      <p className="text-[11px] font-semibold text-white">{input.label}</p>
      {edges.length ? (
        <ul className="mt-1 space-y-1">
          {edges.map((edge) => (
            <li key={edge.id} className="flex items-center justify-between text-[11px] text-slate-300">
              <span>
                {edge.from.nodeId}.{edge.from.portId}
              </span>
              <button
                type="button"
                className="text-rose-300"
                onClick={() => disconnectEdge(edge.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">Not connected</p>
      )}
    </div>
  );
}

function renderParameterControl(
  node: NodeInstance,
  param: NodeParameterDefinition,
  onParamChange: (patch: Record<string, unknown>) => void,
) {
  const currentValue =
    node.parameters[param.id] ??
    param.defaultValue ??
    (param.type === "boolean"
      ? false
      : param.type === "vector2"
        ? { x: 0, y: 0 }
        : param.type === "color"
          ? "#ffffff"
          : "");

  const handleChange = (value: unknown) => {
    onParamChange({ [param.id]: value });
  };

  if (param.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-slate-200">
        <input
          type="checkbox"
          checked={Boolean(currentValue)}
          onChange={(event) => handleChange(event.target.checked)}
          className="h-4 w-4 rounded border border-white/30"
        />
        {param.description ?? "Enabled"}
      </label>
    );
  }

  if (param.type === "enum") {
    return (
      <select
        value={String(currentValue)}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
      >
        {param.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (param.type === "vector2") {
    const value = currentValue as { x: number; y: number };
    return (
      <div className="flex gap-2">
        <input
          type="number"
          value={Number(value.x)}
          onChange={(event) => handleChange({ ...value, x: Number(event.target.value) })}
          className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-white"
        />
        <input
          type="number"
          value={Number(value.y)}
          onChange={(event) => handleChange({ ...value, y: Number(event.target.value) })}
          className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-white"
        />
      </div>
    );
  }

  if (param.type === "color") {
    return (
      <input
        type="color"
        value={String(currentValue)}
        onChange={(event) => handleChange(event.target.value)}
        className="h-8 w-16 rounded border border-white/10"
      />
    );
  }

  if (param.type === "text") {
    return (
      <input
        type="text"
        value={String(currentValue)}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-white"
      />
    );
  }

  return (
    <input
      type="number"
      value={Number(currentValue)}
      min={param.min}
      max={param.max}
      step={param.type === "integer" ? 1 : param.step}
      onChange={(event) => handleChange(Number(event.target.value))}
      className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-white"
    />
  );
}

function SourceImageFields({
  nodeId,
  assets,
  loadImage,
}: {
  nodeId: string;
  assets?: NodeAssets;
  loadImage: (nodeId: string, file: File) => Promise<void>;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadImage(nodeId, file);
  };

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
      <p className="text-slate-200">Image file</p>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleChange}
        className="mt-2 w-full text-xs text-slate-200"
      />
      {assets?.image ? (
        <p className="mt-2 text-slate-400">
          Loaded {assets.image.metadata.width} × {assets.image.metadata.height} px
        </p>
      ) : (
        <p className="mt-2 text-slate-500">No image loaded yet.</p>
      )}
    </div>
  );
}

function SourceAudioFields({
  nodeId,
  assets,
  loadAudio,
}: {
  nodeId: string;
  assets?: NodeAssets;
  loadAudio: (nodeId: string, file: File) => Promise<void>;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadAudio(nodeId, file);
  };

  const info = assets?.audio;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
      <p className="text-slate-200">WAV file</p>
      <input
        type="file"
        accept="audio/wav"
        onChange={handleChange}
        className="mt-2 w-full text-xs text-slate-200"
      />
      {info ? (
        <p className="mt-2 text-slate-400">
          {info.duration.toFixed(2)} s – {info.sampleRate} Hz – {info.channels} ch
        </p>
      ) : (
        <p className="mt-2 text-slate-500">No audio loaded yet.</p>
      )}
    </div>
  );
}

function statusColor(status?: string) {
  if (status === "error") return "text-rose-400";
  if (status === "success") return "text-emerald-400";
  if (status === "running" || status === "computing") return "text-cyan-300";
  return "text-slate-400";
}
