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
