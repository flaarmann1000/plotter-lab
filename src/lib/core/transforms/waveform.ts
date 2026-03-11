import { WaveformRenderConfig } from "../config";
import { Polyline, SampledSignal } from "../types";

export function buildWaveformPolylines(
  signal: SampledSignal,
  config: WaveformRenderConfig,
): Polyline[] {
  const values = sampleSignal(
    signal.samples,
    config.samplePoints,
    config.smoothingWindow,
  );
  if (values.length < 2) return [];

  switch (config.mode) {
    case "stacked":
      return buildStackedLines(values, config);
    case "circle":
      return [buildCircularWave(values, config)];
    case "spiral":
      return [buildSpiralWave(values, config)];
    case "single":
    default:
      return [buildLinearWave(values, config, config.height / 2, "waveform-0")];
  }
}

export function buildPolarSpectrum(
  signal: SampledSignal,
  config: WaveformRenderConfig,
): Polyline[] {
  const bins = Math.max(6, config.spectrumBins);
  const binValues = computeSpectrum(signal.samples, bins);
  const minDim = Math.min(config.width, config.height);
  const baseRadius = clampRatio(config.spectrumRadiusRatio) * (minDim / 2);
  const amplitudeRadius = baseRadius * Math.max(0.1, config.amplitude);
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const polylines: Polyline[] = [];

  for (let i = 0; i < bins; i += 1) {
    const startAngle = (i / bins) * Math.PI * 2;
    const endAngle = ((i + 1) / bins) * Math.PI * 2;
    const steps = 16;
    const radius = baseRadius + binValues[i]! * amplitudeRadius;
    const points: { x: number; y: number }[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const angle =
        startAngle + ((endAngle - startAngle) * step) / Math.max(1, steps);
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
    polylines.push({
      id: `spectrum-${i}`,
      points,
    });
  }

  return polylines;
}

export function buildTemporalRibbon(
  signal: SampledSignal,
  config: WaveformRenderConfig,
): Polyline[] {
  const layers = Math.max(2, config.ribbonLayers);
  const offset = Math.max(4, config.ribbonOffset);
  const drift = config.ribbonDrift;
  const polylines: Polyline[] = [];
  const samplesPerPoint = Math.max(
    1,
    Math.floor(signal.samples.length / config.samplePoints),
  );

  for (let layer = 0; layer < layers; layer += 1) {
    const phaseOffset = layer * offset * samplesPerPoint;
    const values = sampleSignal(
      signal.samples,
      config.samplePoints,
      config.smoothingWindow,
      phaseOffset,
    );
    const centerY =
      (config.height / layers) * layer +
      config.ribbonOffset * 0.2 +
      (layer % 2 === 0 ? 0 : config.ribbonOffset * 0.1);
    const id = `ribbon-${layer}`;
    const polyline = buildLinearWave(values, config, centerY + layer * 0.5, id);
    polyline.points = polyline.points.map((point, index) => ({
      x: point.x + layer * drift * 0.02 + index * 0.02 * layer,
      y: point.y,
    }));
    polylines.push(polyline);
  }

  return polylines;
}

function sampleSignal(
  samples: Float32Array,
  targetPoints: number,
  smoothingWindow: number,
  phaseOffset = 0,
): number[] {
  if (!samples.length || targetPoints < 2) return [];
  const values: number[] = [];
  const samplesPerPoint = Math.max(1, Math.floor(samples.length / targetPoints));
  const smoothing = Math.max(1, smoothingWindow);

  for (let index = 0; index < targetPoints; index += 1) {
    const start = phaseOffset + index * samplesPerPoint;
    const window =
      smoothing === 1
        ? [samples[Math.min(start, samples.length - 1)] ?? 0]
        : collectSamples(samples, start, samplesPerPoint, smoothing);
    const avg =
      window.reduce((sum, value) => sum + value, 0) / Math.max(window.length, 1);
    values.push(Math.max(-1, Math.min(1, avg)));
  }

  return values;
}

function collectSamples(
  source: Float32Array,
  start: number,
  samplesPerPoint: number,
  smoothing: number,
): number[] {
  const values: number[] = [];
  const half = Math.floor(smoothing / 2);
  for (
    let i = start - half * samplesPerPoint;
    i < start + (half + 1) * samplesPerPoint;
    i += samplesPerPoint
  ) {
    const index = Math.min(source.length - 1, Math.max(0, i));
    values.push(source[index]!);
  }
  return values;
}

function buildLinearWave(
  values: number[],
  config: WaveformRenderConfig,
  centerY: number,
  id: string,
): Polyline {
  const amplitude = Math.max(0.01, config.amplitude);
  const width = config.width;
  const verticalSpan = (config.height / 2) * amplitude;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = centerY - value * verticalSpan;
    return { x, y };
  });
  return { id, points };
}

function buildStackedLines(
  values: number[],
  config: WaveformRenderConfig,
): Polyline[] {
  const count = Math.max(1, config.lineCount);
  const spacing = Math.max(20, config.stackSpacing);
  const totalSpan = spacing * (count - 1);
  const startY = config.height / 2 - totalSpan / 2;
  const polylines: Polyline[] = [];
  for (let i = 0; i < count; i += 1) {
    const centerY = startY + i * spacing;
    polylines.push(
      buildLinearWave(values, config, centerY, `waveform-stacked-${i}`),
    );
  }
  return polylines;
}

function buildCircularWave(
  values: number[],
  config: WaveformRenderConfig,
): Polyline {
  const minDim = Math.min(config.width, config.height);
  const baseRadius = clampRatio(config.circleRadiusRatio) * (minDim / 2);
  const amplitudeRadius = baseRadius * Math.max(0.1, config.amplitude);
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const points = values.map((value, index) => {
    const angle = (index / (values.length - 1)) * Math.PI * 2;
    const radius = Math.max(
      10,
      baseRadius + value * amplitudeRadius,
    );
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
  if (points.length) {
    points.push({ ...points[0]! });
  }
  return {
    id: "waveform-circle",
    points,
    closed: true,
  };
}

function buildSpiralWave(
  values: number[],
  config: WaveformRenderConfig,
): Polyline {
  const minDim = Math.min(config.width, config.height);
  const inner = clampRatio(config.spiralInnerRatio) * (minDim / 2);
  const outer = clampRatio(config.spiralOuterRatio) * (minDim / 2);
  const baseOuter = Math.max(inner + 10, outer);
  const turns = Math.max(1, config.spiralTurns);
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const radiusRange = Math.max(10, baseOuter - inner);
  const amplitudeRadius = radiusRange * Math.max(0.05, config.amplitude);

  const points = values.map((value, index) => {
    const t = index / (values.length - 1 || 1);
    const angle = t * Math.PI * 2 * turns;
    const baseRadius = inner + t * radiusRange;
    const radius = Math.max(
      5,
      baseRadius + value * amplitudeRadius,
    );
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return {
    id: "waveform-spiral",
    points,
  };
}

function clampRatio(value: number) {
  return Math.max(0.05, Math.min(0.9, value));
}

function computeSpectrum(samples: Float32Array, bins: number) {
  const windowSize = Math.max(32, Math.floor(samples.length / bins));
  const values: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const start = i * windowSize;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < windowSize && start + j < samples.length; j += 1) {
      const value = samples[start + j] ?? 0;
      sum += Math.abs(value);
      count += 1;
    }
    values.push(count ? sum / count : 0);
  }
  const max = Math.max(...values, 1);
  return values.map((v) => v / max);
}
