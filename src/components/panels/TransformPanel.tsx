"use client";

import { ChangeEvent, useMemo } from "react";
import clsx from "clsx";
import { Section } from "@/components/ui/Section";
import { Field } from "@/components/ui/Field";
import { usePlotterStore } from "@/store/plotterStore";
import { nodeLibrary } from "@/lib/core/nodes/library";
import {
  GraphEdge,
  NodeInstance,
  NodeLane,
  NodeParameterDefinition,
  NodePortDefinition,
  SampledSignal,
} from "@/lib/core/types";
import { ImageFieldResult } from "@/lib/image/imageField";

const LANE_ORDER: NodeLane[] = ["data", "geometry", "plot", "global"];
const LANE_LABEL: Record<NodeLane, string> = {
  data: "Lane A - Data",
  geometry: "Lane B - Geometry",
  plot: "Lane C - Plot",
  global: "Global nodes",
};

interface OutputOption {
  nodeId: string;
  portId: string;
  label: string;
  kind: NodePortDefinition["kind"];
}

type NodeAssets = Partial<{ image: ImageFieldResult; audio: SampledSignal }>;

export function TransformPanel() {
  const graph = usePlotterStore((state) => state.graph);
  const assets = usePlotterStore((state) => state.assets);
  const selectedNodeId = usePlotterStore((state) => state.selectedNodeId);
  const selectNode = usePlotterStore((state) => state.selectNode);
  const updateNodeParameters = usePlotterStore((state) => state.updateNodeParameters);
  const connectNodes = usePlotterStore((state) => state.connectNodes);
  const disconnectEdge = usePlotterStore((state) => state.disconnectEdge);
  const removeNode = usePlotterStore((state) => state.removeNode);
  const loadImageIntoNode = usePlotterStore((state) => state.loadImageIntoNode);
  const loadAudioIntoNode = usePlotterStore((state) => state.loadAudioIntoNode);

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

  const outputOptions = useMemo<OutputOption[]>(() => {
    return graph.nodes.flatMap((source) => {
      const definition = nodeLibrary[source.definitionId];
      if (!definition) return [];
      return definition.outputs.map((output) => ({
        nodeId: source.id,
        portId: output.id,
        kind: output.kind,
        label: `${source.label ?? definition.name} - ${output.label}`,
      }));
    });
  }, [graph.nodes]);

  return (
    <div className="flex flex-col gap-4">
      {LANE_ORDER.map((lane) => (
        <Section
          key={lane}
          title={LANE_LABEL[lane]}
          description="Configure node parameters, inspect ports, and wire connections."
        >
          <div className="flex flex-col gap-4">
            {nodesByLane[lane].map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                edges={graph.edges}
                assets={assets[node.id]}
                outputOptions={outputOptions}
                isSelected={node.id === selectedNodeId}
                onSelect={() => selectNode(node.id)}
                onRemove={() => removeNode(node.id)}
                onParamChange={(patch) => updateNodeParameters(node.id, patch)}
                connectNodes={connectNodes}
                disconnectEdge={disconnectEdge}
                loadImage={loadImageIntoNode}
                loadAudio={loadAudioIntoNode}
              />
            ))}
            {nodesByLane[lane].length === 0 ? (
              <p className="text-xs text-slate-500">No nodes in this lane yet.</p>
            ) : null}
          </div>
        </Section>
      ))}
    </div>
  );
}

interface NodeCardProps {
  node: NodeInstance;
  assets?: NodeAssets;
  edges: GraphEdge[];
  outputOptions: OutputOption[];
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onParamChange: (patch: Record<string, unknown>) => void;
  connectNodes: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void;
  disconnectEdge: (edgeId: string) => void;
  loadImage: (nodeId: string, file: File) => Promise<void>;
  loadAudio: (nodeId: string, file: File) => Promise<void>;
}

