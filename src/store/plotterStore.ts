import { create } from "zustand";
import {
  GraphEvaluationResult,
  GraphEdge,
  GraphPreset,
  NodeGraph,
  NodeInstance,
  NodeRuntimeState,
  NodeLane,
  PlotDocument,
  PlotStats,
} from "@/lib/core/types";
import { nodeLibrary } from "@/lib/core/nodes/library";
import { graphPresets } from "@/lib/core/nodes/presets";
import { imageFileToFields, ImageFieldResult } from "@/lib/image/imageField";
import { decodeAudioFile } from "@/lib/audio/wav";
import { SampledSignal } from "@/lib/core/types";

export type Status = "idle" | "loading" | "computing";

interface NodeAssetEntry {
  image?: ImageFieldResult;
  audio?: SampledSignal;
}

export interface NodePosition {
  x: number;
  y: number;
}

interface PlotterStoreState {
  status: Status;
  error?: string;
  graph: NodeGraph;
  presets: GraphPreset[];
  selectedNodeId?: string;
  assets: Record<string, NodeAssetEntry>;
  nodeStates: Record<string, NodeRuntimeState>;
  nodePositions: Record<string, NodePosition>;
  document?: PlotDocument;
  stats?: PlotStats;
  graphVersion: number;
  setStatus: (status: Status) => void;
  setError: (message?: string) => void;
  selectNode: (nodeId?: string) => void;
  loadPreset: (presetId: string) => void;
  updateNodeParameters: (nodeId: string, patch: Record<string, unknown>) => void;
  connectNodes: (
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string,
  ) => void;
  disconnectEdge: (edgeId: string) => void;
  setNodeStates: (result: GraphEvaluationResult) => void;
  addNode: (definitionId: string, position?: NodePosition) => void;
  removeNode: (nodeId: string) => void;
  setNodePosition: (nodeId: string, position: NodePosition) => void;
  autoLayoutNodes: () => void;
  loadImageIntoNode: (nodeId: string, file: File) => Promise<void>;
  loadAudioIntoNode: (nodeId: string, file: File) => Promise<void>;
}

const cloneGraph = (graph: NodeGraph): NodeGraph => ({
  nodes: graph.nodes.map((node) => ({ ...node, parameters: { ...node.parameters } })),
  edges: graph.edges.map((edge) => ({ id: edge.id, from: { ...edge.from }, to: { ...edge.to } })),
});

const ensureEdgeId = (() => {
  let counter = 0;
  return () => `edge-${counter += 1}`;
})();


const LANE_SEQUENCE: NodeLane[] = ["data", "geometry", "plot", "global"];
const LANE_X_SPACING = 360;
const ROW_Y_SPACING = 220;

function computeDefaultNodePositions(nodes: NodeInstance[]): Record<string, NodePosition> {
  const laneRows: Record<NodeLane, number> = {
    data: 0,
    geometry: 0,
    plot: 0,
    global: 0,
  };
  const result: Record<string, NodePosition> = {};
  nodes.forEach((node) => {
    const lane = nodeLibrary[node.definitionId]?.lane ?? "global";
    const laneIndex = Math.max(0, LANE_SEQUENCE.indexOf(lane));
    const row = laneRows[lane];
    laneRows[lane] += 1;
    result[node.id] = {
      x: laneIndex * LANE_X_SPACING,
      y: row * ROW_Y_SPACING,
    };
  });
  return result;
}

function suggestPositionForLane(
  lane: NodeLane,
  nodes: NodeInstance[],
  positions: Record<string, NodePosition>,
): NodePosition {
  const laneIndex = Math.max(0, LANE_SEQUENCE.indexOf(lane));
  const laneNodes = nodes.filter(
    (node) => (nodeLibrary[node.definitionId]?.lane ?? "global") === lane,
  );
  const existingRows = laneNodes
    .map((node) => positions[node.id]?.y ?? -ROW_Y_SPACING)
    .map((y) => Math.round(y / ROW_Y_SPACING));
  const nextRow = existingRows.length ? Math.max(...existingRows) + 1 : 0;
  return {
    x: laneIndex * LANE_X_SPACING,
    y: nextRow * ROW_Y_SPACING,
  };
}


const initialGraph = cloneGraph(graphPresets[0]!.graph);
const initialPositions = computeDefaultNodePositions(initialGraph.nodes);

