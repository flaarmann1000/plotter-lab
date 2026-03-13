import { computePlotStats } from "../plot/stats";
import {
  GraphEdge,
  GraphEvaluationResult,
  NodeDefinition,
  NodeGraph,
  NodeInstance,
  NodeRuntimeState,
} from "../types";
import { nodeLibrary } from "./library";
import { nodeImplementations } from "./implementations";

export interface NodeAssetRecord {
  [nodeId: string]: Record<string, unknown> | undefined;
}

export interface NodeRuntimeResources {
  assets: NodeAssetRecord;
  extras?: Record<string, unknown>;
}

export interface NodeImplementationContext {
  node: NodeInstance;
  definition: NodeDefinition;
  parameters: Record<string, unknown>;
  inputs: Record<string, unknown[]>;
  getInputValues: (portId: string) => unknown[];
  getInputValue: (portId: string) => unknown | undefined;
  resources: NodeRuntimeResources;
}

const socketKey = (nodeId: string, portId: string) => `${nodeId}:${portId}`;

interface IndexedEdges {
  edgesByInput: Map<string, GraphEdge[]>;
  edgesByOutput: Map<string, GraphEdge[]>;
  outgoingByNode: Map<string, GraphEdge[]>;
  dependencyCounts: Map<string, number>;
}

function indexEdges(graph: NodeGraph): IndexedEdges {
  const edgesByInput = new Map<string, GraphEdge[]>();
  const edgesByOutput = new Map<string, GraphEdge[]>();
  const outgoingByNode = new Map<string, GraphEdge[]>();
  const dependencyCounts = new Map<string, number>();

  graph.nodes.forEach((node) => {
    dependencyCounts.set(node.id, 0);
  });

  for (const edge of graph.edges) {
    const inKey = socketKey(edge.to.nodeId, edge.to.portId);
    const outKey = socketKey(edge.from.nodeId, edge.from.portId);
    if (!edgesByInput.has(inKey)) edgesByInput.set(inKey, []);
    if (!edgesByOutput.has(outKey)) edgesByOutput.set(outKey, []);
    if (!outgoingByNode.has(edge.from.nodeId)) {
      outgoingByNode.set(edge.from.nodeId, []);
    }
    edgesByInput.get(inKey)!.push(edge);
    edgesByOutput.get(outKey)!.push(edge);
    outgoingByNode.get(edge.from.nodeId)!.push(edge);
    dependencyCounts.set(
      edge.to.nodeId,
      (dependencyCounts.get(edge.to.nodeId) ?? 0) + 1,
    );
  }

  return { edgesByInput, edgesByOutput, outgoingByNode, dependencyCounts };
}

function topoSort(
  graph: NodeGraph,
  dependencyCounts: Map<string, number>,
  outgoingByNode: Map<string, GraphEdge[]>,
) {
  const queue: NodeInstance[] = [];
  const ordered: NodeInstance[] = [];
  graph.nodes.forEach((node) => {
    if ((dependencyCounts.get(node.id) ?? 0) === 0) {
      queue.push(node);
    }
  });
  const mutableCounts = new Map(dependencyCounts);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));

  while (queue.length) {
    const current = queue.shift()!;
    ordered.push(current);
    (outgoingByNode.get(current.id) ?? []).forEach((edge) => {
      const nextId = edge.to.nodeId;
      const nextCount = (mutableCounts.get(nextId) ?? 0) - 1;
      mutableCounts.set(nextId, nextCount);
      if (nextCount === 0) {
        const nextNode = nodeById.get(nextId);
        if (nextNode) {
          queue.push(nextNode);
        }
      }
    });
  }

  if (ordered.length !== graph.nodes.length) {
    throw new Error("Node graph contains cycles or unsupported connections.");
  }

  return ordered;
}

export async function executeNodeGraph(
  graph: NodeGraph,
  resources: NodeRuntimeResources,
): Promise<GraphEvaluationResult> {
  const { edgesByInput, outgoingByNode, dependencyCounts } = indexEdges(graph);
  const orderedNodes = topoSort(graph, dependencyCounts, outgoingByNode);
  const nodeStates: Record<string, NodeRuntimeState> = {};
  let document: unknown;

  for (const node of orderedNodes) {
    const definition = nodeLibrary[node.definitionId];
    if (!definition) {
      nodeStates[node.id] = {
        status: "error",
        error: `Unknown node definition: ${node.definitionId}`,
      };
      break;
    }

    const implementation = nodeImplementations[node.definitionId];
    if (!implementation) {
      nodeStates[node.id] = {
        status: "error",
        error: `Node ${definition.name} is not implemented yet`,
      };
      break;
    }

    const inputsRecord: Record<string, unknown[]> = {};
    let missingRequired = false;
    for (const input of definition.inputs) {
      const key = socketKey(node.id, input.id);
      const edges = edgesByInput.get(key) ?? [];
      const values: unknown[] = [];
      for (const edge of edges) {
        const sourceState = nodeStates[edge.from.nodeId];
        if (!sourceState || sourceState.status !== "success") {
          continue;
        }
        const value = sourceState.outputs?.[edge.from.portId];
        if (value !== undefined) {
          values.push(value);
        }
      }
      if (input.required && !values.length) {
        missingRequired = true;
        nodeStates[node.id] = {
          status: "error",
          error: `Input ${input.label} is not connected`,
        };
        break;
      }
      inputsRecord[input.id] = values;
    }

    if (missingRequired) {
      break;
    }

    const ctx: NodeImplementationContext = {
      node,
      definition,
      parameters: node.parameters,
      inputs: inputsRecord,
      getInputValues: (portId: string) => inputsRecord[portId] ?? [],
      getInputValue: (portId: string) => inputsRecord[portId]?.[0],
      resources,
    };

    const startedAt = Date.now();
    try {
      const outputs = await implementation(ctx);
      nodeStates[node.id] = {
        status: "success",
        outputs,
        startedAt,
        finishedAt: Date.now(),
      };
      definition.outputs.forEach((output) => {
        if (output.kind === "PlotDocument") {
          const value = outputs?.[output.id];
          if (value) {
            document = value;
          }
        }
      });
      const outgoing = outgoingByNode.get(node.id) ?? [];
      if (outgoing.some((edge) => {
        const state = nodeStates[edge.to.nodeId];
        return state && state.status === "error";
      })) {
        break;
      }
    } catch (error) {
      nodeStates[node.id] = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        startedAt,
        finishedAt: Date.now(),
      };
      break;
    }
  }

  const graphResult: GraphEvaluationResult = {
    nodeStates,
  };

  if (document && isPlotDocument(document)) {
    graphResult.document = document;
    graphResult.stats = computePlotStats(document);
  }

  return graphResult;
}

function isPlotDocument(value: unknown): value is Parameters<typeof computePlotStats>[0] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "layers" in (value as Record<string, unknown>) &&
      Array.isArray((value as { layers?: unknown[] }).layers),
  );
}
