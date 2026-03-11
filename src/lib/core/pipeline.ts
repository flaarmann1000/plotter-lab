import { ImageTransformConfig, NoiseTransformConfig, PlotControlConfig, WaveformRenderConfig } from "./config";
import { generateContourPolylines } from "./transforms/contours";
import { generateHatchLines } from "./transforms/hatching";
import { generateCrossHatch } from "./transforms/crossHatch";
import { generateFlowLines } from "./transforms/flowField";
import { generateHalftoneSpiral } from "./transforms/halftoneSpiral";
import { generateVoronoiPolylines } from "./transforms/voronoi";
import { buildWaveformPolylines, buildPolarSpectrum, buildTemporalRibbon } from "./transforms/waveform";
import { buildInterferenceField } from "./fields/interference";
import { computePlotStats } from "./plot/stats";
import { OptimizationSettings, optimizeDocument } from "./plot/optimize";
import {
  PlotDocument,
  PlotLayer,
  PlotStats,
  Polyline,
  ScalarField,
  SampledSignal,
  TransformMode,
} from "./types";
import { NoiseFieldConfig } from "./fields/noiseField";

export type ContourRunner = (
  input: Parameters<typeof generateContourPolylines>[0],
) => Promise<Polyline[]>;

export interface PipelineInputs {
  transform: TransformMode;
  imageField?: ScalarField;
  gradientField?: ScalarField;
  noiseField?: ScalarField;
  noiseFieldConfig: NoiseFieldConfig;
  audioSignal?: SampledSignal;
  imageConfig: ImageTransformConfig;
  noiseConfig: NoiseTransformConfig;
  waveformConfig: WaveformRenderConfig;
  plotConfig: PlotControlConfig;
  contourRunner?: ContourRunner;
}

export interface PipelineResult {
  document: PlotDocument;
  stats: PlotStats;
}