export const usePlotterStore = create<PlotterStoreState>((set, get) => ({
  status: "idle",
  graph: initialGraph,
  presets: graphPresets,
  assets: {},
  nodeStates: {},
  nodePositions: initialPositions,
  graphVersion: 0,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  loadPreset: (presetId) => {
    const preset = graphPresets.find((entry) => entry.id === presetId);
    if (!preset) return;
    const graph = cloneGraph(preset.graph);
    set({
      graph,
      graphVersion: Date.now(),
      selectedNodeId: undefined,
      nodeStates: {},
      nodePositions: computeDefaultNodePositions(graph.nodes),
      error: undefined,
    });
  },
  updateNodeParameters: (nodeId, patch) => {
    set((state) => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, parameters: { ...node.parameters, ...patch } }
            : node,
        ),
      },
      graphVersion: Date.now(),
    }));
  },
  connectNodes: (fromNodeId, fromPortId, toNodeId, toPortId) => {
    const definition = nodeLibrary[get().graph.nodes.find((node) => node.id === toNodeId)?.definitionId ?? ""];
    const inputDef = definition?.inputs.find((input) => input.id === toPortId);
    set((state) => {
      let edges = state.graph.edges;
      if (inputDef && !inputDef.acceptsMultiple) {
        edges = edges.filter(
          (edge) => !(edge.to.nodeId === toNodeId && edge.to.portId === toPortId),
        );
      }
      const newEdge: GraphEdge = {
        id: ensureEdgeId(),
        from: { nodeId: fromNodeId, portId: fromPortId },
        to: { nodeId: toNodeId, portId: toPortId },
      };
      return {
        graph: { ...state.graph, edges: [...edges, newEdge] },
        graphVersion: Date.now(),
      };
    });
  },
  disconnectEdge: (edgeId) => {
    set((state) => ({
      graph: {
        ...state.graph,
        edges: state.graph.edges.filter((edge) => edge.id !== edgeId),
      },
      graphVersion: Date.now(),
    }));
  },
  setNodeStates: (result) => {
    set({
      nodeStates: result.nodeStates,
      document: result.document,
      stats: result.stats,
      status: "idle",
    });
  },
  addNode: (definitionId, position) => {
    const definition = nodeLibrary[definitionId];
    if (!definition) return;
    const node: NodeInstance = {
      id: `node-${Date.now()}`,
      definitionId,
      label: definition.name,
      parameters: defaultParameters(definitionId),
      lane: definition.lane,
    };
    set((state) => ({
      graph: { ...state.graph, nodes: [...state.graph.nodes, node] },
      graphVersion: Date.now(),
      selectedNodeId: node.id,
      nodePositions: {
        ...state.nodePositions,
        [node.id]:
          position ??
          suggestPositionForLane(
            definition.lane,
            state.graph.nodes,
            state.nodePositions,
          ),
      },
    }));
  },
  removeNode: (nodeId) => {
    set((state) => ({
      graph: {
        nodes: state.graph.nodes.filter((node) => node.id !== nodeId),
        edges: state.graph.edges.filter(
          (edge) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId,
        ),
      },
      assets: Object.fromEntries(
        Object.entries(state.assets).filter(([key]) => key !== nodeId),
      ),
      nodePositions: Object.fromEntries(
        Object.entries(state.nodePositions).filter(([key]) => key !== nodeId),
      ),
      graphVersion: Date.now(),
      selectedNodeId: state.selectedNodeId === nodeId ? undefined : state.selectedNodeId,
    }));
  },
  setNodePosition: (nodeId, position) => {
    set((state) => ({
      nodePositions: { ...state.nodePositions, [nodeId]: position },
    }));
  },
  autoLayoutNodes: () => {
    const graph = get().graph;
    set({
      nodePositions: computeDefaultNodePositions(graph.nodes),
    });
  },
  loadImageIntoNode: async (nodeId, file) => {
    set({ status: "loading", error: undefined });
    try {
      const data = await imageFileToFields(file);
      set((state) => ({
        status: "idle",
        assets: { ...state.assets, [nodeId]: { ...(state.assets[nodeId] ?? {}), image: data } },
        graphVersion: Date.now(),
      }));
    } catch (error) {
      set({
        status: "idle",
        error: error instanceof Error ? error.message : "Failed to process image.",
      });
    }
  },
  loadAudioIntoNode: async (nodeId, file) => {
    set({ status: "loading", error: undefined });
    try {
      const signal = await decodeAudioFile(file);
      set((state) => ({
        status: "idle",
        assets: { ...state.assets, [nodeId]: { ...(state.assets[nodeId] ?? {}), audio: signal } },
        graphVersion: Date.now(),
      }));
    } catch (error) {
      set({
        status: "idle",
        error: error instanceof Error ? error.message : "Failed to decode audio file.",
      });
    }
  },
}));

function defaultParameters(definitionId: string) {
  const definition = nodeLibrary[definitionId];
  if (!definition) return {};
  const params: Record<string, unknown> = {};
  definition.parameters.forEach((param) => {
    if (param.defaultValue !== undefined) {
      params[param.id] = param.defaultValue;
    }
  });
  return params;
}