function NodeCard({
  node,
  assets,
  edges,
  outputOptions,
  isSelected,
  onSelect,
  onRemove,
  onParamChange,
  connectNodes,
  disconnectEdge,
  loadImage,
  loadAudio,
}: NodeCardProps) {
  const definition = nodeLibrary[node.definitionId];
  if (!definition) return null;

  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3",
        isSelected
          ? "border-cyan-400/60 bg-cyan-500/10"
          : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{definition.name}</p>
          <p className="text-xs text-slate-400">{definition.category}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onSelect}
            className={clsx(
              "rounded-md border px-2 py-1",
              isSelected
                ? "border-cyan-300/80 text-white"
                : "border-white/20 text-slate-200",
            )}
          >
            {isSelected ? "Selected" : "Select"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-white/20 px-2 py-1 text-slate-300 hover:text-white"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 text-xs">
        {definition.parameters.map((param) => (
          <Field
            key={`${node.id}-${param.id}`}
            label={`${param.label}${param.unit ? ` (${param.unit})` : ""}`}
            description={param.description}
          >
            {renderParameterControl(node, param, onParamChange)}
          </Field>
        ))}
        {definition.inputs.map((input) => (
          <InputConnector
            key={`${node.id}-${input.id}`}
            node={node}
            input={input}
            edges={edges}
            options={outputOptions}
            connectNodes={connectNodes}
            disconnectEdge={disconnectEdge}
          />
        ))}
        {node.definitionId === "source-image" ? (
          <SourceImageFields nodeId={node.id} assets={assets} loadImage={loadImage} />
        ) : null}
        {node.definitionId === "source-wav" ? (
          <SourceAudioFields nodeId={node.id} assets={assets} loadAudio={loadAudio} />
        ) : null}
      </div>
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

interface InputConnectorProps {
  node: NodeInstance;
  input: NodePortDefinition;
  edges: GraphEdge[];
  options: OutputOption[];
  connectNodes: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void;
  disconnectEdge: (edgeId: string) => void;
}

function InputConnector({
  node,
  input,
  edges,
  options,
  connectNodes,
  disconnectEdge,
}: InputConnectorProps) {
  const incoming = edges.filter(
    (edge) => edge.to.nodeId === node.id && edge.to.portId === input.id,
  );

  const compatibleOptions = options.filter(
    (option) => input.kind === "Any" || option.kind === input.kind || option.kind === "Any",
  );

  if (input.acceptsMultiple) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-white">{input.label}</p>
        {incoming.map((edge) => {
          const label =
            compatibleOptions.find(
              (option) => option.nodeId === edge.from.nodeId && option.portId === edge.from.portId,
            )?.label ?? `${edge.from.nodeId}.${edge.from.portId}`;
          return (
            <div
              key={edge.id}
              className="flex items-center justify-between rounded-md border border-white/10 px-2 py-1 text-slate-200"
            >
              <span>{label}</span>
              <button
                type="button"
                className="text-rose-300"
                onClick={() => disconnectEdge(edge.id)}
              >
                Remove
              </button>
            </div>
          );
        })}
        <Field label="Add connection">
          <select
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const [nodeId, portId] = value.split(":");
              connectNodes(nodeId, portId, node.id, input.id);
              event.target.value = "";
            }}
            className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
          >
            <option value="">Select output...</option>
            {compatibleOptions.map((option) => (
              <option key={`${option.nodeId}:${option.portId}`} value={`${option.nodeId}:${option.portId}`}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    );
  }

  const activeEdge = incoming[0];
  const currentValue = activeEdge
    ? `${activeEdge.from.nodeId}:${activeEdge.from.portId}`
    : "";

  return (
    <Field label={input.label}>
      <select
        value={currentValue}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            if (activeEdge) disconnectEdge(activeEdge.id);
            return;
          }
          const [nodeId, portId] = value.split(":");
          connectNodes(nodeId, portId, node.id, input.id);
        }}
        className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
      >
        <option value="">Not connected</option>
        {compatibleOptions.map((option) => (
          <option key={`${option.nodeId}:${option.portId}`} value={`${option.nodeId}:${option.portId}`}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
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
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
      <p className="text-slate-200">Image file</p>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleChange}
        className="mt-2 w-full text-xs text-slate-200"
      />
      {assets?.image ? (
        <p className="mt-2 text-slate-400">
          Loaded {assets.image.metadata.width} x {assets.image.metadata.height} px
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
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
      <p className="text-slate-200">WAV file</p>
      <input
        type="file"
        accept="audio/wav"
        onChange={handleChange}
        className="mt-2 w-full text-xs text-slate-200"
      />
      {info ? (
        <p className="mt-2 text-slate-400">
          {info.duration.toFixed(2)} s - {info.sampleRate} Hz - {info.channels} ch
        </p>
      ) : (
        <p className="mt-2 text-slate-500">No audio loaded yet.</p>
      )}
    </div>
  );
}