export async function buildPlotDocument(
  inputs: PipelineInputs,
): Promise<PipelineResult> {
  const contourRunner =
    inputs.contourRunner ?? (async (payload) => generateContourPolylines(payload));

  const {
    transform,
    imageField,
    gradientField,
    noiseField,
    noiseFieldConfig,
    audioSignal,
    imageConfig,
    noiseConfig,
    waveformConfig,
    plotConfig,
  } = inputs;

  let baseLayer: PlotLayer = {
    id: "layer-0",
    name: "Layer 1",
    color: "#0f172a",
    polylines: [],
  };
  let docWidth = 1000;
  let docHeight = 1000;

  if (transform === "image-brightness") {
    ensureField(imageField, "Load an image first to run brightness isolines.");
    const minValue = Math.min(imageConfig.low, imageConfig.high);
    const maxValue = Math.max(imageConfig.low, imageConfig.high);
    const thresholds = linspace(
      minValue,
      maxValue,
      Math.max(1, imageConfig.levels),
    );
    const polylines = await contourRunner({
      field: imageField,
      thresholds,
      smoothing: imageConfig.smoothing,
    });
    baseLayer = {
      ...baseLayer,
      name: "Brightness isolines",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "image-edges") {
    ensureField(gradientField, "Load an image first to run edge tracing.");
    const threshold = Math.max(0.01, Math.min(0.99, imageConfig.edgeThreshold));
    const polylines = await contourRunner({
      field: gradientField,
      thresholds: [threshold],
      smoothing: imageConfig.smoothing,
    });
    baseLayer = {
      ...baseLayer,
      name: "Edge trace",
      color: "#0f172a",
      polylines,
    };
    docWidth = gradientField.width;
    docHeight = gradientField.height;
  } else if (transform === "image-hatch") {
    ensureField(imageField, "Load an image first to run hatch conversion.");
    const polylines = generateHatchLines(imageField, {
      spacing: imageConfig.hatchSpacing,
      threshold: imageConfig.hatchThreshold,
      amplitude: imageConfig.hatchAmplitude,
      sampleStep: imageConfig.hatchSampleStep,
    });
    baseLayer = {
      ...baseLayer,
      name: "Hatching",
      color: "#111111",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "image-gradient-bands") {
    ensureField(gradientField, "Load an image to analyze gradients.");
    const minGrad = Math.min(imageConfig.gradientLow, imageConfig.gradientHigh);
    const maxGrad = Math.max(imageConfig.gradientLow, imageConfig.gradientHigh);
    const thresholds = linspace(
      minGrad,
      maxGrad,
      Math.max(1, imageConfig.gradientLevels),
    );
    const polylines = await contourRunner({
      field: gradientField,
      thresholds,
      smoothing: imageConfig.smoothing,
    });
    baseLayer = {
      ...baseLayer,
      name: "Gradient bands",
      color: "#0f172a",
      polylines,
    };
    docWidth = gradientField.width;
    docHeight = gradientField.height;
  } else if (transform === "image-cross-hatch") {
    ensureField(imageField, "Load an image for cross hatching.");
    const polylines = generateCrossHatch(imageField, {
      spacing: imageConfig.hatchSpacing,
      threshold: imageConfig.hatchThreshold,
      amplitude: imageConfig.hatchAmplitude,
      sampleStep: imageConfig.hatchSampleStep,
      families: imageConfig.crossHatchFamilies,
      angleDelta: imageConfig.crossHatchAngleDelta,
    });
    baseLayer = {
      ...baseLayer,
      name: "Cross hatch",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "image-ridgeline") {
    ensureField(gradientField, "Load an image to extract gradient ridges.");
    const thresholds = linspace(0.4, 0.98, Math.max(2, imageConfig.gradientLevels)).map(
      (value) => value ** 1.4,
    );
    const polylines = await contourRunner({
      field: gradientField,
      thresholds,
      smoothing: Math.min(1, imageConfig.smoothing + 0.1),
    });
    baseLayer = {
      ...baseLayer,
      name: "Ridgeline gradients",
      polylines,
    };
    docWidth = gradientField.width;
    docHeight = gradientField.height;
  } else if (transform === "image-stipple-flow") {
    ensureField(imageField, "Load an image to trace flow lines.");
    const polylines = generateFlowLines(imageField, {
      spacing: imageConfig.flowSpacing,
      flowLength: imageConfig.flowLength,
      step: imageConfig.flowStep,
      threshold: imageConfig.flowThreshold,
    });
    baseLayer = {
      ...baseLayer,
      name: "Stippling flow",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "image-halftone-spiral") {
    ensureField(imageField, "Load an image before generating halftone spirals.");
    const polylines = generateHalftoneSpiral(imageField, {
      turns: imageConfig.halftoneTurns,
      density: imageConfig.halftoneDensity,
    });
    baseLayer = {
      ...baseLayer,
      name: "Halftone spiral",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "image-voronoi") {
    ensureField(imageField, "Load an image before creating a Voronoi mosaic.");
    const polylines = generateVoronoiPolylines(imageField, {
      pointCount: imageConfig.voronoiPoints,
      relaxations: imageConfig.voronoiRelaxations,
    });
    baseLayer = {
      ...baseLayer,
      name: "Voronoi mosaic",
      polylines,
    };
    docWidth = imageField.width;
    docHeight = imageField.height;
  } else if (transform === "noise-isolines") {
    ensureField(noiseField, "Generate the noise field first.");
    const polylines = await contourRunner({
      field: noiseField,
      thresholds: linspace(0.05, 0.95, Math.max(1, noiseConfig.thresholds)),
      smoothing: noiseConfig.smoothing,
    });
    baseLayer = {
      ...baseLayer,
      name: "Noise contours",
      color: "#0ea5e9",
      polylines,
    };
    docWidth = noiseField.width;
    docHeight = noiseField.height;
  } else if (transform === "noise-wave-interference") {
    ensureField(noiseField, "Generate the noise field first.");
    const interferenceField = buildInterferenceField(noiseField, noiseFieldConfig, {
      mix: noiseConfig.interferenceMix,
      secondaryScale: noiseConfig.secondaryScale,
      secondaryOctaves: noiseConfig.secondaryOctaves,
    });
    const polylines = await contourRunner({
      field: interferenceField,
      thresholds: linspace(0.1, 0.9, Math.max(1, noiseConfig.thresholds + 2)),
      smoothing: Math.min(1, noiseConfig.smoothing + 0.1),
    });
    baseLayer = {
      ...baseLayer,
      name: "Wave interference",
      color: "#0284c7",
      polylines,
    };
    docWidth = interferenceField.width;
    docHeight = interferenceField.height;
  } else if (transform === "audio-waveform") {
    ensureSignal(audioSignal, "Import a WAV file first to render a waveform.");
    const polylines = buildWaveformPolylines(audioSignal, waveformConfig);
    baseLayer = {
      ...baseLayer,
      name: "Waveform",
      color: "#111111",
      polylines,
    };
    docWidth = waveformConfig.width;
    docHeight = waveformConfig.height;
  } else if (transform === "audio-polar-spectrum") {
    ensureSignal(audioSignal, "Import a WAV file first to render a spectrum.");
    const polylines = buildPolarSpectrum(audioSignal, waveformConfig);
    baseLayer = {
      ...baseLayer,
      name: "Polar spectrum",
      color: "#0f172a",
      polylines,
    };
    docWidth = waveformConfig.width;
    docHeight = waveformConfig.height;
  } else if (transform === "audio-ribbon") {
    ensureSignal(audioSignal, "Import a WAV file first to render a ribbon.");
    const polylines = buildTemporalRibbon(audioSignal, waveformConfig);
    baseLayer = {
      ...baseLayer,
      name: "Temporal ribbon",
      color: "#0f172a",
      polylines,
    };
    docWidth = waveformConfig.width;
    docHeight = waveformConfig.height;
  }

  const baseDocument: PlotDocument = {
    id: `plot-${Date.now()}`,
    width: docWidth,
    height: docHeight,
    layers: [baseLayer],
  };

  const optimization: OptimizationSettings = {
    simplifyTolerance: plotConfig.simplifyTolerance,
    minPathLength: plotConfig.minPathLength,
    joinTolerance: plotConfig.joinTolerance,
    orderStrategy: plotConfig.orderStrategy,
  };

  const optimized = optimizeDocument(baseDocument, optimization);
  const stats = computePlotStats(optimized);

  return { document: optimized, stats };
}

function linspace(start: number, end: number, count: number): number[] {
  if (count <= 1) {
    return [start];
  }

  const values: number[] = [];
  const step = (end - start) / (count - 1);
  for (let i = 0; i < count; i += 1) {
    values.push(start + i * step);
  }
  return values;
}

function ensureField(
  field: ScalarField | undefined,
  message: string,
): asserts field is ScalarField {
  if (!field) {
    throw new Error(message);
  }
}

function ensureSignal(
  signal: SampledSignal | undefined,
  message: string,
): asserts signal is SampledSignal {
  if (!signal) {
    throw new Error(message);
  }
}
