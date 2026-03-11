import { PageConfig } from "./export/pagePresets";
import { PathOrderStrategy } from "./plot/optimize";

export interface ImageTransformConfig {
  levels: number;
  low: number;
  high: number;
  smoothing: number;
  edgeThreshold: number;
  hatchSpacing: number;
  hatchThreshold: number;
  hatchAmplitude: number;
  hatchSampleStep: number;
  gradientLevels: number;
  gradientLow: number;
  gradientHigh: number;
  crossHatchFamilies: number;
  crossHatchAngleDelta: number;
  flowSpacing: number;
  flowLength: number;
  flowStep: number;
  flowThreshold: number;
  halftoneTurns: number;
  halftoneDensity: number;
  voronoiPoints: number;
  voronoiRelaxations: number;
  softLevels: number;
  softBlurRadius: number;
  dotSpacing: number;
  dotRadius: number;
  circleSpacing: number;
  circleRadius: number;
  circleSides: number;
  lineSpacing: number;
  lineLength: number;
  lineCount: number;
  lineAngleJog: number;
  triangleSpacing: number;
  triangleSize: number;
}

export interface NoiseTransformConfig {
  thresholds: number;
  smoothing: number;
  interferenceMix: number;
  secondaryScale: number;
  secondaryOctaves: number;
}

export interface WaveformRenderConfig {
  width: number;
  height: number;
  samplePoints: number;
  amplitude: number;
  smoothingWindow: number;
  mode: "single" | "stacked" | "circle" | "spiral";
  lineCount: number;
  stackSpacing: number;
  circleRadiusRatio: number;
  spiralTurns: number;
  spiralInnerRatio: number;
  spiralOuterRatio: number;
  spectrumBins: number;
  spectrumRadiusRatio: number;
  ribbonLayers: number;
  ribbonOffset: number;
  ribbonDrift: number;
}

export interface PlotControlConfig {
  simplifyTolerance: number;
  minPathLength: number;
  joinTolerance: number;
  orderStrategy: PathOrderStrategy;
  strokeWidth: number;
  showTravel: boolean;
  marginMm: number;
  scale: number;
  page: PageConfig;
}
