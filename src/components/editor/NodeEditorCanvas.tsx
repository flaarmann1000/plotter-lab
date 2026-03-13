"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import clsx from "clsx";
import { usePlotterStore, NodePosition } from "@/store/plotterStore";
import { nodeLibrary, nodeList } from "@/lib/core/nodes/library";
import {
  GraphEdge,
  NodeCategory,
  NodeDefinition,
  NodeInstance,
  NodeLane,
  NodePortDefinition,
  NodeRuntimeState,
  NodeValueKind,
  PlotDocument,
} from "@/lib/core/types";
import { Button } from "@/components/ui/Button";
import { NodeInspectorPanel } from "./NodeInspectorPanel";
import { MiniPlotPreview } from "./MiniPlotPreview";

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

function screenPointToWorld(point: { x: number; y: number }, camera: CameraState) {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

function worldPointToScreen(point: { x: number; y: number }, camera: CameraState) {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

interface ContextMenuState {
  screen: { x: number; y: number };
  world: { x: number; y: number };
}

interface PendingConnection {
  type: "output" | "input";
  nodeId: string;
  portId: string;
  kind: NodeValueKind;
  pointer: { x: number; y: number };
}

interface PortMenuState {
  screen: { x: number; y: number };
  edges: GraphEdge[];
  nodeId: string;
  portId: string;
  direction: "input" | "output";
}

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  source: "Source nodes",
  conversion: "Conversion",
  field: "Field",
  vectorField: "Vector Fields",
  audio: "Audio",
  geometry: "Geometry",
  path: "Path ops",
  optimization: "Optimization",
  layout: "Layout",
  layer: "Layer & styling",
  preview: "Preview & analysis",
  output: "Output",
  utility: "Control & utility",
  macro: "Macro / presets",
};

const KIND_CLASS: Partial<Record<NodeValueKind, string>> = {
  ImageData: "bg-sky-400",
  ScalarField: "bg-emerald-400",
  Mask: "bg-pink-400",
  VectorField: "bg-purple-400",
  DistanceField: "bg-yellow-400",
  AudioSignal: "bg-amber-400",
  SpectrumData: "bg-indigo-400",
  EnvelopeData: "bg-rose-400",
  PointSet: "bg-blue-400",
  PolylineSet: "bg-teal-400",
  LayeredGeometry: "bg-cyan-400",
  PlotDocument: "bg-orange-300",
  PlotStats: "bg-slate-300",
  Any: "bg-slate-500",
};

const KIND_HEX: Partial<Record<NodeValueKind, string>> = {
  ImageData: "#38bdf8",
  ScalarField: "#34d399",
  Mask: "#fb7185",
  VectorField: "#a855f7",
  DistanceField: "#facc15",
  AudioSignal: "#fbbf24",
  SpectrumData: "#818cf8",
  EnvelopeData: "#f472b6",
  PointSet: "#60a5fa",
  PolylineSet: "#2dd4bf",
  LayeredGeometry: "#22d3ee",
  PlotDocument: "#fb923c",
  PlotStats: "#cbd5f5",
  Any: "#94a3b8",
};

const laneAccent: Record<NodeLane, string> = {
  data: "border-sky-400/60",
  geometry: "border-emerald-400/60",
  plot: "border-amber-400/60",
  global: "border-slate-400/60",
};

const LANE_LABELS: Record<NodeLane, string> = {
  data: "Lane A · Data",
  geometry: "Lane B · Geometry",
  plot: "Lane C · Plot",
  global: "Global Nodes",
};

const LANE_ORDER: NodeLane[] = ["data", "geometry", "plot", "global"];

export function NodeEditorCanvas() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodes = usePlotterStore((state) => state.graph.nodes);
  const edges = usePlotterStore((state) => state.graph.edges);
  const presets = usePlotterStore((state) => state.presets);
  const loadPreset = usePlotterStore((state) => state.loadPreset);
  const addNode = usePlotterStore((state) => state.addNode);
  const connectNodes = usePlotterStore((state) => state.connectNodes);
  const disconnectEdge = usePlotterStore((state) => state.disconnectEdge);
  const selectNode = usePlotterStore((state) => state.selectNode);
  const selectedNodeId = usePlotterStore((state) => state.selectedNodeId);
  const nodeStates = usePlotterStore((state) => state.nodeStates);
  const nodePositions = usePlotterStore((state) => state.nodePositions);
  const setNodePosition = usePlotterStore((state) => state.setNodePosition);
  const autoLayoutNodes = usePlotterStore((state) => state.autoLayoutNodes);
  const removeNode = usePlotterStore((state) => state.removeNode);
  const status = usePlotterStore((state) => state.status);

  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [camera, setCamera] = useState<CameraState>({ x: 240, y: 160, zoom: 0.8 });
  const cameraRef = useRef(camera);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [portMenu, setPortMenu] = useState<PortMenuState | null>(null);

  const portElements = useRef<Record<string, HTMLElement | null>>({});
  const [portPositions, setPortPositions] = useState<Record<string, { x: number; y: number }>>({});
  const measureFrameRef = useRef<number | null>(null);
  const draggingNode = useRef<{
    nodeId: string;
    pointerId: number;
    origin: { x: number; y: number };
    start: NodePosition;
  } | null>(null);
  const rightPanState = useRef<{
    pointerId: number;
    origin: { x: number; y: number };
    start: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const suppressContextMenuRef = useRef(false);
  const contextMenuResetTimeoutRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const groupedEdges = useMemo(() => {
    const incoming = new Map<string, GraphEdge[]>();
    const outgoing = new Map<string, GraphEdge[]>();
    edges.forEach((edge) => {
      if (!incoming.has(edge.to.nodeId)) incoming.set(edge.to.nodeId, []);
      incoming.get(edge.to.nodeId)!.push(edge);
      if (!outgoing.has(edge.from.nodeId)) outgoing.set(edge.from.nodeId, []);
      outgoing.get(edge.from.nodeId)!.push(edge);
    });
    return { incoming, outgoing };
  }, [edges]);

  const nodeRuntimeMap = nodeStates as Record<string, NodeRuntimeState | undefined>;

  const contentSize = useMemo(() => {
    if (!nodes.length) return { width: 2400, height: 1600 };
    const xs = nodes.map((node) => nodePositions[node.id]?.x ?? 0);
    const ys = nodes.map((node) => nodePositions[node.id]?.y ?? 0);
    const maxX = Math.max(...xs, 0);
    const maxY = Math.max(...ys, 0);
    return {
      width: Math.max(2400, maxX + 600),
      height: Math.max(1600, maxY + 600),
    };
  }, [nodes, nodePositions]);

  const measurePorts = useCallback(() => {
    const container = canvasRef.current;
    const cam = cameraRef.current;
    if (!container || !cam) return;
    const rect = container.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    Object.entries(portElements.current).forEach(([key, element]) => {
      if (!element) return;
      const box = element.getBoundingClientRect();
      const screenPoint = {
        x: box.left + box.width / 2 - rect.left,
        y: box.top + box.height / 2 - rect.top,
      };
      next[key] = screenPointToWorld(screenPoint, cam);
    });
    setPortPositions((prev) => (arePortPositionsEqual(prev, next) ? prev : next));
  }, []);

  const requestPortMeasurement = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measurePorts();
    });
  }, [measurePorts]);

  const registerPort = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (element) {
        portElements.current[key] = element;
      } else {
        delete portElements.current[key];
      }
      requestPortMeasurement();
    },
    [requestPortMeasurement],
  );

  useEffect(() => {
    requestPortMeasurement();
  }, [nodes, nodePositions, edges, requestPortMeasurement]);

  useEffect(() => {
    requestPortMeasurement();
  }, [camera, requestPortMeasurement]);

  useLayoutEffect(() => {
    measurePorts();
  }, [nodes, nodePositions, edges, measurePorts]);

  useEffect(() => {
    if (!edges.length) return;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const invalidEdges: string[] = [];
    edges.forEach((edge) => {
      const fromNode = nodeMap.get(edge.from.nodeId);
      const toNode = nodeMap.get(edge.to.nodeId);
      if (!fromNode || !toNode) {
        invalidEdges.push(edge.id);
      }
    });
    if (invalidEdges.length) {
      invalidEdges.forEach((edgeId) => disconnectEdge(edgeId));
    }
  }, [nodes, edges, disconnectEdge]);

  useEffect(() => {
    const handler = () => requestPortMeasurement();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [requestPortMeasurement]);

  useEffect(() => () => {
    if (measureFrameRef.current !== null) {
      cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = null;
    }
    if (contextMenuResetTimeoutRef.current !== null) {
      clearTimeout(contextMenuResetTimeoutRef.current);
      contextMenuResetTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setPendingConnection(null);
        setPortMenu(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId) {
        const active = document.activeElement;
        if (isEditableElement(active)) return;
        event.preventDefault();
        removeNode(selectedNodeId);
        setContextMenu(null);
        setPendingConnection(null);
        setPortMenu(null);
        selectNode(undefined);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedNodeId, removeNode, selectNode]);

  const paletteStructure = useMemo<PaletteLaneGroup[]>(() => {
    const lanes: Partial<Record<NodeLane, Partial<Record<NodeCategory, NodeDefinition[]>>>> = {};
    nodeList.forEach((definition) => {
      if (!lanes[definition.lane]) lanes[definition.lane] = {};
      if (!lanes[definition.lane]![definition.category]) {
        lanes[definition.lane]![definition.category] = [];
      }
      lanes[definition.lane]![definition.category]!.push(definition);
    });
    return LANE_ORDER.map((lane) => {
      const categories = lanes[lane];
      if (!categories) return null;
      const entries = Object.entries(categories).map(([category, defs]) => ({
        id: category as NodeCategory,
        label: CATEGORY_LABELS[category as NodeCategory],
        nodes: [...(defs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      entries.sort((a, b) => a.label.localeCompare(b.label));
      return entries.length
        ? {
            lane,
            label: LANE_LABELS[lane],
            categories: entries,
          }
        : null;
    }).filter((entry): entry is PaletteLaneGroup => Boolean(entry));
  }, []);

  const isEventInsidePalette = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest(".node-palette"));
  const isEventInsideInspector = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("[data-node-inspector]"));
  const isEventInsidePortMenu = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("[data-port-menu]"));
  const isEditableElement = (element: Element | null) => {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      element.getAttribute("contenteditable") === "true" ||
      Boolean(element.closest("[contenteditable=\"true\"]"))
    );
  };

  const handleCanvasPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest("[data-node-card]") ||
      isEventInsidePalette(target) ||
      isEventInsideInspector(target) ||
      isEventInsidePortMenu(target)
    ) {
      return;
    }
    setContextMenu(null);
    setPendingConnection(null);
    setPortMenu(null);
    selectNode(undefined);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button === 2) {
      if (
        isEventInsidePalette(target) ||
        isEventInsideInspector(target) ||
        isEventInsidePortMenu(target)
      ) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressContextMenuRef.current = false;
      if (contextMenuResetTimeoutRef.current !== null) {
        clearTimeout(contextMenuResetTimeoutRef.current);
        contextMenuResetTimeoutRef.current = null;
      }
      rightPanState.current = {
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        start: { x: camera.x, y: camera.y },
        moved: false,
      };
      setContextMenu(null);
      setPortMenu(null);
      return;
    }
    if (
      event.button === 0 &&
      !target.closest("[data-node-card]") &&
      !isEventInsidePalette(target) &&
      !isEventInsideInspector(target) &&
      !isEventInsidePortMenu(target)
    ) {
      setContextMenu(null);
      setPendingConnection(null);
      setPortMenu(null);
      selectNode(undefined);
    }
  };

  const handleBackgroundPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pendingConnection) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setPendingConnection((prev) =>
          prev
            ? {
                ...prev,
                pointer: {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                },
              }
            : null,
        );
      }
    }
    const pan = rightPanState.current;
    if (pan && pan.pointerId === event.pointerId) {
      const deltaX = event.clientX - pan.origin.x;
      const deltaY = event.clientY - pan.origin.y;
      if (!pan.moved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        pan.moved = true;
        suppressContextMenuRef.current = true;
      }
      setCamera((prev) => ({ ...prev, x: pan.start.x + deltaX, y: pan.start.y + deltaY }));
    }
  };

  const handleBackgroundPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (rightPanState.current && rightPanState.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (rightPanState.current.moved) {
        suppressContextMenuRef.current = true;
        if (contextMenuResetTimeoutRef.current !== null) {
          clearTimeout(contextMenuResetTimeoutRef.current);
        }
        contextMenuResetTimeoutRef.current = window.setTimeout(() => {
          suppressContextMenuRef.current = false;
          contextMenuResetTimeoutRef.current = null;
        }, 150);
      }
      rightPanState.current = null;
    }
  };

  const screenToWorld = useCallback(
    (point: { x: number; y: number }) => ({
      x: (point.x - camera.x) / camera.zoom,
      y: (point.y - camera.y) / camera.zoom,
    }),
    [camera],
  );

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isEventInsidePalette(event.target) || isEventInsideInspector(event.target)) {
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const cursor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setCamera((prev) => {
      const worldPoint = {
        x: (cursor.x - prev.x) / prev.zoom,
        y: (cursor.y - prev.y) / prev.zoom,
      };
      const delta = -event.deltaY * 0.0015;
      const nextZoom = clamp(prev.zoom * (1 + delta), 0.3, 1.8);
      return {
        zoom: nextZoom,
        x: cursor.x - worldPoint.x * nextZoom,
        y: cursor.y - worldPoint.y * nextZoom,
      };
    });
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isEventInsidePalette(event.target) || isEventInsideInspector(event.target) || isEventInsidePortMenu(event.target)) return;
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false;
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const world = screenToWorld(screenPoint);
    setContextMenu({ screen: screenPoint, world });
    setPortMenu(null);
  };

  const handleAddNode = (definitionId: string) => {
    if (!contextMenu) return;
    addNode(definitionId, { x: contextMenu.world.x, y: contextMenu.world.y });
    setContextMenu(null);
  };

  const beginConnection = (
    type: "output" | "input",
    nodeId: string,
    portId: string,
    kind: NodeValueKind,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    setContextMenu(null);
    setPortMenu(null);
    const portKey = getPortKey(nodeId, portId, type);
    const originWorld = portPositions[portKey];
    const rect = canvasRef.current?.getBoundingClientRect();
    const fallbackPointer = rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
    const pointer = originWorld ? worldPointToScreen(originWorld, camera) : fallbackPointer;
    const nodeRef = nodes.find((entry) => entry.id === nodeId);
    const definition = nodeRef ? nodeLibrary[nodeRef.definitionId] : undefined;
    const portDefinition =
      type === "input"
        ? definition?.inputs.find((input) => input.id === portId)
        : definition?.outputs.find((output) => output.id === portId);

    if (type === "input" && portDefinition?.acceptsMultiple === false) {
      // Allow reconnecting existing single-input quickly by clearing first when dragging.
      const incomingEdges = groupedEdges.incoming.get(nodeId) ?? [];
      const existing = incomingEdges.find((edge) => edge.to.portId === portId);
      if (existing) {
        disconnectEdge(existing.id);
      }
    }
    setPendingConnection({
      type,
      nodeId,
      portId,
      kind,
      pointer,
    });
  };

  const completeConnection = (nodeId: string, portId: string, direction: "input" | "output") => {
    if (!pendingConnection) return;
    if (pendingConnection.type === direction) return;
    if (pendingConnection.type === "output" && direction === "input") {
      connectNodes(pendingConnection.nodeId, pendingConnection.portId, nodeId, portId);
      setPendingConnection(null);
    } else if (pendingConnection.type === "input" && direction === "output") {
      connectNodes(nodeId, portId, pendingConnection.nodeId, pendingConnection.portId);
      setPendingConnection(null);
    }
    setPortMenu(null);
  };

  const cancelConnection = () => {
    setPendingConnection(null);
    setPortMenu(null);
  };

  const handleOpenPortMenu = useCallback(
    ({
      event,
      edges: edgeList,
      nodeId,
      portId,
      direction,
    }: {
      event: React.MouseEvent<HTMLElement>;
      edges: GraphEdge[];
      nodeId: string;
      portId: string;
      direction: "input" | "output";
    }) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      const screen = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : { x: event.clientX, y: event.clientY };
      setPortMenu({
        screen,
        edges: edgeList,
        nodeId,
        portId,
        direction,
      });
      setContextMenu(null);
    },
    [],
  );

  const handleNodePointerDown = (
    nodeId: string,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    const position = nodePositions[nodeId] ?? { x: 0, y: 0 };
    draggingNode.current = {
      nodeId,
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      start: position,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    selectNode(nodeId);
    setContextMenu(null);
  };

  const handleNodePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingNode.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - drag.origin.x) / camera.zoom;
    const deltaY = (event.clientY - drag.origin.y) / camera.zoom;
    setNodePosition(drag.nodeId, {
      x: drag.start.x + deltaX,
      y: drag.start.y + deltaY,
    });
  };

  const handleNodePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingNode.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      draggingNode.current = null;
    }
  };

  const fitView = () => {
    const container = canvasRef.current;
    if (!container || !nodes.length) return;
    const rect = container.getBoundingClientRect();
    const xs = nodes.map((node) => nodePositions[node.id]?.x ?? 0);
    const ys = nodes.map((node) => nodePositions[node.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX + 400;
    const height = maxY - minY + 400;
    const zoom = clamp(Math.min(rect.width / width, rect.height / height), 0.3, 1.4);
    setCamera({
      zoom,
      x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
    });
  };

  const handlePresetChange = (value: string) => {
    setPresetId(value);
    if (value) loadPreset(value);
    setTimeout(() => fitView(), 250);
  };

  useEffect(() => {
    const timeout = setTimeout(() => fitView(), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full min-h-[600px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="uppercase tracking-wide text-[11px] text-slate-500">Preset</span>
            <select
              value={presetId}
              onChange={(event) => handlePresetChange(event.target.value)}
              className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => autoLayoutNodes()}>
            Auto layout
          </Button>
          <Button size="sm" variant="outline" onClick={fitView}>
            Center view
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-white/10 px-3 py-1 text-slate-200">
            {nodes.length} nodes
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-slate-200">
            {edges.length} connections
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-slate-400">
            Status: {status}
          </span>
        </div>
      </div>
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden overscroll-none"
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(14,116,144,0.15)_1px,_transparent_1px)] bg-[size:24px_24px]" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((edge) => {
            const getWorldPosition = (key: string) => {
              const stored = portPositions[key];
              if (stored) return stored;
              const element = portElements.current[key];
              const container = canvasRef.current;
              const cam = cameraRef.current;
              if (!element || !container || !cam) return undefined;
              const rect = container.getBoundingClientRect();
              const box = element.getBoundingClientRect();
              const screenPoint = {
                x: box.left + box.width / 2 - rect.left,
                y: box.top + box.height / 2 - rect.top,
              };
              return screenPointToWorld(screenPoint, cam);
            };
            const startWorld = getWorldPosition(getPortKey(edge.from.nodeId, edge.from.portId, "output"));
            const endWorld = getWorldPosition(getPortKey(edge.to.nodeId, edge.to.portId, "input"));
            if (!startWorld || !endWorld) return null;
            const start = worldPointToScreen(startWorld, camera);
            const end = worldPointToScreen(endWorld, camera);
            const dx = Math.max(Math.abs(end.x - start.x), 40);
            const control1X = start.x + dx * 0.5;
            const control2X = end.x - dx * 0.5;
            const definition = nodeLibrary[
              nodes.find((node) => node.id === edge.from.nodeId)?.definitionId ?? ""
            ];
            const port = definition?.outputs.find((output) => output.id === edge.from.portId);
            const color = port ? kindToColor(port.kind) : "#38bdf8";
            return (
              <path
                key={edge.id}
                d={`M${start.x},${start.y} C${control1X},${start.y} ${control2X},${end.y} ${end.x},${end.y}`}
                stroke={color}
                strokeWidth={3}
                strokeOpacity={0.85}
                fill="none"
                className="pointer-events-auto cursor-pointer opacity-80 transition hover:opacity-100"
                style={{ pointerEvents: "stroke" }}
                onClick={(event) => {
                  event.stopPropagation();
                  disconnectEdge(edge.id);
                }}
              />
            );
          })}
        </svg>
        {pendingConnection ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {(() => {
              const startWorld =
                portPositions[
                  getPortKey(pendingConnection.nodeId, pendingConnection.portId, pendingConnection.type)
                ];
              if (!startWorld) return null;
              const start = worldPointToScreen(startWorld, camera);
              const end = pendingConnection.pointer;
              const dx = Math.max(Math.abs(end.x - start.x), 40);
              const control1X = start.x + dx * 0.5;
              const control2X = end.x - dx * 0.5;
              return (
                <path
                  d={`M${start.x},${start.y} C${control1X},${start.y} ${control2X},${end.y} ${end.x},${end.y}`}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="6 6"
                />
              );
            })()}
          </svg>
        ) : null}
        <div
          className="absolute left-0 top-0"
          style={{
            width: contentSize.width,
            height: contentSize.height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            transformOrigin: "0 0",
          }}
          onPointerMove={handleNodePointerMove}
          onPointerUp={handleNodePointerUp}
        >
          {nodes.map((node) => {
            const definition = nodeLibrary[node.definitionId];
            if (!definition) return null;
            const position = nodePositions[node.id] ?? { x: 0, y: 0 };
            const runtime = nodeRuntimeMap[node.id];
            const incoming = groupedEdges.incoming.get(node.id) ?? [];
            const outgoing = groupedEdges.outgoing.get(node.id) ?? [];
            const previewDoc = getOutputDocument(definition, runtime);
            return (
              <NodeView
                key={node.id}
                node={node}
                definition={definition}
                position={position}
                runtime={runtime}
                incomingEdges={incoming}
                outgoingEdges={outgoing}
                selected={selectedNodeId === node.id}
                registerPort={registerPort}
                onPointerDown={handleNodePointerDown}
                beginConnection={beginConnection}
                completeConnection={completeConnection}
              pendingConnection={pendingConnection}
              cancelConnection={cancelConnection}
              disconnectEdge={disconnectEdge}
              previewDocument={previewDoc}
              openPortMenu={handleOpenPortMenu}
            />
          );
        })}
        </div>
        {contextMenu ? (
          <NodePalette
            position={contextMenu.screen}
            structure={paletteStructure}
            onSelect={handleAddNode}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
        {portMenu ? (
          <PortContextMenu
            menu={portMenu}
            disconnectEdge={disconnectEdge}
            onClose={() => setPortMenu(null)}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 flex items-end justify-start p-4">
          <NodeInspectorPanel className="pointer-events-auto" />
        </div>
      </div>
    </div>
  );
}

interface NodeViewProps {
  node: NodeInstance;
  definition: NodeDefinition;
  position: NodePosition;
  runtime?: NodeRuntimeState;
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  selected: boolean;
  registerPort: (key: string) => (element: HTMLElement | null) => void;
  onPointerDown: (nodeId: string, event: React.PointerEvent<HTMLDivElement>) => void;
  beginConnection: (
    type: "output" | "input",
    nodeId: string,
    portId: string,
    kind: NodeValueKind,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
  completeConnection: (nodeId: string, portId: string, direction: "input" | "output") => void;
  pendingConnection: PendingConnection | null;
  cancelConnection: () => void;
  disconnectEdge: (edgeId: string) => void;
  previewDocument?: PlotDocument;
  openPortMenu: (payload: {
    event: React.MouseEvent<HTMLElement>;
    edges: GraphEdge[];
    nodeId: string;
    portId: string;
    direction: "input" | "output";
  }) => void;
}

interface PaletteCategoryGroup {
  id: NodeCategory;
  label: string;
  nodes: NodeDefinition[];
}

interface PaletteLaneGroup {
  lane: NodeLane;
  label: string;
  categories: PaletteCategoryGroup[];
}

function NodeView({
  node,
  definition,
  position,
  runtime,
  incomingEdges,
  outgoingEdges,
  selected,
  registerPort,
  onPointerDown,
  beginConnection,
  completeConnection,
  pendingConnection,
  cancelConnection,
  disconnectEdge,
  previewDocument,
  openPortMenu,
}: NodeViewProps) {
  const status = runtime?.status ?? "idle";
  const statusStyle =
    status === "error"
      ? "bg-rose-400"
      : status === "success"
        ? "bg-emerald-400"
        : status === "running"
          ? "bg-cyan-400"
          : "bg-slate-600";
  const cardClasses = clsx(
    "absolute w-72 rounded-2xl border bg-slate-900/90 p-4 text-xs text-slate-200 shadow-xl transition",
    selected ? "ring-2 ring-cyan-400" : "border-white/10",
    laneAccent[definition.lane],
  );

  const handlePortPointerDown = (
    direction: "input" | "output",
    portId: string,
    kind: NodeValueKind,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if (pendingConnection) {
      if (pendingConnection.type !== direction) {
        completeConnection(node.id, portId, direction);
        return;
      }
      if (
        pendingConnection.nodeId === node.id &&
        pendingConnection.portId === portId &&
        pendingConnection.type === direction
      ) {
        cancelConnection();
        return;
      }
    }
    beginConnection(direction, node.id, portId, kind, event);
  };

  return (
    <div
      data-node-card="true"
      className={cardClasses}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => onPointerDown(node.id, event)}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{node.label ?? definition.name}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {definition.category} · {definition.lane} lane
          </p>
        </div>
        <div className={clsx("h-3 w-3 rounded-full", statusStyle)} />
      </div>
      {runtime?.error ? (
        <p className="mt-2 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
          {runtime.error}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {definition.inputs.map((input) => {
            const edges = incomingEdges.filter((edge) => edge.to.portId === input.id);
            const connected = edges.length > 0;
            const portKey = getPortKey(node.id, input.id, "input");
            const isActive =
              pendingConnection &&
              pendingConnection.type === "output" &&
              areKindsCompatible(pendingConnection.kind, input.kind);
            return (
              <button
                key={input.id}
                ref={registerPort(portKey)}
                type="button"
                onPointerDown={(event) => {
                  handlePortPointerDown("input", input.id, input.kind, event);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  completeConnection(node.id, input.id, "input");
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  const first = edges[0];
                  if (first) disconnectEdge(first.id);
                }}
                onContextMenu={(event) => {
                  openPortMenu({
                    event,
                    edges,
                    nodeId: node.id,
                    portId: input.id,
                    direction: "input",
                  });
                }}
                className={clsx(
                  "flex w-full min-w-0 items-center justify-between rounded-xl border px-2 py-1 text-left transition",
                  connected ? "border-white/30 text-white" : "border-white/10 text-slate-400",
                  isActive && "border-cyan-400/70 bg-cyan-500/10",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={clsx("h-2 w-2 rounded-full", kindClass(input.kind))} />
                  <span className="truncate">{input.label}</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  {connected ? `${edges.length} link${edges.length > 1 ? "s" : ""}` : "open"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-28 flex-shrink-0">
          {previewDocument && definition.outputs.some((output) => output.kind === "PlotDocument") ? (
            <MiniPlotPreview document={previewDocument} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-3 text-[10px] text-slate-500">
              {definition.outputs.length ? `${definition.outputs.length} outputs` : "No outputs"}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {definition.outputs.map((output) => {
            const portKey = getPortKey(node.id, output.id, "output");
            const isActive =
              pendingConnection &&
              pendingConnection.type === "input" &&
              areKindsCompatible(output.kind, pendingConnection.kind);
            const portEdges = outgoingEdges.filter((edge) => edge.from.portId === output.id);
            const linkCount = portEdges.length;
            return (
              <button
                key={output.id}
                ref={registerPort(portKey)}
                type="button"
                onPointerDown={(event) => {
                  handlePortPointerDown("output", output.id, output.kind, event);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  completeConnection(node.id, output.id, "output");
                }}
                className={clsx(
                  "flex w-full min-w-0 items-center justify-between rounded-xl border px-2 py-1 text-left transition",
                  "border-white/10 text-slate-300",
                  isActive && "border-cyan-400/70 bg-cyan-500/10",
                )}
                onContextMenu={(event) =>
                  openPortMenu({
                    event,
                    edges: portEdges,
                    nodeId: node.id,
                    portId: output.id,
                    direction: "output",
                  })
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={clsx("h-2 w-2 rounded-full", kindClass(output.kind))} />
                  <span className="truncate">{output.label}</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  {linkCount ? `${linkCount} link${linkCount > 1 ? "s" : ""}` : "0 links"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NodePalette({
  position,
  structure,
  onSelect,
  onClose,
}: {
  position: { x: number; y: number };
  structure: PaletteLaneGroup[];
  onSelect: (definitionId: string) => void;
  onClose: () => void;
}) {
  const fallbackLane = structure[0]?.lane ?? "data";
  const fallbackCategory = structure[0]?.categories[0]?.id ?? "source";
  const [activeLane, setActiveLane] = useState<NodeLane>(fallbackLane);
  const [activeCategory, setActiveCategory] = useState<NodeCategory>(fallbackCategory);

  useEffect(() => {
    if (!structure.length) return;
    const laneEntry = structure.find((entry) => entry.lane === activeLane);
    if (!laneEntry) {
      setActiveLane(fallbackLane);
      setActiveCategory(fallbackCategory);
      return;
    }
    if (!laneEntry.categories.some((category) => category.id === activeCategory)) {
      setActiveCategory(laneEntry.categories[0]?.id ?? fallbackCategory);
    }
  }, [structure, activeLane, activeCategory, fallbackLane, fallbackCategory]);

  const activeLaneEntry = structure.find((entry) => entry.lane === activeLane);
  const categories = activeLaneEntry?.categories ?? [];
  const activeCategoryEntry = categories.find((category) => category.id === activeCategory);
  const nodes = activeCategoryEntry?.nodes ?? [];

  return (
    <div
      className="node-palette absolute z-20 w-[640px] max-w-[95vw] rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-xs text-white shadow-2xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Insert node</span>
        <button type="button" className="text-slate-200" onClick={onClose}>
          Esc
        </button>
      </div>
      {structure.length ? (
        <div className="flex gap-4">
          <div className="flex w-36 flex-col gap-1">
            {structure.map((lane) => (
              <button
                key={lane.lane}
                type="button"
                onClick={() => {
                  setActiveLane(lane.lane);
                  setActiveCategory(lane.categories[0]?.id ?? fallbackCategory);
                }}
                className={clsx(
                  "rounded-xl border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition",
                  activeLane === lane.lane
                    ? "border-cyan-400/60 bg-cyan-500/10 text-white"
                    : "border-white/10 text-slate-400 hover:border-white/30",
                )}
              >
                <span className="block text-white">{lane.label}</span>
                <span className="text-[10px] text-slate-400">{lane.categories.length} categories</span>
              </button>
            ))}
          </div>
          <div className="scroll-area max-h-[360px] w-48 flex-shrink-0 overflow-y-auto pr-1">
            {categories.length ? (
              categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={clsx(
                    "mb-1 w-full rounded-lg border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition",
                    activeCategory === category.id
                      ? "border-emerald-400/60 bg-emerald-500/10 text-white"
                      : "border-white/10 text-slate-400 hover:border-white/30",
                  )}
                >
                  {category.label}
                </button>
              ))
            ) : (
              <p className="text-[11px] text-slate-500">No categories in this lane yet.</p>
            )}
          </div>
          <div className="scroll-area max-h-[360px] flex-1 overflow-y-auto pr-1">
            {nodes.length ? (
              <div className="space-y-2">
                {nodes.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => onSelect(definition.id)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-cyan-400/50 hover:bg-white/10"
                  >
                    <span className="block text-sm font-semibold text-white">{definition.name}</span>
                    <span className="text-[10px] text-slate-400">{definition.description}</span>
                    <span className="text-[10px] text-slate-500">
                      Outputs: {definition.outputs.map((output) => output.label).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">No nodes in this category.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">No nodes available to insert yet.</p>
      )}
      <style jsx>{`
        .node-palette {
          backdrop-filter: blur(18px);
        }
        .node-palette .scroll-area {
          scrollbar-width: none;
          overscroll-behavior: contain;
        }
        .node-palette .scroll-area::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

function PortContextMenu({
  menu,
  disconnectEdge,
  onClose,
}: {
  menu: PortMenuState;
  disconnectEdge: (edgeId: string) => void;
  onClose: () => void;
}) {
  const hasEdges = menu.edges.length > 0;
  const directionLabel = menu.direction === "input" ? "Input" : "Output";

  const disconnect = (edgeIds: string[]) => {
    edgeIds.forEach((id) => disconnectEdge(id));
    onClose();
  };

  return (
    <div
      data-port-menu="true"
      className="absolute z-30"
      style={{ left: menu.screen.x, top: menu.screen.y }}
    >
      <div className="w-60 rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {directionLabel} links
        </p>
        {hasEdges ? (
          <ul className="mt-2 space-y-1 text-[11px]">
            {menu.edges.map((edge) => (
              <li
                key={edge.id}
                className="flex items-center justify-between rounded-lg border border-white/5 px-2 py-1"
              >
                <span className="truncate">
                  {menu.direction === "input"
                    ? `${edge.from.nodeId}.${edge.from.portId}`
                    : `${edge.to.nodeId}.${edge.to.portId}`}
                </span>
                <button
                  type="button"
                  className="text-rose-300"
                  onClick={() => disconnect([edge.id])}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">No connections yet.</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className={clsx(
              "flex-1 rounded-lg border px-2 py-1 text-sm transition",
              hasEdges ? "border-rose-400/40 text-rose-200 hover:bg-rose-500/10" : "border-white/10 text-slate-500",
            )}
            disabled={!hasEdges}
            onClick={() => disconnect(menu.edges.map((edge) => edge.id))}
          >
            Remove all
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-200 hover:border-white/30"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPortKey(nodeId: string, portId: string, type: "input" | "output") {
  return `${nodeId}:${portId}:${type}`;
}

function areKindsCompatible(a: NodeValueKind, b: NodeValueKind) {
  return a === b || a === "Any" || b === "Any";
}

function kindToColor(kind: NodeValueKind) {
  return KIND_HEX[kind] ?? "#94a3b8";
}

function kindClass(kind: NodeValueKind) {
  return KIND_CLASS[kind] ?? "bg-slate-500";
}

function getOutputDocument(definition: NodeDefinition, runtime?: NodeRuntimeState): PlotDocument | undefined {
  if (!runtime?.outputs) return undefined;
  const docOutput = definition.outputs.find((output) => output.kind === "PlotDocument");
  if (!docOutput) return undefined;
  return runtime.outputs[docOutput.id] as PlotDocument | undefined;
}

function arePortPositionsEqual(
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>,
) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const valueA = a[key];
    const valueB = b[key];
    if (!valueA || !valueB) return false;
    if (valueA.x !== valueB.x || valueA.y !== valueB.y) {
      return false;
    }
  }
  return true;
}
