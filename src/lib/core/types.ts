export type SourceKind = "image" | "noise" | "audio";

export type TransformMode =
  | "image-brightness"
  | "image-edges"
  | "image-hatch"
  | "image-gradient-bands"
  | "image-cross-hatch"
  | "image-ridgeline"
  | "image-stipple-flow"
  | "image-halftone-spiral"
  | "image-voronoi"
  | "image-soft-isolines"
  | "image-dot-grid"
  | "image-circle-grid"
  | "image-line-clusters"
  | "image-triangle-grid"
  | "noise-isolines"
  | "noise-wave-interference"
  | "audio-waveform"
  | "audio-polar-spectrum"
  | "audio-ribbon";

export interface ScalarField {
  width: number;
  height: number;
  /**
   * Flat array of scalar samples laid out row-major. Values should be normalized to 0..1.
   */
  data: Float32Array;
}

export interface SampledSignal {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface ImagePixels {
  width: number;
  height: number;
  channels: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

export interface Polyline {
  id: string;
  points: Point[];
  closed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlotLayer {
  id: string;
  name: string;
  color: string;
  polylines: Polyline[];
}

export interface PlotDocument {
  id: string;
  width: number;
  height: number;
  layers: PlotLayer[];
  metadata?: Record<string, unknown>;
}

export interface PlotStats {
  pathCount: number;
  segmentCount: number;
  penDownLength: number;
  penUpLength: number;
  totalTravel: number;
}

export interface PlotTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Node-editor payloads -------------------------------------------------------
 */

export interface Mask {
  width: number;
  height: number;
  data: Uint8Array | Float32Array;
  mode: "binary" | "grayscale";
}

export interface VectorField {
  width: number;
  height: number;
  /**
   * Interleaved XY components sized width * height * 2.
   */
  data: Float32Array;
  normalized?: boolean;
}

export interface DistanceField extends ScalarField {
  /**
   * Optional normalization factor useful when remapping the field.
   */
  maxDistance?: number;
}

export interface SpectrumData {
  /**
   * Number of FFT bins per frame.
   */
  bins: number;
  /**
   * Number of frames contained in the data.
   */
  frames: number;
  /**
   * Row-major Float32 array of size bins * frames.
   */
  data: Float32Array;
  sampleRate: number;
  windowSize: number;
  overlap: number;
}

export interface EnvelopeData {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface PointSet {
  id: string;
  points: Point[];
  metadata?: Record<string, unknown>;
}

export interface PolylineSet {
  id: string;
  polylines: Polyline[];
  metadata?: Record<string, unknown>;
}

export interface CurveSet {
  id: string;
  curves: Polyline[];
  metadata?: Record<string, unknown>;
}

export interface LayeredGeometry {
  layers: PlotLayer[];
  metadata?: Record<string, unknown>;
}

export interface ColorPalette {
  name?: string;
  colors: string[];
  metadata?: Record<string, unknown>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform2D {
  translate: { x: number; y: number };
  scale: { x: number; y: number };
  rotate: number;
  shear?: { x: number; y: number };
}

export interface SelectionRegion {
  bounds: BoundingBox;
  mask?: Mask;
  points?: PointSet;
  metadata?: Record<string, unknown>;
}

export interface SeedState {
  seed: string;
  /**
   * Serialized random state so deterministic nodes can resume.
   */
  randomState?: number[];
}

export type RandomState = SeedState;
export type Seed = SeedState;
export type Selection = SelectionRegion;
export type Region = SelectionRegion;

export type NodeValueKind =
  | "ImageData"
  | "Mask"
  | "ScalarField"
  | "VectorField"
  | "DistanceField"
  | "AudioSignal"
  | "SpectrumData"
  | "EnvelopeData"
  | "PointSet"
  | "PolylineSet"
  | "CurveSet"
  | "LayeredGeometry"
  | "PlotDocument"
  | "PlotStats"
  | "ColorPalette"
  | "BoundingBox"
  | "Transform2D"
  | "Selection"
  | "Region"
  | "Seed"
  | "RandomState"
  | "Number"
  | "Vector2"
  | "Color"
  | "Boolean"
  | "Any";

export type NodeCategory =
  | "source"
  | "conversion"
  | "field"
  | "vectorField"
  | "audio"
  | "geometry"
  | "path"
  | "optimization"
  | "layout"
  | "layer"
  | "preview"
  | "output"
  | "utility"
  | "macro";

export type NodeLane = "data" | "geometry" | "plot" | "global";

export type NodeMaturity = "mvp" | "second-wave" | "advanced";

export interface NodeParameterOption {
  label: string;
  value: string | number;
  description?: string;
}

export interface NodeParameterDefinition {
  id: string;
  label: string;
  type: "number" | "integer" | "boolean" | "enum" | "vector2" | "color" | "text";
  description?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: NodeParameterOption[];
  unit?: string;
}

export interface NodePortDefinition {
  id: string;
  label: string;
  description?: string;
  kind: NodeValueKind;
  acceptsMultiple?: boolean;
  required?: boolean;
}

export interface NodeDefinition {
  id: string;
  name: string;
  description: string;
  category: NodeCategory;
  lane: NodeLane;
  maturity: NodeMaturity;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  parameters: NodeParameterDefinition[];
  tags?: string[];
  variants?: string[];
}

export type NodeLibrary = Record<string, NodeDefinition>;

export type AudioSignal = SampledSignal;

export interface NodeInstance {
  id: string;
  definitionId: string;
  label?: string;
  parameters: Record<string, unknown>;
  lane?: NodeLane;
  position?: { x: number; y: number };
}

export interface NodeSocketRef {
  nodeId: string;
  portId: string;
}

export interface GraphEdge {
  id: string;
  from: NodeSocketRef;
  to: NodeSocketRef;
}

export interface NodeGraph {
  nodes: NodeInstance[];
  edges: GraphEdge[];
}

export interface GraphPreset {
  id: string;
  name: string;
  description: string;
  category?: string;
  graph: NodeGraph;
}

export type NodeRunStatus = "idle" | "running" | "success" | "error";

export interface NodeRuntimeState {
  status: NodeRunStatus;
  error?: string;
  outputs?: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
}

export interface GraphEvaluationResult {
  document?: PlotDocument;
  stats?: PlotStats;
  nodeStates: Record<string, NodeRuntimeState>;
}
