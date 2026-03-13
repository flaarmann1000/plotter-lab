import { GraphEdge, GraphPreset, NodeGraph, NodeInstance } from "../types";
import { nodeLibrary } from "./library";

let nodeCounter = 0;
let edgeCounter = 0;

const defaultParameters = (definitionId: string) => {
  const definition = nodeLibrary[definitionId];
  const params: Record<string, unknown> = {};
  if (!definition) return params;
  definition.parameters.forEach((param) => {
    if (param.defaultValue !== undefined) {
      params[param.id] = param.defaultValue;
    } else if (param.type === "boolean") {
      params[param.id] = false;
    } else if (param.type === "number" || param.type === "integer") {
      params[param.id] = 0;
    } else {
      params[param.id] = "";
    }
  });
  return params;
};

const createNode = (
  definitionId: string,
  override: Partial<NodeInstance["parameters"]> = {},
): NodeInstance => {
  const definition = nodeLibrary[definitionId];
  return {
    id: `node-${nodeCounter += 1}`,
    definitionId,
    label: definition?.name,
    parameters: { ...defaultParameters(definitionId), ...override },
    lane: definition?.lane,
  };
};

const connect = (
  fromNode: NodeInstance,
  fromPort: string,
  toNode: NodeInstance,
  toPort: string,
): GraphEdge => ({
  id: `edge-${edgeCounter += 1}`,
  from: { nodeId: fromNode.id, portId: fromPort },
  to: { nodeId: toNode.id, portId: toPort },
});

const buildImageContourGraph = (): NodeGraph => {
  const image = createNode("source-image");
  const grayscale = createNode("convert-image-grayscale");
  const contours = createNode("geometry-contours", { levels: 8, rangeMin: 0.1, rangeMax: 0.9 });
  const simplify = createNode("path-simplify", { tolerance: 1.1 });
  const smooth = createNode("path-smooth", { window: 3, strength: 0.4 });
  const fragments = createNode("opt-remove-fragments", { minLength: 8 });
  const sort = createNode("opt-sort-paths", { joinTolerance: 12 });
  const orient = createNode("opt-orient-paths");
  const scale = createNode("layout-scale-to-page", { page: "letter-portrait", margin: 15 });
  const crop = createNode("layout-crop-page", { page: "letter-portrait" });
  const output = createNode("output-svg", { title: "Image Contours" });
  const stats = createNode("preview-geometry-stats");

  const nodes = [
    image,
    grayscale,
    contours,
    simplify,
    smooth,
    fragments,
    sort,
    orient,
    scale,
    crop,
    output,
    stats,
  ];

  const edges = [
    connect(image, "image", grayscale, "image"),
    connect(grayscale, "field", contours, "field"),
    connect(contours, "polylines", simplify, "paths"),
    connect(simplify, "polylines", smooth, "paths"),
    connect(smooth, "polylines", fragments, "paths"),
    connect(fragments, "polylines", sort, "paths"),
    connect(sort, "polylines", orient, "paths"),
    connect(orient, "polylines", scale, "geometry"),
    connect(scale, "polylines", crop, "geometry"),
    connect(crop, "polylines", output, "geometry"),
    connect(scale, "polylines", stats, "geometry"),
  ];

  return { nodes, edges };
};

const buildNoiseTerrainGraph = (): NodeGraph => {
  const noise = createNode("source-noise", { width: 720, height: 720, scale: 200, octaves: 4 });
  const blend = createNode("field-blend", { mode: "add" });
  const contours = createNode("geometry-contours", { levels: 10, rangeMin: 0.1, rangeMax: 0.9 });
  const simplify = createNode("path-simplify", { tolerance: 0.9 });
  const sort = createNode("opt-sort-paths", { joinTolerance: 10 });
  const orient = createNode("opt-orient-paths");
  const scale = createNode("layout-scale-to-page", { page: "a4-portrait", margin: 12 });
  const output = createNode("output-svg", { title: "Noise Terrain" });
  const stats = createNode("preview-geometry-stats");

  const nodes = [noise, blend, contours, simplify, sort, orient, scale, output, stats];
  const edges = [
    connect(noise, "field", blend, "a"),
    connect(noise, "field", blend, "b"),
    connect(blend, "result", contours, "field"),
    connect(contours, "polylines", simplify, "paths"),
    connect(simplify, "polylines", sort, "paths"),
    connect(sort, "polylines", orient, "paths"),
    connect(orient, "polylines", scale, "geometry"),
    connect(scale, "polylines", output, "geometry"),
    connect(scale, "polylines", stats, "geometry"),
  ];

  return { nodes, edges };
};

const buildAudioWaveGraph = (): NodeGraph => {
  const wav = createNode("source-wav");
  const envelope = createNode("convert-audio-envelope", { window: 0.01, smoothing: 0.5 });
  const waveform = createNode("geometry-waveform", { mode: "linear", sampleDensity: 1600, amplitude: 0.9 });
  const smooth = createNode("path-smooth", { window: 2, strength: 0.2 });
  const sort = createNode("opt-sort-paths", { joinTolerance: 20 });
  const scale = createNode("layout-scale-to-page", { page: "letter-landscape", margin: 12 });
  const output = createNode("output-svg", { title: "Audio Waveform" });
  const stats = createNode("preview-geometry-stats");

  const nodes = [wav, envelope, waveform, smooth, sort, scale, output, stats];
  const edges = [
    connect(wav, "audio", envelope, "audio"),
    connect(envelope, "envelope", waveform, "audio"),
    connect(waveform, "polylines", smooth, "paths"),
    connect(smooth, "polylines", sort, "paths"),
    connect(sort, "polylines", scale, "geometry"),
    connect(scale, "polylines", output, "geometry"),
    connect(scale, "polylines", stats, "geometry"),
  ];

  return { nodes, edges };
};

export const graphPresets: GraphPreset[] = [
  {
    id: "image-contours",
    name: "Image Contours",
    description: "Image -> grayscale -> contours -> cleanup -> export",
    graph: buildImageContourGraph(),
  },
  {
    id: "noise-terrain",
    name: "Noise Terrain",
    description: "Noise field -> blend -> contours -> export",
    graph: buildNoiseTerrainGraph(),
  },
  {
    id: "audio-wave",
    name: "Audio Waveform",
    description: "WAV -> waveform renderer -> layout -> export",
    graph: buildAudioWaveGraph(),
  },
];
