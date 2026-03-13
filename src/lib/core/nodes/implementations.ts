import { Delaunay } from "d3-delaunay";
import { buildPolarSpectrum, buildTemporalRibbon, buildWaveformPolylines } from "../transforms/waveform";
import { generateContourPolylines } from "../transforms/contours";
import { generateHatchLines } from "../transforms/hatching";
import { generateCrossHatch } from "../transforms/crossHatch";
import { generateFlowLines } from "../transforms/flowField";
import { generateVoronoiPolylines } from "../transforms/voronoi";
import { generateDotGrid, generateCircleGrid, generateLineClusters, generateTriangleGrid } from "../transforms/shapeGrids";
import { generateHalftoneSpiral } from "../transforms/halftoneSpiral";
import { generateNoiseField, NoiseFieldConfig } from "../fields/noiseField";
import { blurScalarField } from "../fields/blur";
import {
  blendScalarFields,
  invertScalarField,
  levelsScalarField,
  mapScalarField,
  normalizeScalarField,
} from "../fields/ops";
import {
  BoundingBox,
  ColorPalette,
  DistanceField,
  EnvelopeData,
  LayeredGeometry,
  Mask,
  Point,
  PointSet,
  PlotDocument,
  PlotLayer,
  PlotStats,
  Polyline,
  PolylineSet,
  ScalarField,
  SampledSignal,
  SpectrumData,
  VectorField,
  SeedState,
  RandomState,
} from "../types";
import { simplifyPolyline } from "../plot/optimize";
import {
  removeTinyFragments,
  sortPaths,
  orientPaths,
  joinNearbyEndpoints,
} from "../plot/pathOps";
import {
  combineBounds,
  computePolylineBounds,
  distance,
  polylineLength,
} from "../geometry";
import { PAGE_PRESETS, PagePresetId, resolvePageSize } from "../export/pagePresets";
import { NodeImplementationContext } from "./runtime";
import { ContourRunner } from "../pipeline";
import { computePlotStats } from "../plot/stats";
import { WaveformRenderConfig } from "../config";

interface ImplementationResult {
  [key: string]: unknown;
}

type Impl = (ctx: NodeImplementationContext) => Promise<ImplementationResult> | ImplementationResult;

interface ImageSourceAsset {
  image?: {
    grayscale: ScalarField;
    gradient: ScalarField;
    metadata: Record<string, unknown>;
    pixels: {
      width: number;
      height: number;
      channels: number;
      data: Uint8ClampedArray;
    };
  };
}

interface AudioSourceAsset {
  audio?: SampledSignal;
}

const asPolylineSet = (nodeId: string, polylines: Polyline[]): PolylineSet => ({
  id: `${nodeId}-polyset`,
  polylines: polylines.map((polyline, index) => ({
    ...polyline,
    id: polyline.id ?? `${nodeId}-${index}`,
  })),
});

const toNumber = (value: unknown, fallback: number): number => {
  const num = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(num) ? Number(num) : fallback;
};

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const linspace = (start: number, end: number, count: number) => {
  if (count <= 1) {
    return [start];
  }
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
};

const parseWeights = (value: unknown): [number, number, number] | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parts = value
    .split(/[,/\\s]+/)
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num));
  if (parts.length >= 3) {
    return [parts[0]!, parts[1]!, parts[2]!];
  }
  return undefined;
};

const rgbToHsv = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  return { h: h / 360, s, v: max };
};

const parseVector2 = (
  value: unknown,
  fallback: { x: number; y: number } = { x: 0, y: 0 },
) => {
  if (
    value &&
    typeof value === "object" &&
    "x" in value &&
    "y" in value &&
    Number.isFinite(Number((value as { x: unknown }).x)) &&
    Number.isFinite(Number((value as { y: unknown }).y))
  ) {
    return { x: Number((value as { x: number }).x), y: Number((value as { y: number }).y) };
  }
  return fallback;
};

const duplicatePolylineSet = (set: PolylineSet): PolylineSet => ({
  id: `${set.id}-copy`,
  polylines: set.polylines.map((line) => ({
    ...line,
    points: line.points.map((pt) => ({ ...pt })),
  })),
});

const getSetBounds = (set: PolylineSet) => {
  const boxes = set.polylines
    .map((polyline) => computePolylineBounds(polyline))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  return boxes.length ? combineBounds(boxes) : null;
};

const smoothPolylinePoints = (
  polyline: Polyline,
  windowSize: number,
  strength: number,
): Polyline => {
  const window = Math.max(1, Math.floor(windowSize));
  if (window <= 1 || strength <= 0) {
    return polyline;
  }
  const half = Math.floor(window / 2);
  const smoothed = polyline.points.map((point, index, points) => {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (
      let i = Math.max(0, index - half);
      i <= Math.min(points.length - 1, index + half);
      i += 1
    ) {
      sumX += points[i]!.x;
      sumY += points[i]!.y;
      count += 1;
    }
    const avgX = sumX / Math.max(1, count);
    const avgY = sumY / Math.max(1, count);
    return {
      x: point.x * (1 - strength) + avgX * strength,
      y: point.y * (1 - strength) + avgY * strength,
    };
  });

  return { ...polyline, points: smoothed };
};

const interpolatePoint = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function resamplePolyline(polyline: Polyline, spacing: number): Polyline {
  if (polyline.points.length < 2 || spacing <= 0) {
    return polyline;
  }
  const result: Point[] = [{ ...polyline.points[0]! }];
  let carry = 0;
  for (let i = 1; i < polyline.points.length; i += 1) {
    let start = polyline.points[i - 1]!;
    const end = polyline.points[i]!;
    let segmentLength = distance(start, end);
    if (segmentLength === 0) continue;
    while (carry + segmentLength >= spacing) {
      const needed = spacing - carry;
      const t = needed / segmentLength;
      const point = interpolatePoint(start, end, t);
      result.push(point);
      start = point;
      segmentLength -= needed;
      carry = 0;
    }
    carry += segmentLength;
  }
  const last = polyline.points[polyline.points.length - 1];
  if (last) {
    result.push({ ...last });
  }
  return { ...polyline, points: result };
}

function trimPolylineRange(
  polyline: Polyline,
  startDistance: number,
  endDistance: number,
): Polyline | null {
  const totalLength = polylineLength(polyline);
  const start = Math.max(0, Math.min(totalLength, startDistance));
  const end = Math.max(start, Math.min(totalLength, endDistance));
  if (end - start <= 1e-3) return null;
  const points: Point[] = [];
  let traveled = 0;
  for (let i = 1; i < polyline.points.length; i += 1) {
    const a = polyline.points[i - 1]!;
    const b = polyline.points[i]!;
    const segment = distance(a, b);
    const segStart = traveled;
    const segEnd = traveled + segment;
    if (segEnd <= start) {
      traveled = segEnd;
      continue;
    }
    if (segStart >= end) break;
    const localStart = Math.max(segStart, start);
    const localEnd = Math.min(segEnd, end);
    const t0 = segment ? (localStart - segStart) / segment : 0;
    const t1 = segment ? (localEnd - segStart) / segment : 0;
    if (!points.length) {
      points.push(interpolatePoint(a, b, t0));
    }
    points.push(interpolatePoint(a, b, t1));
    traveled = segEnd;
  }
  return points.length > 1 ? { ...polyline, points } : null;
}

function splitPolylineByLength(polyline: Polyline, maxLength: number): Polyline[] {
  if (maxLength <= 0) return [polyline];
  const segments: Polyline[] = [];
  const total = polylineLength(polyline);
  for (let start = 0; start < total; start += maxLength) {
    const slice = trimPolylineRange(polyline, start, Math.min(total, start + maxLength));
    if (slice) {
      segments.push({ ...slice, id: `${polyline.id}-seg-${segments.length}` });
    }
  }
  return segments.length ? segments : [polyline];
}

function dashPolyline(polyline: Polyline, pattern: number[], phase: number): Polyline[] {
  if (!pattern.length) return [polyline];
  const sanitized = pattern.map((value) => Math.max(1e-3, value));
  const cycle = sanitized.reduce((sum, value) => sum + value, 0);
  let offset = ((phase % cycle) + cycle) % cycle;
  let idx = 0;
  let dashRemaining = sanitized[0]! - offset;
  let dashOn = true;
  while (dashRemaining <= 0) {
    idx = (idx + 1) % sanitized.length;
    dashOn = !dashOn;
    dashRemaining += sanitized[idx]!;
  }
  const slices: Polyline[] = [];
  let currentSlice: Point[] = [];
  for (let i = 1; i < polyline.points.length; i += 1) {
    let start = polyline.points[i - 1]!;
    const end = polyline.points[i]!;
    let segment = distance(start, end);
    if (segment === 0) continue;
    while (segment > 0) {
      const step = Math.min(segment, dashRemaining);
      const t = step / segment;
      const point = interpolatePoint(start, end, t);
      if (dashOn) {
        if (!currentSlice.length) currentSlice.push({ ...start });
        currentSlice.push(point);
      }
      start = point;
      segment -= step;
      dashRemaining -= step;
      if (dashRemaining <= 1e-3) {
        if (dashOn && currentSlice.length > 1) {
          slices.push({ ...polyline, id: `${polyline.id}-dash-${slices.length}`, points: currentSlice });
        }
        currentSlice = [];
        idx = (idx + 1) % sanitized.length;
        dashOn = !dashOn;
        dashRemaining = sanitized[idx]!;
      }
    }
  }
  if (dashOn && currentSlice.length > 1) {
    slices.push({ ...polyline, id: `${polyline.id}-dash-${slices.length}`, points: currentSlice });
  }
  return slices.length ? slices : [polyline];
}

function jitterPolyline(
  polyline: Polyline,
  amplitude: number,
  frequency: number,
  seed: string,
): Polyline {
  if (amplitude <= 0) return polyline;
  const random = seededRandom(seed);
  const points = polyline.points.map((point, index) => {
    const angle = random() * TAU;
    const noise = Math.sin(index * frequency + angle) * amplitude;
    return {
      x: point.x + Math.cos(angle) * noise,
      y: point.y + Math.sin(angle) * noise,
    };
  });
  return { ...polyline, points };
}

function offsetPolyline(
  polyline: Polyline,
  distance: number,
  side: "left" | "right" | "both",
): Polyline[] {
  if (Math.abs(distance) < 1e-3) return [polyline];
  const normals = polyline.points.map((_, index) => {
    const prev = polyline.points[Math.max(0, index - 1)]!;
    const next = polyline.points[Math.min(polyline.points.length - 1, index + 1)]!;
    const vx = next.x - prev.x;
    const vy = next.y - prev.y;
    const length = Math.hypot(vx, vy) || 1;
    return { x: -vy / length, y: vx / length };
  });
  const buildOffset = (sign: number) => ({
    ...polyline,
    id: `${polyline.id}-offset-${sign > 0 ? "r" : "l"}`,
    points: polyline.points.map((point, index) => ({
      x: point.x + normals[index]!.x * distance * sign,
      y: point.y + normals[index]!.y * distance * sign,
    })),
  });
  if (side === "both") {
    return [buildOffset(1), buildOffset(-1)];
  }
  return [buildOffset(side === "right" ? 1 : -1)];
}

function dedupePolylines(polylines: Polyline[], tolerance: number): Polyline[] {
  const seen = new Set<string>();
  const factor = Math.max(1e-3, tolerance);
  return polylines.filter((polyline) => {
    if (!polyline.points.length) return false;
    const start = polyline.points[0]!;
    const end = polyline.points[polyline.points.length - 1]!;
    const key = [start.x, start.y, end.x, end.y]
      .map((value) => Math.round(value / factor))
      .join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const normalizedMaskDataCache = new WeakMap<Mask, Float32Array>();

function getMaskData(mask: Mask): Float32Array {
  if (mask.data instanceof Float32Array) return mask.data;
  const cached = normalizedMaskDataCache.get(mask);
  if (cached) return cached;
  const normalized = new Float32Array(mask.data.length);
  for (let i = 0; i < mask.data.length; i += 1) {
    normalized[i] = (mask.data[i] ?? 0) / 255;
  }
  normalizedMaskDataCache.set(mask, normalized);
  return normalized;
}

function sampleMaskValue(mask: Mask, point: Point): number {
  const x = Math.max(0, Math.min(mask.width - 1, point.x));
  const y = Math.max(0, Math.min(mask.height - 1, point.y));
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const index = iy * mask.width + ix;
  const source = getMaskData(mask);
  return source[index] ?? 0;
}

function spectrumToField(
  spectrum: SpectrumData,
  timeScale: number,
  frequencyScale: number,
  normalizeOutput: boolean,
  logFrequency: boolean,
): ScalarField {
  const width = Math.max(4, Math.round(spectrum.frames * timeScale));
  const height = Math.max(4, Math.round(spectrum.bins * frequencyScale));
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(spectrum.frames - 1, Math.floor((x / width) * spectrum.frames));
      let srcY = Math.min(spectrum.bins - 1, Math.floor((y / height) * spectrum.bins));
      if (logFrequency) {
        const logY = Math.log10(((y + 1) / height) * 9 + 1);
        srcY = Math.min(spectrum.bins - 1, Math.floor(logY * spectrum.bins));
      }
      data[y * width + x] = spectrum.data[srcY * spectrum.frames + srcX] ?? 0;
    }
  }
  if (normalizeOutput) {
    let maxValue = 0;
    for (let i = 0; i < data.length; i += 1) {
      maxValue = Math.max(maxValue, data[i]!);
    }
    if (maxValue > 0) {
      for (let i = 0; i < data.length; i += 1) {
        data[i] = data[i]! / maxValue;
      }
    }
  }
  return { width, height, data };
}

function rotatePolylines(
  polylines: Polyline[],
  angleDeg: number,
  center: { x: number; y: number },
): Polyline[] {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return polylines.map((polyline, index) => ({
    ...polyline,
    id: `${polyline.id}-rot-${index}`,
    points: polyline.points.map((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
      };
    }),
  }));
}

const clipPolylineSetToBounds = (
  set: PolylineSet,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): PolylineSet => {
  const clippedPolylines: Polyline[] = [];
  set.polylines.forEach((polyline) => {
    let current: Polyline | null = null;
    const flushCurrent = () => {
      if (current && current.points.length > 1) {
        clippedPolylines.push(current);
      }
      current = null;
    };
    polyline.points.forEach((point) => {
      const inside =
        point.x >= bounds.minX &&
        point.x <= bounds.maxX &&
        point.y >= bounds.minY &&
        point.y <= bounds.maxY;
      if (inside) {
        if (!current) {
          current = { ...polyline, points: [] };
        }
        current.points.push({ ...point });
      } else if (current && current.points.length > 1) {
        clippedPolylines.push(current);
        current = null;
      } else {
        current = null;
      }
    });
    flushCurrent();
  });
  return { id: `${set.id}-clipped`, polylines: clippedPolylines };
};

const transformPolylineSet = (
  set: PolylineSet,
  transform: {
    scaleX?: number;
    scaleY?: number;
    translateX?: number;
    translateY?: number;
    rotate?: number;
  },
): PolylineSet => {
  const angle = ((transform.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const translated = set.polylines.map((polyline) => ({
    ...polyline,
    points: polyline.points.map((point) => {
      let x = point.x * scaleX;
      let y = point.y * scaleY;
      if (angle !== 0) {
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        x = rx;
        y = ry;
      }
      return {
        x: x + (transform.translateX ?? 0),
        y: y + (transform.translateY ?? 0),
      };
    }),
  }));
  return { id: `${set.id}-transform`, polylines: translated };
};

const TAU = Math.PI * 2;

function createScalarField(
  width: number,
  height: number,
  sampler: (x: number, y: number, index: number) => number,
): ScalarField {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      data[index] = sampler(x, y, index);
    }
  }
  return { width, height, data };
}

function sampleField(field: ScalarField, x: number, y: number) {
  const clampedX = Math.min(field.width - 1, Math.max(0, x));
  const clampedY = Math.min(field.height - 1, Math.max(0, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const idx = (yy: number, xx: number) => yy * field.width + xx;
  const v00 = field.data[idx(y0, x0)] ?? 0;
  const v10 = field.data[idx(y0, x1)] ?? 0;
  const v01 = field.data[idx(y1, x0)] ?? 0;
  const v11 = field.data[idx(y1, x1)] ?? 0;
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

function resampleScalarField(field: ScalarField, width: number, height: number): ScalarField {
  return createScalarField(width, height, (x, y) => {
    const u = (x / Math.max(1, width - 1)) * (field.width - 1);
    const v = (y / Math.max(1, height - 1)) * (field.height - 1);
    return sampleField(field, u, v);
  });
}

function cropScalarField(field: ScalarField, x: number, y: number, width: number, height: number): ScalarField {
  const data = new Float32Array(width * height);
  for (let yy = 0; yy < height; yy += 1) {
    for (let xx = 0; xx < width; xx += 1) {
      const srcX = Math.min(field.width - 1, Math.max(0, x + xx));
      const srcY = Math.min(field.height - 1, Math.max(0, y + yy));
      data[yy * width + xx] = field.data[srcY * field.width + srcX] ?? 0;
    }
  }
  return { width, height, data };
}

function applyBiasGain(value: number, bias: number, gain: number) {
  const biased = Math.pow(value, Math.log(bias) / Math.log(0.5));
  const g = (Math.pow(biased, gain) - 0.5) * (1 - gain) + 0.5;
  return Math.min(1, Math.max(0, g));
}

function clampField(field: ScalarField, minValue: number, maxValue: number): ScalarField {
  return mapScalarField(field, (value) => Math.min(maxValue, Math.max(minValue, value)));
}

function createVectorField(
  width: number,
  height: number,
  sampler: (x: number, y: number, index: number) => { x: number; y: number },
): VectorField {
  const data = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const vector = sampler(x, y, index);
      data[index * 2] = vector.x;
      data[index * 2 + 1] = vector.y;
    }
  }
  return { width, height, data };
}

function expectVectorField(value: unknown, nodeName: string): VectorField {
  const field = value as VectorField | undefined;
  if (!field || !(field.data instanceof Float32Array)) {
    throw new Error(`${nodeName} expects a VectorField input.`);
  }
  return field;
}

function mapVectorField(
  field: VectorField,
  mapper: (vector: { x: number; y: number }, index: number) => { x: number; y: number },
): VectorField {
  const data = new Float32Array(field.data.length);
  for (let i = 0; i < field.width * field.height; i += 1) {
    const x = field.data[i * 2] ?? 0;
    const y = field.data[i * 2 + 1] ?? 0;
    const next = mapper({ x, y }, i);
    data[i * 2] = next.x;
    data[i * 2 + 1] = next.y;
  }
  return { width: field.width, height: field.height, data };
}

function sampleVector(field: VectorField, x: number, y: number) {
  const clampedX = Math.max(0, Math.min(field.width - 1, x));
  const clampedY = Math.max(0, Math.min(field.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tX = clampedX - x0;
  const tY = clampedY - y0;
  const read = (xx: number, yy: number) => {
    const index = (yy * field.width + xx) * 2;
    return {
      x: field.data[index] ?? 0,
      y: field.data[index + 1] ?? 0,
    };
  };
  const v00 = read(x0, y0);
  const v10 = read(x1, y0);
  const v01 = read(x0, y1);
  const v11 = read(x1, y1);
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
    x: a.x * (1 - t) + b.x * t,
    y: a.y * (1 - t) + b.y * t,
  });
  const top = lerp(v00, v10, tX);
  const bottom = lerp(v01, v11, tX);
  return lerp(top, bottom, tY);
}

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)!;
    hash |= 0;
  }
  let state = hash || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state < 0 ? ~state + 1 : state) % 1000) / 1000;
  };
}

function createPointSet(points: Point[]): PointSet {
  return {
    id: `points-${Date.now()}`,
    points,
    metadata: { count: points.length },
  };
}

function polylineFromPoints(points: Point[], closed = true): Polyline {
  const pts = points.map((point) => ({ ...point }));
  if (closed && points.length > 1) {
    pts.push({ ...points[0]! });
  }
  return {
    id: `poly-${Date.now()}`,
    points: pts,
    closed,
  };
}

function rotatePoint(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function geometryBounds(geometry: PolylineSet): BoundingBox | null {
  const points = geometry.polylines.flatMap((polyline) => polyline.points);
  if (!points.length) return null;
  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function rasterizeGeometryToMask(
  geometry: PolylineSet,
  resolution: number,
  mode: "fill" | "outline",
): Mask {
  const bounds = geometryBounds(geometry) ?? { x: 0, y: 0, width: 1, height: 1 };
  const width = Math.max(4, Math.round(resolution));
  const height = Math.max(4, Math.round((resolution * bounds.height) / Math.max(bounds.width, 1)));
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const worldPoint = {
        x: bounds.x + (x / Math.max(1, width - 1)) * bounds.width,
        y: bounds.y + (y / Math.max(1, height - 1)) * bounds.height,
      };
      let value = 0;
      geometry.polylines.forEach((polyline) => {
        if (mode === "outline") {
          for (let i = 0; i < polyline.points.length - 1; i += 1) {
            const a = polyline.points[i]!;
            const b = polyline.points[i + 1]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSq = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((worldPoint.x - a.x) * dx + (worldPoint.y - a.y) * dy) / lengthSq));
            const closest = { x: a.x + dx * t, y: a.y + dy * t };
            const dist = Math.hypot(worldPoint.x - closest.x, worldPoint.y - closest.y);
            if (dist < Math.max(bounds.width, bounds.height) / resolution) {
              value = 1;
              break;
            }
          }
        } else if (pointInPolygon(worldPoint, polyline.points)) {
          value = 1;
        }
      });
      data[y * width + x] = value;
    }
  }
  return { width, height, data, mode: "grayscale" };
}

function expectPolylineSet(value: unknown, nodeName: string): PolylineSet {
  const set = value as PolylineSet | undefined;
  if (!set || !Array.isArray(set.polylines)) {
    throw new Error(`${nodeName} expects a PolylineSet input.`);
  }
  return set;
}

function expectScalarField(value: unknown, nodeName: string): ScalarField {
  const field = value as ScalarField | undefined;
  if (!field || !(field.data instanceof Float32Array)) {
    throw new Error(`${nodeName} expects a ScalarField input.`);
  }
  return field;
}

function getImageAsset(ctx: NodeImplementationContext): ImageSourceAsset["image"] {
  return ctx.resources.assets[ctx.node.id]?.image as ImageSourceAsset["image"];
}

function getAudioAsset(ctx: NodeImplementationContext): SampledSignal | undefined {
  return ctx.resources.assets[ctx.node.id]?.audio as SampledSignal | undefined;
}

function toPlotLayer(id: string, name: string, polylines: Polyline[]): PlotLayer {
  return {
    id,
    name,
    color: "#0f172a",
    polylines,
  };
}

const polylineSetToLayer = (set: PolylineSet, name = "Layer 1") =>
  toPlotLayer(set.id, name, set.polylines);

function polylinesToDocument(
  polylines: Polyline[],
  metadata: Record<string, unknown> = {},
): PlotDocument {
  const bounds = combineBounds(
    polylines
      .map((line) => computePolylineBounds(line))
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  );
  const width = bounds ? bounds.maxX - bounds.minX : 1000;
  const height = bounds ? bounds.maxY - bounds.minY : 1000;
  return {
    id: `doc-${Date.now()}`,
    width: Math.max(1, width),
    height: Math.max(1, height),
    layers: [toPlotLayer("layer-0", "Layer 1", polylines)],
    metadata,
  };
}

const layeredToDocument = (geometry: LayeredGeometry): PlotDocument => {
  const allPolylines = geometry.layers.flatMap((layer) => layer.polylines);
  const bounds = combineBounds(
    allPolylines
      .map((polyline) => computePolylineBounds(polyline))
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  );
  return {
    id: `doc-${Date.now()}`,
    width: bounds ? bounds.maxX - bounds.minX : 1000,
    height: bounds ? bounds.maxY - bounds.minY : 1000,
    layers: geometry.layers,
    metadata: geometry.metadata,
  };
};

const statsFromPolylineSet = (set: PolylineSet): PlotStats =>
  computePlotStats(
    polylinesToDocument(
      set.polylines,
      set.metadata ?? { source: set.id },
    ),
  );

const waveformDefaults: WaveformRenderConfig = {
  width: 1200,
  height: 420,
  samplePoints: 1600,
  amplitude: 0.85,
  smoothingWindow: 3,
  mode: "single",
  lineCount: 3,
  stackSpacing: 80,
  circleRadiusRatio: 0.35,
  spiralTurns: 5,
  spiralInnerRatio: 0.12,
  spiralOuterRatio: 0.45,
  spectrumBins: 24,
  spectrumRadiusRatio: 0.4,
  ribbonLayers: 12,
  ribbonOffset: 18,
  ribbonDrift: 12,
};

const applyEnvelopeToSignal = (
  signal: SampledSignal,
  envelope: EnvelopeData,
): SampledSignal => {
  const scaled = new Float32Array(signal.samples.length);
  for (let i = 0; i < signal.samples.length; i += 1) {
    const envIndex = Math.min(
      envelope.samples.length - 1,
      Math.floor((i / signal.samples.length) * envelope.samples.length),
    );
    const gain = envelope.samples[envIndex] ?? 1;
    scaled[i] = signal.samples[i]! * gain;
  }
  return { ...signal, samples: scaled };
};

const implementations: Record<string, Impl> = {
  "source-image": (ctx) => {
    const asset = getImageAsset(ctx);
    if (!asset) {
      throw new Error("Import an image to use Image Source.");
    }
    return {
      image: asset,
      grayscale: asset.grayscale,
      gradient: asset.gradient,
    };
  },
  "source-noise": (ctx) => {
    const width = toNumber(ctx.parameters.width, 720);
    const height = toNumber(ctx.parameters.height ?? width, width);
    const config: NoiseFieldConfig = {
      width,
      height,
      scale: toNumber(ctx.parameters.scale, 180),
      octaves: Math.max(1, Math.round(toNumber(ctx.parameters.octaves, 4))),
      persistence: clamp(toNumber(ctx.parameters.persistence, 0.55), 0, 1),
      lacunarity: Math.max(0.1, toNumber(ctx.parameters.lacunarity, 2)),
      seed: String(ctx.parameters.seed ?? "plotter-lab"),
      offsetX: toNumber(ctx.parameters.offsetX, 0),
      offsetY: toNumber(ctx.parameters.offsetY, 0),
    };
    const field = generateNoiseField(config);
    return { field };
  },
  "source-wav": (ctx) => {
    const audio = getAudioAsset(ctx);
    if (!audio) {
      throw new Error("Import a WAV file to use this node.");
    }
    return { audio };
  },
  "source-constant-field": (ctx) => {
    const width = Math.max(4, Math.round(toNumber(ctx.parameters.width, 512)));
    const height = Math.max(4, Math.round(toNumber(ctx.parameters.height, 512)));
    const value = clamp(toNumber(ctx.parameters.value, 0.5), 0, 1);
    const data = new Float32Array(width * height).fill(value);
    return { field: { width, height, data } };
  },
  "source-gradient-field": (ctx) => {
    const resolution = Math.max(4, Math.round(toNumber(ctx.parameters.resolution ?? 512, 512)));
    const width = Math.max(4, Math.round(toNumber(ctx.parameters.width ?? resolution, resolution)));
    const height = Math.max(4, Math.round(toNumber(ctx.parameters.height ?? resolution, resolution)));
    const mode = String(ctx.parameters.mode ?? "linear");
    const direction = ((toNumber(ctx.parameters.direction, 0) % 360) * Math.PI) / 180;
    const centerX = clamp(toNumber(ctx.parameters.centerX, 0.5), 0, 1);
    const centerY = clamp(toNumber(ctx.parameters.centerY, 0.5), 0, 1);
    const falloff = Math.max(0.01, toNumber(ctx.parameters.falloff, 1));
    const field = createScalarField(width, height, (x, y) => {
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      if (mode === "radial") {
        const dx = u - centerX;
        const dy = v - centerY;
        return Math.min(1, Math.pow(Math.sqrt(dx * dx + dy * dy) * Math.SQRT2, falloff));
      }
      if (mode === "conical") {
        return ((Math.atan2(v - centerY, u - centerX) - direction) / TAU + 1) % 1;
      }
      const proj = (Math.cos(direction) * (u - 0.5) + Math.sin(direction) * (v - 0.5)) + 0.5;
      return Math.min(1, Math.max(0, Math.pow(proj, falloff)));
    });
    return { field };
  },
  "source-shape": (ctx) => {
    const shape = String(ctx.parameters.shape ?? "circle");
    const size = Math.max(1, toNumber(ctx.parameters.size, 200));
    const rotation = ((toNumber(ctx.parameters.rotation, 0) % 360) * Math.PI) / 180;
    const position = parseVector2(ctx.parameters.position, { x: 0.5, y: 0.5 });
    const center = { x: position.x * size, y: position.y * size };
    const buildPolygon = (sides: number, radius: number) => {
      const points: Point[] = [];
      for (let i = 0; i < sides; i += 1) {
        const angle = (i / sides) * TAU + rotation;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
      }
      return points;
    };
    let geometry: PolylineSet | undefined;
    if (shape === "circle") {
      geometry = {
        id: `shape-circle-${Date.now()}`,
        polylines: [polylineFromPoints(buildPolygon(48, size / 2), true)],
      };
    } else if (shape === "rectangle") {
      const half = size / 2;
      const points = [
        { x: center.x - half, y: center.y - half },
        { x: center.x + half, y: center.y - half },
        { x: center.x + half, y: center.y + half },
        { x: center.x - half, y: center.y + half },
      ].map((pt) => {
        const translated = { x: pt.x - center.x, y: pt.y - center.y };
        const rotated = rotatePoint(translated, rotation);
        return { x: rotated.x + center.x, y: rotated.y + center.y };
      });
      geometry = { id: `shape-rect-${Date.now()}`, polylines: [polylineFromPoints(points, true)] };
    } else if (shape === "polygon") {
      geometry = {
        id: `shape-poly-${Date.now()}`,
        polylines: [polylineFromPoints(buildPolygon(6, size / 2), true)],
      };
    } else {
      // star
      const points: Point[] = [];
      const spikes = 5;
      for (let i = 0; i < spikes * 2; i += 1) {
        const angle = (i / (spikes * 2)) * TAU + rotation;
        const radius = i % 2 === 0 ? size / 2 : size / 4;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
      }
      geometry = {
        id: `shape-star-${Date.now()}`,
        polylines: [polylineFromPoints(points, true)],
      };
    }
    let mask: Mask | undefined;
    if (geometry) {
      const bounds = geometry.polylines.reduce(
        (acc, line) => {
          line.points.forEach((pt) => {
            acc.minX = Math.min(acc.minX, pt.x);
            acc.maxX = Math.max(acc.maxX, pt.x);
            acc.minY = Math.min(acc.minY, pt.y);
            acc.maxY = Math.max(acc.maxY, pt.y);
          });
          return acc;
        },
        { minX: center.x - size, maxX: center.x + size, minY: center.y - size, maxY: center.y + size },
      );
      const width = Math.max(8, Math.round(bounds.maxX - bounds.minX));
      const height = Math.max(8, Math.round(bounds.maxY - bounds.minY));
      const data = new Float32Array(width * height);
      geometry.polylines.forEach((polyline) => {
        polyline.points.forEach((point) => {
          const x = Math.min(width - 1, Math.max(0, Math.round(point.x - bounds.minX)));
          const y = Math.min(height - 1, Math.max(0, Math.round(point.y - bounds.minY)));
          data[y * width + x] = 1;
        });
      });
      mask = { width, height, data, mode: "grayscale" };
    }
    return { mask, geometry };
  },
  "source-text": (ctx) => {
    const text = String(ctx.parameters.text ?? "Plotter Lab");
    const size = Math.max(4, toNumber(ctx.parameters.size, 48));
    const alignment = String(ctx.parameters.alignment ?? "left");
    const charWidth = size * 0.6;
    const totalWidth = text.length * charWidth;
    let offsetX = 0;
    if (alignment === "center") {
      offsetX = -totalWidth / 2;
    } else if (alignment === "right") {
      offsetX = -totalWidth;
    }
    const baseline = size;
    const polylines: Polyline[] = [];
    [...text].forEach((char, index) => {
      const x = offsetX + index * charWidth;
      const w = charWidth * 0.8;
      const h = size;
      const points = [
        { x, y: 0 },
        { x: x + w, y: 0 },
        { x: x + w, y: h },
        { x, y: h },
      ];
      polylines.push(polylineFromPoints(points, true));
    });
    const geometry: PolylineSet = {
      id: `text-${Date.now()}`,
      polylines,
      metadata: { text, size, alignment },
    };
    const maskWidth = Math.max(8, Math.round(totalWidth));
    const maskHeight = Math.max(8, Math.round(size * 1.2));
    const maskData = new Float32Array(maskWidth * maskHeight);
    polylines.forEach((polyline) => {
      polyline.points.forEach((point) => {
        const x = Math.min(maskWidth - 1, Math.max(0, Math.round(point.x + totalWidth / 2)));
        const y = Math.min(maskHeight - 1, Math.max(0, Math.round(point.y + baseline * 0.1)));
        maskData[y * maskWidth + x] = 1;
      });
    });
    return { geometry, mask: { width: maskWidth, height: maskHeight, data: maskData, mode: "grayscale" } };
  },
  "source-random-points": (ctx) => {
    const count = Math.max(1, Math.round(toNumber(ctx.parameters.count, 500)));
    const seed = String(ctx.parameters.seed ?? "points");
    const rng = seededRandom(seed);
    const bounds = parseVector2(ctx.parameters.bounds, { x: 1024, y: 1024 });
    const distribution = String(ctx.parameters.distribution ?? "uniform");
    const points: Point[] = [];
    if (distribution === "jittered") {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = cols;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          if (points.length >= count) break;
          points.push({
            x: (x + rng()) * (bounds.x / cols),
            y: (y + rng()) * (bounds.y / rows),
          });
        }
      }
    } else if (distribution === "poisson") {
      const minDist = Math.min(bounds.x, bounds.y) / Math.sqrt(count * 2);
      const attempts = 30;
      while (points.length < count) {
        const candidate = { x: rng() * bounds.x, y: rng() * bounds.y };
        let ok = true;
        for (let i = Math.max(0, points.length - attempts); i < points.length; i += 1) {
          const dx = candidate.x - points[i]!.x;
          const dy = candidate.y - points[i]!.y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) {
            ok = false;
            break;
          }
        }
        if (ok) points.push(candidate);
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        points.push({ x: rng() * bounds.x, y: rng() * bounds.y });
      }
    }
    return { points: createPointSet(points) };
  },
  "convert-image-grayscale": (ctx) => {
    const image = ctx.getInputValue("image") as ImageSourceAsset["image"];
    const asset = image ?? getImageAsset(ctx);
    if (!asset) {
      throw new Error("Connect an Image Source to convert it.");
    }
    const weights = parseWeights(ctx.parameters.weights);
    let field = asset.grayscale;
    if (weights && asset.pixels) {
      const { width, height, data } = asset.pixels;
      const values = new Float32Array(width * height);
      for (let i = 0; i < width * height; i += 1) {
        const r = data[i * 4]! / 255;
        const g = data[i * 4 + 1]! / 255;
        const b = data[i * 4 + 2]! / 255;
        values[i] = clamp(r * weights[0]! + g * weights[1]! + b * weights[2]!, 0, 1);
      }
      field = { width, height, data: values };
    }
    const gamma = toNumber(ctx.parameters.gamma, 1);
    const contrast = toNumber(ctx.parameters.contrast, 1);
    if (gamma !== 1) {
      field = mapScalarField(field, (value) => value ** gamma);
    }
    if (contrast !== 1) {
      field = mapScalarField(field, (value) => 0.5 + (value - 0.5) * contrast);
    }
    if (toBoolean(ctx.parameters.invert, false)) {
      field = invertScalarField(field);
    }
    return { field };
  },
  "convert-image-channel": (ctx) => {
    const image = ctx.getInputValue("image") as ImageSourceAsset["image"];
    const asset = image ?? getImageAsset(ctx);
    if (!asset?.pixels) {
      throw new Error("Channel extraction requires pixel data from Image Source.");
    }
    const channel = String(ctx.parameters.channel ?? "luminance");
    const { width, height, data } = asset.pixels;
    const values = new Float32Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      const r = data[i * 4]! / 255;
      const g = data[i * 4 + 1]! / 255;
      const b = data[i * 4 + 2]! / 255;
      const a = data[i * 4 + 3]! / 255;
      switch (channel) {
        case "r":
          values[i] = r;
          break;
        case "g":
          values[i] = g;
          break;
        case "b":
          values[i] = b;
          break;
        case "a":
          values[i] = a;
          break;
        case "hue":
        case "saturation":
        case "value": {
          const hsv = rgbToHsv(r, g, b);
          values[i] =
            channel === "hue" ? hsv.h : channel === "saturation" ? hsv.s : hsv.v;
          break;
        }
        default:
          values[i] = asset.grayscale.data[i]!;
      }
    }
    return { field: { width, height, data: values } };
  },
  "convert-image-edge": (ctx) => {
    const field = ctx.getInputValue("image")
      ? (ctx.getInputValue("image") as ImageSourceAsset["image"])?.gradient
      : getImageAsset(ctx)?.gradient;
    if (!field) {
      throw new Error("Edge extraction requires an Image Source with gradients.");
    }
    const blurRadius = toNumber(ctx.parameters.blur, 0);
    const gradientField =
      blurRadius > 0 ? blurScalarField(field, blurRadius) : field;
    const thresholdBias = clamp(toNumber(ctx.parameters.thresholdBias, 0.5), 0, 1);
    const result = mapScalarField(gradientField, (value) =>
      clamp(value + thresholdBias - 0.5, 0, 1),
    );
    return { field: result };
  },
  "convert-audio-envelope": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) {
      throw new Error("Audio input required for envelope extraction.");
    }
    const windowSeconds = clamp(toNumber(ctx.parameters.window, 0.01), 0.001, 1);
    const sampleWindow = Math.max(
      1,
      Math.round(windowSeconds * audio.sampleRate),
    );
    const smoothing = clamp(toNumber(ctx.parameters.smoothing, 0.5), 0, 1);
    const envelopeSamples = Math.ceil(audio.samples.length / sampleWindow);
    const data = new Float32Array(envelopeSamples);
    let previous = 0;
    for (let i = 0; i < envelopeSamples; i += 1) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < sampleWindow; j += 1) {
        const sample = audio.samples[i * sampleWindow + j];
        if (sample === undefined) break;
        sum += Math.abs(sample);
        count += 1;
      }
      const value = count ? sum / count : 0;
      previous = previous * smoothing + value * (1 - smoothing);
      data[i] = previous;
    }
    return {
      envelope: {
        samples: data,
        sampleRate: audio.sampleRate / sampleWindow,
        duration: audio.duration,
      },
    };
  },
  "convert-audio-spectrum": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) {
      throw new Error("Audio input required for spectrum analysis.");
    }
    const requestedSize = Math.max(256, toNumber(ctx.parameters.fftSize, 1024));
    const fftSize = Math.pow(2, Math.round(Math.log2(requestedSize)));
    const overlap = clamp(toNumber(ctx.parameters.overlap, 0.5), 0, 0.95);
    const hopSize = Math.max(1, Math.round(fftSize * (1 - overlap)));
    const windowType = String(ctx.parameters.window ?? "hann");
    const frames = Math.min(
      64,
      Math.max(1, Math.floor((audio.samples.length - fftSize) / hopSize)),
    );
    const bins = Math.max(1, Math.floor(fftSize / 2));
    const data = new Float32Array(bins * frames);
    const windowFn = (index: number) => {
      switch (windowType) {
        case "hamming":
          return 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
        case "blackman":
          return (
            0.42 -
            0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1)) +
            0.08 * Math.cos((4 * Math.PI * index) / (fftSize - 1))
          );
        case "hann":
        default:
          return 0.5 * (1 - Math.cos((2 * Math.PI * index) / (fftSize - 1)));
      }
    };
    for (let frame = 0; frame < frames; frame += 1) {
      const offset = frame * hopSize;
      for (let bin = 0; bin < bins; bin += 1) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < fftSize; n += 1) {
          const sample = audio.samples[offset + n] ?? 0;
          const windowed = sample * windowFn(n);
          const angle = (-2 * Math.PI * bin * n) / fftSize;
          real += windowed * Math.cos(angle);
          imag += windowed * Math.sin(angle);
        }
        const magnitude = Math.sqrt(real * real + imag * imag);
        data[frame * bins + bin] = magnitude;
      }
    }
    let maxMagnitude = 0;
    for (let i = 0; i < data.length; i += 1) {
      if (data[i]! > maxMagnitude) {
        maxMagnitude = data[i]!;
      }
    }
    if (maxMagnitude > 0) {
      for (let i = 0; i < data.length; i += 1) {
        data[i] = data[i]! / maxMagnitude;
      }
    }
    return {
      spectrum: {
        bins,
        frames,
        data,
        sampleRate: audio.sampleRate,
        windowSize: fftSize,
        overlap,
      },
    };
  },
  "convert-spectrum-field": (ctx) => {
    const spectrum = ctx.getInputValue("spectrum") as SpectrumData | undefined;
    if (!spectrum) {
      throw new Error("Spectrum input required to build a field.");
    }
    const timeScale = Math.max(0.1, toNumber(ctx.parameters.timeScale, 1));
    const freqScale = Math.max(0.1, toNumber(ctx.parameters.frequencyScale, 1));
    const normalizeOutput = toBoolean(ctx.parameters.normalize, true);
    const logFrequency = toBoolean(ctx.parameters.logFrequency, false);
    const field = spectrumToField(spectrum, timeScale, freqScale, normalizeOutput, logFrequency);
    return { field };
  },
  "audio-channel-selector": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    const mode = String(ctx.parameters.mode ?? "mono");
    const samples = new Float32Array(audio.samples.length);
    samples.set(audio.samples);
    if (mode === "difference") {
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = -samples[i]!;
      }
    }
    return { selected: { ...audio, samples } };
  },
  "audio-trim": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    const startSec = Math.max(0, toNumber(ctx.parameters.start, 0));
    const endSec = Math.max(startSec, toNumber(ctx.parameters.end, audio.duration));
    const startIndex = Math.min(audio.samples.length, Math.floor(startSec * audio.sampleRate));
    const endIndex = Math.min(audio.samples.length, Math.floor(endSec * audio.sampleRate));
    const trimmed = audio.samples.slice(startIndex, Math.max(startIndex + 1, endIndex));
    return {
      trimmed: {
        ...audio,
        samples: trimmed,
        duration: trimmed.length / audio.sampleRate,
      },
    };
  },
  "audio-resample": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    const targetRate = Math.max(2000, Math.round(toNumber(ctx.parameters.sampleRate, audio.sampleRate)));
    if (targetRate === audio.sampleRate) {
      return { resampled: audio };
    }
    const duration = audio.samples.length / audio.sampleRate;
    const targetLength = Math.max(1, Math.round(duration * targetRate));
    const resampled = new Float32Array(targetLength);
    for (let i = 0; i < targetLength; i += 1) {
      const t = i / targetRate;
      const sourceIndex = t * audio.sampleRate;
      const idx = Math.floor(sourceIndex);
      const frac = sourceIndex - idx;
      const a = audio.samples[idx] ?? 0;
      const b = audio.samples[idx + 1] ?? a;
      resampled[i] = a * (1 - frac) + b * frac;
    }
    return {
      resampled: {
        ...audio,
        samples: resampled,
        sampleRate: targetRate,
        duration,
      },
    };
  },
  "audio-smooth": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    const window = Math.max(1, Math.round(toNumber(ctx.parameters.window, 5)));
    const mode = String(ctx.parameters.mode ?? "moving-average");
    const smoothed = new Float32Array(audio.samples.length);
    if (mode === "lowpass") {
      const rc = window / audio.sampleRate;
      const dt = 1 / audio.sampleRate;
      const alpha = dt / (rc + dt);
      let previous = audio.samples[0] ?? 0;
      for (let i = 0; i < audio.samples.length; i += 1) {
        const input = audio.samples[i] ?? 0;
        previous = previous + alpha * (input - previous);
        smoothed[i] = previous;
      }
    } else {
      const half = Math.max(1, Math.floor(window / 2));
      for (let i = 0; i < audio.samples.length; i += 1) {
        let sum = 0;
        let count = 0;
        for (let j = -half; j <= half; j += 1) {
          const index = i + j;
          if (index < 0 || index >= audio.samples.length) continue;
          sum += audio.samples[index] ?? 0;
          count += 1;
        }
        smoothed[i] = count ? sum / count : audio.samples[i] ?? 0;
      }
    }
    return { smoothed: { ...audio, samples: smoothed } };
  },
  "audio-normalize": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    let peak = 0;
    for (let i = 0; i < audio.samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(audio.samples[i] ?? 0));
    }
    const targetDb = toNumber(ctx.parameters.target, -1);
    const targetAmplitude = Math.pow(10, targetDb / 20);
    const gain = peak ? targetAmplitude / peak : 1;
    const normalized = new Float32Array(audio.samples.length);
    for (let i = 0; i < audio.samples.length; i += 1) {
      normalized[i] = (audio.samples[i] ?? 0) * gain;
    }
    return { normalized: { ...audio, samples: normalized } };
  },
  "audio-detect-peaks": (ctx) => {
    const envelope = ctx.getInputValue("envelope") as EnvelopeData | undefined;
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!envelope && !audio) {
      throw new Error("Provide audio or envelope input for peak detection.");
    }
    const samples =
      envelope?.samples ??
      audio!.samples.map((value) => Math.abs(value));
    const sampleRate = envelope?.sampleRate ?? audio!.sampleRate;
    const threshold = clamp(toNumber(ctx.parameters.threshold, 0.6), 0, 1);
    const minDistanceSec = Math.max(0, toNumber(ctx.parameters.minDistance, 0.2));
    const minSamples = Math.max(1, Math.floor(minDistanceSec * sampleRate));
    const points: Point[] = [];
    let lastPeakIndex = -minSamples;
    for (let i = 1; i < samples.length - 1; i += 1) {
      const value = samples[i] ?? 0;
      if (
        value >= threshold &&
        value >= (samples[i - 1] ?? 0) &&
        value > (samples[i + 1] ?? 0) &&
        i - lastPeakIndex >= minSamples
      ) {
        lastPeakIndex = i;
        points.push({
          x: i / sampleRate,
          y: value,
        });
      }
    }
    return { points: createPointSet(points) };
  },
  "audio-spectrogram-builder": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) throw new Error("Audio input required.");
    const fftSize = Math.max(128, Math.round(toNumber(ctx.parameters.fftSize, 1024)));
    const hopSize = Math.max(1, Math.round(toNumber(ctx.parameters.hopSize, fftSize / 4)));
    const windowType = String(ctx.parameters.window ?? "hann");
    const frames = Math.max(1, Math.floor((audio.samples.length - fftSize) / hopSize));
    const bins = Math.floor(fftSize / 2);
    const data = new Float32Array(frames * bins);
    const windowFn = (index: number) => {
      switch (windowType) {
        case "hamming":
          return 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
        case "blackman":
          return (
            0.42 -
            0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1)) +
            0.08 * Math.cos((4 * Math.PI * index) / (fftSize - 1))
          );
        case "hann":
        default:
          return 0.5 * (1 - Math.cos((2 * Math.PI * index) / (fftSize - 1)));
      }
    };
    for (let frame = 0; frame < frames; frame += 1) {
      const offset = frame * hopSize;
      for (let bin = 0; bin < bins; bin += 1) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < fftSize; n += 1) {
          const sample = audio.samples[offset + n] ?? 0;
          const windowed = sample * windowFn(n);
          const angle = (-2 * Math.PI * bin * n) / fftSize;
          real += windowed * Math.cos(angle);
          imag += windowed * Math.sin(angle);
        }
        const magnitude = Math.sqrt(real * real + imag * imag);
        data[frame * bins + bin] = magnitude;
      }
    }
    let maxMagnitude = 0;
    for (let i = 0; i < data.length; i += 1) {
      maxMagnitude = Math.max(maxMagnitude, data[i]!);
    }
    if (maxMagnitude > 0) {
      for (let i = 0; i < data.length; i += 1) {
        data[i] = data[i]! / maxMagnitude;
      }
    }
    return {
      spectrum: {
        bins,
        frames,
        data,
        sampleRate: audio.sampleRate,
        windowSize: fftSize,
        overlap: 1 - hopSize / fftSize,
      },
    };
  },
  "audio-band-split": (ctx) => {
    const spectrum = ctx.getInputValue("spectrum") as SpectrumData | undefined;
    if (!spectrum) throw new Error("Spectrum input required.");
    const lowCut = Math.max(0, toNumber(ctx.parameters.lowCut, 200));
    const highCut = Math.max(lowCut, toNumber(ctx.parameters.highCut, 4000));
    const mode = String(ctx.parameters.mode ?? "envelope");
    const binFrequency = (bin: number) =>
      (bin / Math.max(1, spectrum.bins - 1)) * (spectrum.sampleRate / 2);
    const bands: Record<"low" | "mid" | "high", number[]> = {
      low: [],
      mid: [],
      high: [],
    };
    for (let frame = 0; frame < spectrum.frames; frame += 1) {
      let lowSum = 0;
      let midSum = 0;
      let highSum = 0;
      for (let bin = 0; bin < spectrum.bins; bin += 1) {
        const value = spectrum.data[frame * spectrum.bins + bin] ?? 0;
        const freq = binFrequency(bin);
        if (freq <= lowCut) {
          lowSum += value;
        } else if (freq <= highCut) {
          midSum += value;
        } else {
          highSum += value;
        }
      }
      bands.low.push(lowSum);
      bands.mid.push(midSum);
      bands.high.push(highSum);
    }
    const normalizeBand = (values: number[]): Float32Array => {
      let max = 0;
      values.forEach((value) => {
        max = Math.max(max, value);
      });
      if (!max) max = 1;
      return Float32Array.from(values, (value) => value / max);
    };
    const envelopes = {
      low: normalizeBand(bands.low),
      mid: normalizeBand(bands.mid),
      high: normalizeBand(bands.high),
    };
    return {
      low: { samples: envelopes.low, sampleRate: spectrum.frames, duration: spectrum.frames, metadata: { mode } },
      mid: { samples: envelopes.mid, sampleRate: spectrum.frames, duration: spectrum.frames, metadata: { mode } },
      high: { samples: envelopes.high, sampleRate: spectrum.frames, duration: spectrum.frames, metadata: { mode } },
    };
  },
  "audio-modulation": (ctx) => {
    const envelope = ctx.getInputValue("envelope") as EnvelopeData | undefined;
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!envelope && !audio) {
      throw new Error("Provide audio or envelope input.");
    }
    const mode = String(ctx.parameters.mode ?? "envelope");
    const normalize = toBoolean(ctx.parameters.normalize, true);
    let samples: Float32Array;
    let sampleRate: number;
    let duration: number;
    if (mode === "envelope" && envelope) {
      samples = Float32Array.from(envelope.samples);
      sampleRate = envelope.sampleRate;
      duration = envelope.duration;
    } else if (audio) {
      const data = audio.samples;
      if (mode === "peak") {
        samples = Float32Array.from(data, (value) => Math.abs(value));
      } else {
        const window = Math.max(1, Math.round(audio.sampleRate * 0.01));
        samples = new Float32Array(data.length);
        for (let i = 0; i < data.length; i += 1) {
          let sum = 0;
          for (let j = 0; j < window; j += 1) {
            const index = Math.min(data.length - 1, i + j);
            sum += data[index]! * data[index]!;
          }
          samples[i] = Math.sqrt(sum / window);
        }
      }
      sampleRate = audio.sampleRate;
      duration = audio.duration;
    } else {
      samples = Float32Array.from(envelope!.samples);
      sampleRate = envelope!.sampleRate;
      duration = envelope!.duration;
    }
    if (normalize) {
      let max = 0;
      for (let i = 0; i < samples.length; i += 1) {
        max = Math.max(max, samples[i]!);
      }
      if (max > 0) {
        for (let i = 0; i < samples.length; i += 1) {
          samples[i] = samples[i]! / max;
        }
      }
    }
    return {
      mod: {
        samples,
        sampleRate,
        duration,
      },
    };
  },
  "convert-geometry-mask": (ctx) => {
    const geometry = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const resolution = Math.max(32, Math.round(toNumber(ctx.parameters.resolution, 512)));
    const mode = String(ctx.parameters.mode ?? "fill") as "fill" | "outline";
    const mask = rasterizeGeometryToMask(geometry, resolution, mode);
    if (toBoolean(ctx.parameters.antialias, true)) {
      const blurred = blurScalarField(
        { width: mask.width, height: mask.height, data: getMaskData(mask) },
        1,
      );
      return { mask: { ...mask, data: blurred.data } };
    }
    return { mask };
  },
  "convert-mask-field": (ctx) => {
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!mask) throw new Error("Mask input required.");
    const data =
      mask.data instanceof Float32Array ? mask.data : new Float32Array(mask.data.length).map((_, index) => mask.data[index]! / 255);
    return { field: { width: mask.width, height: mask.height, data } };
  },
  "field-normalize": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const min = toNumber(ctx.parameters.min, 0);
    const max = toNumber(ctx.parameters.max, 1);
    const result = normalizeScalarField(field, {
      outMin: min,
      outMax: max,
      clamp: toBoolean(ctx.parameters.clamp, true),
      auto: toBoolean(ctx.parameters.auto, true),
    });
    return { field: result };
  },
  "field-invert": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    return { field: invertScalarField(field) };
  },
  "field-levels": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const min = toNumber(ctx.parameters.min, 0);
    const max = toNumber(ctx.parameters.max, 1);
    const bands = Math.max(1, Math.round(toNumber(ctx.parameters.bands, 4)));
    const mode = String(ctx.parameters.mode ?? "quantize") as "quantize" | "threshold";
    const { field: levelField, mask } = levelsScalarField(field, {
      min,
      max,
      bands,
      mode,
    });
    return { field: levelField, mask };
  },
  "field-blur": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const radius = Math.max(0, toNumber(ctx.parameters.radius, 3));
    const result = blurScalarField(field, radius);
    return { field: result };
  },
  "field-blend": (ctx) => {
    const a = expectScalarField(ctx.getInputValue("a"), ctx.definition.name);
    const b = expectScalarField(ctx.getInputValue("b"), ctx.definition.name);
    const mode = String(ctx.parameters.mode ?? "add") as Parameters<typeof blendScalarFields>[2];
    return { result: blendScalarFields(a, b, mode) };
  },
  "field-bias-gain": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const bias = clamp(toNumber(ctx.parameters.bias, 0.5), 1e-3, 0.999);
    const gain = clamp(toNumber(ctx.parameters.gain, 0.5), 1e-3, 0.999);
    return {
      shaped: mapScalarField(field, (value) => applyBiasGain(Math.min(1, Math.max(0, value)), bias, gain)),
    };
  },
  "field-sharpen": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const amount = clamp(toNumber(ctx.parameters.amount, 0.5), 0, 5);
    const blurRadius = Math.max(0.2, toNumber(ctx.parameters.radius ?? ctx.parameters.sigma, 1));
    const blurred = blurScalarField(field, blurRadius);
    const data = new Float32Array(field.data.length);
    for (let i = 0; i < data.length; i += 1) {
      const value = field.data[i]!;
      const blurValue = blurred.data[i]!;
      data[i] = Math.min(1, Math.max(0, value + (value - blurValue) * amount));
    }
    return { field: { width: field.width, height: field.height, data } };
  },
  "field-resample": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const width = Math.max(8, Math.round(toNumber(ctx.parameters.width, field.width)));
    const height = Math.max(8, Math.round(toNumber(ctx.parameters.height, field.height)));
    return { resampled: resampleScalarField(field, width, height) };
  },
  "field-crop": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const x = Math.round(toNumber(ctx.parameters.x, 0));
    const y = Math.round(toNumber(ctx.parameters.y, 0));
    const width = Math.max(1, Math.round(toNumber(ctx.parameters.width, field.width)));
    const height = Math.max(1, Math.round(toNumber(ctx.parameters.height, field.height)));
    return { cropped: cropScalarField(field, x, y, width, height) };
  },
  "field-remap": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const curve = String(ctx.parameters.curve ?? "");
    const stops = curve
      .split(/[,;\\s]+/)
      .map((entry) => Number(entry))
      .filter((value) => Number.isFinite(value));
    if (stops.length >= 4) {
      const pairs: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < stops.length - 1; i += 2) {
        pairs.push({ x: clamp(stops[i]!, 0, 1), y: clamp(stops[i + 1]!, 0, 1) });
      }
      pairs.sort((a, b) => a.x - b.x);
      return {
        remapped: mapScalarField(field, (value) => {
          for (let i = 0; i < pairs.length - 1; i += 1) {
            const a = pairs[i]!;
            const b = pairs[i + 1]!;
            if (value >= a.x && value <= b.x) {
              const t = (value - a.x) / Math.max(1e-6, b.x - a.x);
              return a.y * (1 - t) + b.y * t;
            }
          }
          return value;
        }),
      };
    }
    return { remapped: field };
  },
  "field-clamp": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const min = toNumber(ctx.parameters.min ?? ctx.parameters.minValue, 0);
    const max = toNumber(ctx.parameters.max ?? ctx.parameters.maxValue, 1);
    return { clamped: clampField(field, min, max) };
  },
  "field-displace": (ctx) => {
    const source = expectScalarField(ctx.getInputValue("source"), ctx.definition.name);
    const displacement = expectScalarField(ctx.getInputValue("displacement"), ctx.definition.name);
    const strength = toNumber(ctx.parameters.strength, 20);
    const scaleX = toNumber(ctx.parameters.scaleX, 1);
    const scaleY = toNumber(ctx.parameters.scaleY, 1);
    return {
      displaced: createScalarField(source.width, source.height, (x, y) => {
        const dx = (sampleField(displacement, x, y) - 0.5) * strength * scaleX;
        const dy = (sampleField(displacement, x + displacement.width / 2, y) - 0.5) * strength * scaleY;
        return sampleField(source, x + dx, y + dy);
      }),
    };
  },
  "field-domain-warp": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const warpFieldInput = ctx.getInputValue("warp") as ScalarField | VectorField | undefined;
    const strength = toNumber(ctx.parameters.strength, 15);
    if (!warpFieldInput) return { warped: field };
    if ((warpFieldInput as VectorField).data?.length === field.width * field.height * 2) {
      const warp = warpFieldInput as VectorField;
      return {
        warped: createScalarField(field.width, field.height, (x, y) => {
          const index = (Math.floor(y) * warp.width + Math.floor(x)) * 2;
          const wx = warp.data[index] ?? 0;
          const wy = warp.data[index + 1] ?? 0;
          return sampleField(field, x + wx * strength, y + wy * strength);
        }),
      };
    }
    const warpScalar = warpFieldInput as ScalarField;
    return {
      warped: createScalarField(field.width, field.height, (x, y) => {
        const offset = (sampleField(warpScalar, x, y) - 0.5) * strength;
        return sampleField(field, x + offset, y + offset);
      }),
    };
  },
  "field-distance-transform": (ctx) => {
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!mask) throw new Error("Distance transform requires a mask input.");
    const width = mask.width;
    const height = mask.height;
    const distances = new Float32Array(width * height);
    const queue: Point[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (mask.data[index]! > 0.5) {
          distances[index] = 0;
          queue.push({ x, y });
        } else {
          distances[index] = Number.POSITIVE_INFINITY;
        }
      }
    }
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    while (queue.length) {
      const point = queue.shift()!;
      const baseIndex = point.y * width + point.x;
      directions.forEach((dir) => {
        const nx = point.x + dir.x;
        const ny = point.y + dir.y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborIndex = ny * width + nx;
        const tentative = distances[baseIndex] + 1;
        if (tentative < distances[neighborIndex]) {
          distances[neighborIndex] = tentative;
          queue.push({ x: nx, y: ny });
        }
      });
    }
    const maxDistance = distances.reduce((acc, value) => Math.max(acc, value), 0) || 1;
    for (let i = 0; i < distances.length; i += 1) {
      distances[i] = distances[i]! / maxDistance;
    }
    return { distance: { width, height, data: distances } };
  },
  "field-mosaic": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const quantization = Math.max(1, Math.round(toNumber(ctx.parameters.quantization, 16)));
    const block = quantization;
    const data = new Float32Array(field.data.length);
    for (let y = 0; y < field.height; y += block) {
      for (let x = 0; x < field.width; x += block) {
        let sum = 0;
        let count = 0;
        for (let iy = 0; iy < block; iy += 1) {
          for (let ix = 0; ix < block; ix += 1) {
            const px = Math.min(field.width - 1, x + ix);
            const py = Math.min(field.height - 1, y + iy);
            sum += field.data[py * field.width + px] ?? 0;
            count += 1;
          }
        }
        const avg = sum / Math.max(1, count);
        for (let iy = 0; iy < block; iy += 1) {
          for (let ix = 0; ix < block; ix += 1) {
            const px = Math.min(field.width - 1, x + ix);
            const py = Math.min(field.height - 1, y + iy);
            data[py * field.width + px] = avg;
          }
        }
      }
    }
    return { posterized: { width: field.width, height: field.height, data } };
  },
  "vector-noise": (ctx) => {
    const resolution = Math.max(32, Math.round(toNumber(ctx.parameters.resolution ?? 512, 512)));
    const scale = Math.max(1, toNumber(ctx.parameters.scale, 200));
    const seed = String(ctx.parameters.seed ?? "flow");
    const mapping = String(ctx.parameters.mapping ?? "full");
    const noiseField = generateNoiseField({
      width: resolution,
      height: resolution,
      scale,
      seed,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2,
      offsetX: 0,
      offsetY: 0,
    });
    const vector = createVectorField(noiseField.width, noiseField.height, (x, y, index) => {
      const value = noiseField.data[index] ?? 0;
      const angle = mapping === "half" ? value * Math.PI : value * TAU;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });
    return { vector };
  },
  "vector-gradient": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const strength = toNumber(ctx.parameters.strength, 1);
    const normalizeVectors = toBoolean(ctx.parameters.normalize, true);
    const vector = createVectorField(field.width, field.height, (x, y) => {
      const dx = sampleField(field, x + 1, y) - sampleField(field, x - 1, y);
      const dy = sampleField(field, x, y + 1) - sampleField(field, x, y - 1);
      let vx = dx * strength;
      let vy = dy * strength;
      if (normalizeVectors) {
        const length = Math.hypot(vx, vy) || 1;
        vx /= length;
        vy /= length;
      }
      return { x: vx, y: vy };
    });
    return { vector };
  },
  "vector-curl": (ctx) => {
    const field = ctx.getInputValue("field") as ScalarField | undefined;
    const scale = Math.max(8, Math.round(toNumber(ctx.parameters.scale, 150)));
    if (field) {
      const vector = createVectorField(field.width, field.height, (x, y) => {
        const dx = sampleField(field, x + 1, y) - sampleField(field, x - 1, y);
        const dy = sampleField(field, x, y + 1) - sampleField(field, x, y - 1);
        return { x: -dy, y: dx };
      });
      return { vector };
    }
    const noiseField = generateNoiseField({
      width: scale,
      height: scale,
      scale,
      seed: String(ctx.parameters.seed ?? "curl"),
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2,
      offsetX: 0,
      offsetY: 0,
    });
    const vector = createVectorField(noiseField.width, noiseField.height, (x, y, index) => {
      const nx = sampleField(noiseField, x + 1, y) - sampleField(noiseField, x - 1, y);
      const ny = sampleField(noiseField, x, y + 1) - sampleField(noiseField, x, y - 1);
      return { x: -ny, y: nx };
    });
    return { vector };
  },
  "vector-normalize": (ctx) => {
    const vector = expectVectorField(ctx.getInputValue("vector"), ctx.definition.name);
    return {
      normalized: mapVectorField(vector, (entry) => {
        const length = Math.hypot(entry.x, entry.y) || 1;
        return { x: entry.x / length, y: entry.y / length };
      }),
    };
  },
  "vector-scale": (ctx) => {
    const vector = expectVectorField(ctx.getInputValue("vector"), ctx.definition.name);
    const scale = toNumber(ctx.parameters.scale, 1);
    return {
      scaled: mapVectorField(vector, (entry) => ({ x: entry.x * scale, y: entry.y * scale })),
    };
  },
  "vector-rotate": (ctx) => {
    const vector = expectVectorField(ctx.getInputValue("vector"), ctx.definition.name);
    const radians = ((toNumber(ctx.parameters.angle ?? ctx.parameters.rotation, 0) % 360) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      rotated: mapVectorField(vector, (entry) => ({
        x: entry.x * cos - entry.y * sin,
        y: entry.x * sin + entry.y * cos,
      })),
    };
  },
  "vector-blend": (ctx) => {
    const a = expectVectorField(ctx.getInputValue("a"), ctx.definition.name);
    const b = expectVectorField(ctx.getInputValue("b"), ctx.definition.name);
    const mix = clamp(toNumber(ctx.parameters.mix, 0.5), 0, 1);
    return {
      blended: mapVectorField(a, (entry, index) => ({
        x: entry.x * (1 - mix) + (b.data[index * 2] ?? 0) * mix,
        y: entry.y * (1 - mix) + (b.data[index * 2 + 1] ?? 0) * mix,
      })),
    };
  },
  "vector-mask": (ctx) => {
    const vector = expectVectorField(ctx.getInputValue("vector"), ctx.definition.name);
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!mask) return { masked: vector };
    const factorField =
      mask.data instanceof Float32Array
        ? mask.data
        : new Float32Array(mask.data.length).map((_, index) => mask.data[index]! / 255);
    return {
      masked: mapVectorField(vector, (entry, index) => {
        const factor = factorField[index] ?? 0;
        return { x: entry.x * factor, y: entry.y * factor };
      }),
    };
  },
  "geometry-contours": async (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const levels = Math.max(1, Math.round(toNumber(ctx.parameters.levels, 6)));
    const min = toNumber(ctx.parameters.rangeMin ?? ctx.parameters.min ?? 0, 0);
    const max = toNumber(ctx.parameters.rangeMax ?? ctx.parameters.max ?? 1, 1);
    const thresholds = linspace(min, max, levels);
    const smoothing = clamp(toNumber(ctx.parameters.smoothing, 0.2), 0, 1);
    const contourRunner =
      (ctx.resources.extras?.contourRunner as ContourRunner | undefined) ??
      ((payload: Parameters<typeof generateContourPolylines>[0]) =>
        Promise.resolve(generateContourPolylines(payload)));
    const polylines = await contourRunner({
      field,
      thresholds,
      smoothing,
    });
    const minLoop = Math.max(0, toNumber(ctx.parameters.minLoop, 0));
    const filtered = minLoop
      ? polylines.filter((polyline) => polylineLength(polyline) >= minLoop)
      : polylines;
    return { polylines: asPolylineSet(ctx.node.id, filtered) };
  },
  "geometry-waveform": (ctx) => {
    const audio =
      (ctx.getInputValue("audio") as SampledSignal | undefined) ??
      getAudioAsset(ctx);
    if (!audio) {
      throw new Error("Connect a WAV Source to render waveforms.");
    }
    const envelope = ctx.getInputValue("envelope") as EnvelopeData | undefined;
    const config: WaveformRenderConfig = {
      ...waveformDefaults,
      width: toNumber(ctx.parameters.width, waveformDefaults.width),
      height: toNumber(ctx.parameters.height, waveformDefaults.height),
      samplePoints: Math.max(100, Math.round(toNumber(ctx.parameters.sampleDensity, waveformDefaults.samplePoints))),
      amplitude: toNumber(ctx.parameters.amplitude, waveformDefaults.amplitude),
      smoothingWindow: Math.max(1, Math.round(toNumber(ctx.parameters.smoothing, waveformDefaults.smoothingWindow))),
    } as WaveformRenderConfig;
    const modeParam = String(ctx.parameters.mode ?? "linear");
    switch (modeParam) {
      case "stacked":
        config.mode = "stacked";
        break;
      case "circle":
        config.mode = "circle";
        break;
      case "spiral":
        config.mode = "spiral";
        break;
      default:
        config.mode = "single";
    }
    const signal = envelope ? applyEnvelopeToSignal(audio, envelope) : audio;
    const polylines = buildWaveformPolylines(signal, config);
    return { polylines: asPolylineSet(ctx.node.id, polylines) };
  },
  "geometry-edge-trace": async (ctx) => {
    const fieldInput = ctx.getInputValue("field") as ScalarField | undefined;
    const image = ctx.getInputValue("image") as ImageSourceAsset["image"] | undefined;
    const asset = image ?? getImageAsset(ctx);
    const gradient = fieldInput ?? asset?.gradient;
    if (!gradient) {
      throw new Error("Edge Trace needs a scalar field or image gradients.");
    }
    const threshold = clamp(toNumber(ctx.parameters.threshold, 0.5), 0, 1);
    const joinDistance = Math.max(0, toNumber(ctx.parameters.joinDistance, 4));
    const simplifyValue = Math.max(0, toNumber(ctx.parameters.simplify, 2));
    const binary = mapScalarField(gradient, (value) => (value >= threshold ? 1 : 0));
    const contourRunner =
      (ctx.resources.extras?.contourRunner as ContourRunner | undefined) ??
      ((payload: Parameters<typeof generateContourPolylines>[0]) =>
        Promise.resolve(generateContourPolylines(payload)));
    const lines = await contourRunner({
      field: binary,
      thresholds: [0.5],
      smoothing: 0,
    });
    const simplified = simplifyValue
      ? lines.map((line) => simplifyPolyline(line, simplifyValue))
      : lines;
    const joined = joinNearbyEndpoints(simplified, joinDistance);
    return { polylines: asPolylineSet(ctx.node.id, joined) };
  },
  "geometry-iso-bands": async (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const bands = Math.max(1, Math.round(toNumber(ctx.parameters.bands, 6)));
    const min = toNumber(ctx.parameters.rangeMin ?? ctx.parameters.min ?? 0, 0);
    const max = toNumber(ctx.parameters.rangeMax ?? ctx.parameters.max ?? 1, 1);
    const thresholds = linspace(min, max, bands);
    const contourRunner =
      (ctx.resources.extras?.contourRunner as ContourRunner | undefined) ??
      ((payload: Parameters<typeof generateContourPolylines>[0]) =>
        Promise.resolve(generateContourPolylines(payload)));
    const lines = await contourRunner({
      field,
      thresholds,
      smoothing: clamp(toNumber(ctx.parameters.smoothing, 0.15), 0, 1),
    });
    const grouped = new Map<number, Polyline[]>();
    lines.forEach((line) => {
      const level = (line.metadata?.threshold as number) ?? thresholds[0]!;
      if (!grouped.has(level)) grouped.set(level, []);
      grouped.get(level)!.push(line);
    });
    const layers: PlotLayer[] = [];
    Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([level, polylines], index) => {
        layers.push({
          id: `iso-layer-${index}`,
          name: `Band ${index + 1}`,
          color: "#1e293b",
          polylines,
        });
      });
    return {
      polylines: asPolylineSet(ctx.node.id, lines),
      layers: { layers, metadata: { source: ctx.node.id } },
    };
  },
  "geometry-spectral-contour": async (ctx) => {
    const spectrum = ctx.getInputValue("spectrum") as SpectrumData | undefined;
    const fieldInput = ctx.getInputValue("field") as ScalarField | undefined;
    let field = fieldInput;
    const timeScale = Math.max(0.1, toNumber(ctx.parameters.timeScale, 1));
    const frequencyScale = Math.max(0.1, toNumber(ctx.parameters.frequencyScale, 1));
    if (!field && spectrum) {
      field = spectrumToField(spectrum, timeScale, frequencyScale, true, false);
    }
    if (!field) {
      throw new Error("Connect a spectrum or scalar field to Spectral Contour Renderer.");
    }
    const contourCount = Math.max(1, Math.round(toNumber(ctx.parameters.contours, 12)));
    const thresholds = linspace(0.05, 0.95, contourCount);
    const contourRunner =
      (ctx.resources.extras?.contourRunner as ContourRunner | undefined) ??
      ((payload: Parameters<typeof generateContourPolylines>[0]) =>
        Promise.resolve(generateContourPolylines(payload)));
    const polylines = await contourRunner({
      field,
      thresholds,
      smoothing: 0.1,
    });
    return { polylines: asPolylineSet(ctx.node.id, polylines) };
  },
  "geometry-flow-lines": (ctx) => {
    const vector = expectVectorField(ctx.getInputValue("vector"), ctx.definition.name);
    const seedsInput = ctx.getInputValue("seeds") as PointSet | undefined;
    const stepSize = Math.max(0.5, toNumber(ctx.parameters.stepSize, 4));
    const lineLength = Math.max(stepSize * 2, toNumber(ctx.parameters.lineLength, 400));
    const maxSteps = Math.max(2, Math.round(lineLength / stepSize));
    const seedCount = Math.max(1, Math.round(toNumber(ctx.parameters.seedCount, 200)));
    const collision = String(ctx.parameters.collision ?? "stop");
    const seeds = [...(seedsInput?.points ?? [])];
    if (!seeds.length) {
      const cols = Math.ceil(Math.sqrt(seedCount));
      const rows = Math.ceil(seedCount / cols);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          if (seeds.length >= seedCount) break;
          seeds.push({
            x: ((x + 0.5) / cols) * vector.width,
            y: ((y + 0.5) / rows) * vector.height,
          });
        }
      }
    }
    const polylines: Polyline[] = [];
    seeds.forEach((seed, index) => {
      const points: Point[] = [{ ...seed }];
      let current = { ...seed };
      for (let step = 0; step < maxSteps; step += 1) {
        const vec = sampleVector(vector, current.x, current.y);
        const magnitude = Math.hypot(vec.x, vec.y);
        if (magnitude < 1e-3) break;
        let next = {
          x: current.x + (vec.x / magnitude) * stepSize,
          y: current.y + (vec.y / magnitude) * stepSize,
        };
        if (collision === "wrap") {
          next.x = (next.x + vector.width) % vector.width;
          next.y = (next.y + vector.height) % vector.height;
        } else if (
          next.x < 0 ||
          next.x >= vector.width ||
          next.y < 0 ||
          next.y >= vector.height
        ) {
          break;
        }
        points.push(next);
        current = next;
      }
      if (points.length > 1) {
        polylines.push({ id: `flow-${index}`, points });
      }
    });
    return { flow: asPolylineSet(ctx.node.id, polylines) };
  },
  "geometry-hatch": (ctx) => {
    let field = ctx.getInputValue("field") as ScalarField | undefined;
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!field && mask) {
      field = {
        width: mask.width,
        height: mask.height,
        data: getMaskData(mask),
      };
    }
    if (!field) {
      throw new Error("Hatch Generator needs a scalar field or mask input.");
    }
    const spacing = Math.max(2, toNumber(ctx.parameters.spacing, 10));
    const angle = toNumber(ctx.parameters.angle, 45);
    const cross = toBoolean(ctx.parameters.cross, false);
    const hatchLines = generateHatchLines(field, {
      spacing,
      threshold: 0.5,
      amplitude: spacing * 0.4,
      sampleStep: 1,
    });
    const center = { x: field.width / 2, y: field.height / 2 };
    let rotated = rotatePolylines(hatchLines, angle, center);
    if (cross) {
      rotated = rotated.concat(rotatePolylines(hatchLines, angle + 90, center));
    }
    return { hatch: asPolylineSet(ctx.node.id, rotated) };
  },
  "geometry-stipple": (ctx) => {
    const field = ctx.getInputValue("field") as ScalarField | undefined;
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!field && !mask) {
      throw new Error("Stipple Generator needs a field or mask.");
    }
    const count = Math.max(1, Math.round(toNumber(ctx.parameters.count, 2000)));
    const threshold = clamp(toNumber(ctx.parameters.threshold, 0.5), 0, 1);
    const width = field?.width ?? mask!.width;
    const height = field?.height ?? mask!.height;
    const rng = seededRandom(ctx.node.id);
    const points: Point[] = [];
    let attempts = 0;
    while (points.length < count && attempts < count * 10) {
      attempts += 1;
      const candidate = { x: rng() * width, y: rng() * height };
      const value = field ? sampleField(field, candidate.x, candidate.y) : sampleMaskValue(mask!, candidate);
      if (value <= threshold) {
        points.push(candidate);
      }
    }
    return { points: createPointSet(points) };
  },
  "geometry-point-connect": (ctx) => {
    const set = ctx.getInputValue("points") as PointSet | undefined;
    if (!set || !set.points.length) {
      throw new Error("Point Connect needs a PointSet input.");
    }
    const mode = String(ctx.parameters.mode ?? "nearest");
    const points = set.points.map((point) => ({ ...point }));
    const buildNearestPolyline = () => {
      const remaining = [...points];
      const start = remaining.shift();
      if (!start) return [];
      const ordered: Point[] = [start];
      let current = start;
      while (remaining.length) {
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        remaining.forEach((candidate, index) => {
          const dist = distance(current, candidate);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestIndex = index;
          }
        });
        current = remaining.splice(bestIndex, 1)[0]!;
        ordered.push(current);
      }
      return ordered;
    };
    let polylines: Polyline[] = [];
    if (mode === "spiral") {
      const centroid = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
      );
      centroid.x /= points.length;
      centroid.y /= points.length;
      const ordered = [...points].sort((a, b) => {
        const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
        const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
        return angleA - angleB;
      });
      polylines = [{ id: `${ctx.node.id}-spiral`, points: ordered }];
    } else {
      const ordered = buildNearestPolyline();
      if (mode === "tsp") {
        ordered.push({ ...ordered[0]! });
      }
      polylines = [{ id: `${ctx.node.id}-nearest`, points: ordered, closed: mode === "tsp" }];
    }
    return { polylines: asPolylineSet(ctx.node.id, polylines) };
  },
  "geometry-voronoi": (ctx) => {
    const set = ctx.getInputValue("points") as PointSet | undefined;
    if (!set || !set.points.length) {
      throw new Error("Voronoi Generator needs a PointSet input.");
    }
    const relaxations = Math.max(0, Math.round(toNumber(ctx.parameters.relaxations, 0)));
    const mode = String(ctx.parameters.mode ?? "voronoi");
    let points = set.points.map((point) => ({ ...point }));
    const bounds = points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxX: Math.max(acc.maxX, point.x),
        maxY: Math.max(acc.maxY, point.y),
      }),
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    );
    for (let i = 0; i < relaxations; i += 1) {
      const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
      const voronoi = delaunay.voronoi([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]);
      points = points.map((_, index) => {
        const polygon = voronoi.cellPolygon(index);
        if (!polygon || !polygon.length) return points[index]!;
        const centroid = polygon.reduce(
          (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
          { x: 0, y: 0 },
        );
        return { x: centroid.x / polygon.length, y: centroid.y / polygon.length };
      });
    }
    const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
    const polylines: Polyline[] = [];
    if (mode === "voronoi" || mode === "dual") {
      const voronoi = delaunay.voronoi([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]);
      for (let i = 0; i < points.length; i += 1) {
        const polygon = voronoi.cellPolygon(i);
        if (!polygon || polygon.length < 3) continue;
        polylines.push({
          id: `voronoi-${i}`,
          points: polygon.map(([x, y]) => ({ x, y })),
          closed: true,
        });
      }
    }
    if (mode === "delaunay" || mode === "dual") {
      for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const a = points[delaunay.triangles[i]!]!;
        const b = points[delaunay.triangles[i + 1]!]!;
        const c = points[delaunay.triangles[i + 2]!]!;
        polylines.push({ id: `delaunay-${i}`, points: [a, b, c, a], closed: true });
      }
    }
    return { graph: asPolylineSet(ctx.node.id, polylines) };
  },
  "geometry-medial": (ctx) => {
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!mask) {
      throw new Error("Medial Line Generator needs a mask input.");
    }
    const pruneLength = Math.max(0, toNumber(ctx.parameters.prune, 5));
    const points: Point[] = [];
    for (let y = 0; y < mask.height; y += 1) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      for (let x = 0; x < mask.width; x += 1) {
        const value = sampleMaskValue(mask, { x, y });
        if (value > 0.5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      if (minX !== Number.POSITIVE_INFINITY && maxX !== Number.NEGATIVE_INFINITY) {
        points.push({ x: (minX + maxX) / 2, y });
      }
    }
    const medialLine: Polyline = { id: `${ctx.node.id}-medial`, points, closed: false };
    if (pruneLength > 0 && polylineLength(medialLine) < pruneLength) {
      return { skeleton: asPolylineSet(ctx.node.id, []) };
    }
    return { skeleton: asPolylineSet(ctx.node.id, [medialLine]) };
  },
  "geometry-grid": (ctx) => {
    const columns = Math.max(1, Math.round(toNumber(ctx.parameters.columns, 6)));
    const rows = Math.max(1, Math.round(toNumber(ctx.parameters.rows, 6)));
    const mode = String(ctx.parameters.mode ?? "rect");
    const width = columns * 80;
    const height = rows * 80;
    const polylines: Polyline[] = [];
    if (mode === "rect") {
      for (let c = 0; c <= columns; c += 1) {
        const x = (c / columns) * width;
        polylines.push({
          id: `grid-vert-${c}`,
          points: [
            { x, y: 0 },
            { x, y: height },
          ],
        });
      }
      for (let r = 0; r <= rows; r += 1) {
        const y = (r / rows) * height;
        polylines.push({
          id: `grid-horiz-${r}`,
          points: [
            { x: 0, y },
            { x: width, y },
          ],
        });
      }
    } else if (mode === "iso") {
      const spacing = Math.min(width, height) / Math.max(columns, rows);
      for (let i = -rows; i <= rows; i += 1) {
        polylines.push({
          id: `iso-a-${i}`,
          points: [
            { x: 0, y: (i + rows) * spacing },
            { x: width, y: (i + rows) * spacing + spacing * rows },
          ],
        });
        polylines.push({
          id: `iso-b-${i}`,
          points: [
            { x: 0, y: (i + rows) * spacing + spacing * rows },
            { x: width, y: (i + rows) * spacing },
          ],
        });
      }
    } else {
      const radius = Math.min(width, height) / 2;
      const center = { x: width / 2, y: height / 2 };
      for (let i = 1; i <= rows; i += 1) {
        const r = (i / rows) * radius;
        const circle: Point[] = [];
        const segments = Math.max(12, Math.round(r * 0.5));
        for (let s = 0; s <= segments; s += 1) {
          const angle = (s / segments) * TAU;
          circle.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
        }
        polylines.push({ id: `radial-circle-${i}`, points: circle, closed: true });
      }
      for (let i = 0; i < columns; i += 1) {
        const angle = (i / columns) * TAU;
        polylines.push({
          id: `radial-spoke-${i}`,
          points: [
            center,
            { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
          ],
        });
      }
    }
    return { grid: asPolylineSet(ctx.node.id, polylines) };
  },
  "path-simplify": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = clamp(toNumber(ctx.parameters.tolerance, 1.2), 0, 50);
    const simplified = set.polylines.map((polyline) =>
      simplifyPolyline(polyline, tolerance),
    );
    return { polylines: { ...set, polylines: simplified } };
  },
  "path-smooth": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const windowSize = Math.max(1, toNumber(ctx.parameters.window, 3));
    const strength = clamp(toNumber(ctx.parameters.strength, 0.5), 0, 1);
    const smoothed = set.polylines.map((polyline) =>
      smoothPolylinePoints(polyline, windowSize, strength),
    );
    return { polylines: { ...set, polylines: smoothed } };
  },
  "path-resample": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const spacing = Math.max(0.1, toNumber(ctx.parameters.spacing, 2));
    const resampled = set.polylines.map((polyline) => resamplePolyline(polyline, spacing));
    return { resampled: { ...set, polylines: resampled } };
  },
  "path-trim": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const mode = String(ctx.parameters.mode ?? "length");
    const startParam = toNumber(ctx.parameters.start, 0);
    const endParam = toNumber(ctx.parameters.end, 1);
    const trimmed: Polyline[] = [];
    set.polylines.forEach((polyline, index) => {
      const total = Math.max(polylineLength(polyline), 1);
      let start = startParam;
      let end = endParam;
      if (mode === "percent" || mode === "bounds") {
        start *= total;
        end *= total;
      }
      const slice = trimPolylineRange(polyline, start, end);
      if (slice) {
        trimmed.push({ ...slice, id: `${polyline.id}-trim-${index}` });
      }
    });
    return { trimmed: { ...set, polylines: trimmed } };
  },
  "path-split": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const maxLength = Math.max(1, toNumber(ctx.parameters.maxLength, 500));
    const splits = set.polylines.flatMap((polyline) =>
      splitPolylineByLength(polyline, maxLength),
    );
    return { splits: { ...set, polylines: splits } };
  },
  "path-merge": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = Math.max(0, toNumber(ctx.parameters.tolerance, 5));
    const merged = joinNearbyEndpoints(set.polylines, tolerance);
    return { merged: { ...set, polylines: merged } };
  },
  "path-reverse": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const reversed = set.polylines.map((polyline, index) => ({
      ...polyline,
      id: `${polyline.id}-rev-${index}`,
      points: [...polyline.points].reverse(),
    }));
    return { reversed: { ...set, polylines: reversed } };
  },
  "path-offset": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const distanceValue = toNumber(ctx.parameters.distance, 5);
    const side = String(ctx.parameters.side ?? "both") as "left" | "right" | "both";
    const offsets = set.polylines.flatMap((polyline) =>
      offsetPolyline(polyline, distanceValue, side),
    );
    return { offset: { ...set, polylines: offsets } };
  },
  "path-warp": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const field = ctx.getInputValue("field") as ScalarField | undefined;
    const vector = ctx.getInputValue("vector") as VectorField | undefined;
    const strength = toNumber(ctx.parameters.strength, 20);
    const mode = String(ctx.parameters.mode ?? "field-normal");
    const warped = set.polylines.map((polyline, index) => {
      const points = polyline.points.map((point) => {
        let offset = { x: 0, y: 0 };
        if (vector && mode === "vector") {
          const vec = sampleVector(vector, point.x, point.y);
          offset = { x: vec.x * strength, y: vec.y * strength };
        } else if (field) {
          const dx = sampleField(field, point.x + 1, point.y) - sampleField(field, point.x - 1, point.y);
          const dy = sampleField(field, point.x, point.y + 1) - sampleField(field, point.x, point.y - 1);
          if (mode === "field-tangent") {
            offset = { x: dy * strength, y: -dx * strength };
          } else {
            offset = { x: -dx * strength, y: -dy * strength };
          }
        }
        return { x: point.x + offset.x, y: point.y + offset.y };
      });
      return { ...polyline, id: `${polyline.id}-warp-${index}`, points };
    });
    return { warped: { ...set, polylines: warped } };
  },
  "path-jitter": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const amplitude = toNumber(ctx.parameters.amplitude, 2);
    const frequency = toNumber(ctx.parameters.frequency, 0.5);
    const jittered = set.polylines.map((polyline, index) =>
      jitterPolyline(polyline, amplitude, frequency, `${ctx.node.id}-${index}`),
    );
    return { jittered: { ...set, polylines: jittered } };
  },
  "path-boolean": (ctx) => {
    const setA = expectPolylineSet(ctx.getInputValue("a"), ctx.definition.name);
    const setB = expectPolylineSet(ctx.getInputValue("b"), ctx.definition.name);
    const mode = String(ctx.parameters.mode ?? "union");
    const boundsB = setB.polylines
      .map((polyline) => computePolylineBounds(polyline))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const overlaps = (polyline: Polyline) => {
      const bounds = computePolylineBounds(polyline);
      if (!bounds) return false;
      return boundsB.some(
        (other) =>
          bounds.minX <= other.maxX &&
          bounds.maxX >= other.minX &&
          bounds.minY <= other.maxY &&
          bounds.maxY >= other.minY,
      );
    };
    let result: Polyline[] = [];
    if (mode === "union") {
      result = [...setA.polylines, ...setB.polylines];
    } else if (mode === "intersect") {
      result = setA.polylines.filter(overlaps);
    } else {
      result = setA.polylines.filter((polyline) => !overlaps(polyline));
    }
    return { result: asPolylineSet(ctx.node.id, result) };
  },
  "path-dash": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const patternText = String(ctx.parameters.pattern ?? "10,5");
    const pattern = patternText
      .split(/[,\\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    const phase = toNumber(ctx.parameters.phase, 0);
    const dashed = set.polylines.flatMap((polyline) => dashPolyline(polyline, pattern, phase));
    return { dashed: { ...set, polylines: dashed } };
  },
  "path-close-open": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const mode = String(ctx.parameters.mode ?? "close");
    const modified = set.polylines.map((polyline, index) => {
      if (mode === "close") {
        const points = [...polyline.points];
        if (points.length && (points[0]!.x !== points[points.length - 1]!.x || points[0]!.y !== points[points.length - 1]!.y)) {
          points.push({ ...points[0]! });
        }
        return { ...polyline, id: `${polyline.id}-close-${index}`, points, closed: true };
      }
      const points = [...polyline.points];
      if (points.length > 1 && points[0]!.x === points[points.length - 1]!.x && points[0]!.y === points[points.length - 1]!.y) {
        points.pop();
      }
      return { ...polyline, id: `${polyline.id}-open-${index}`, points, closed: false };
    });
    return { modified: { ...set, polylines: modified } };
  },
  "path-dedupe": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = Math.max(0.01, toNumber(ctx.parameters.tolerance, 0.5));
    const deduped = dedupePolylines(set.polylines, tolerance);
    return { deduped: { ...set, polylines: deduped } };
  },
  "path-clip": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const mask = ctx.getInputValue("clipperMask") as Mask | undefined;
    const clipBounds = mask
      ? { minX: 0, minY: 0, maxX: mask.width, maxY: mask.height }
      : getSetBounds(set) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const clipped = clipPolylineSetToBounds(set, clipBounds);
    return { polylines: clipped };
  },
  "opt-remove-fragments": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const minLength = Math.max(0, toNumber(ctx.parameters.minLength, 5));
    const filtered = removeTinyFragments(set.polylines, minLength, polylineLength);
    return { polylines: { ...set, polylines: filtered } };
  },
  "opt-sort-paths": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = Math.max(0, toNumber(ctx.parameters.joinTolerance, 4));
    const sorted = sortPaths(set.polylines, tolerance);
    return { polylines: { ...set, polylines: sorted } };
  },
  "opt-orient-paths": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const oriented = orientPaths(set.polylines);
    return { polylines: { ...set, polylines: oriented } };
  },
  "opt-join-endpoints": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = Math.max(0, toNumber(ctx.parameters.tolerance, 3));
    const joined = joinNearbyEndpoints(set.polylines, tolerance);
    return { polylines: { ...set, polylines: joined } };
  },
  "opt-remove-overlaps": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const tolerance = Math.max(0.01, toNumber(ctx.parameters.tolerance, 0.25));
    const filtered = dedupePolylines(set.polylines, tolerance);
    return { clean: { ...set, polylines: filtered } };
  },
  "opt-travel-estimator": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const penUpSpeed = Math.max(1, toNumber(ctx.parameters.penUpSpeed, 300));
    const penDownSpeed = Math.max(1, toNumber(ctx.parameters.penDownSpeed, 120));
    let penDownLength = 0;
    let penUpLength = 0;
    set.polylines.forEach((polyline, index) => {
      penDownLength += polylineLength(polyline);
      if (index > 0) {
        const prev = set.polylines[index - 1]!;
        const prevEnd = prev.points[prev.points.length - 1] ?? prev.points[0];
        const nextStart = polyline.points[0] ?? prevEnd;
        if (prevEnd && nextStart) {
          penUpLength += distance(prevEnd, nextStart);
        }
      }
    });
    const estimatedTime = penDownLength / penDownSpeed + penUpLength / penUpSpeed;
    const document = polylinesToDocument(set.polylines, {
      estimatedTime,
      penDownLength,
      penUpLength,
    });
    return {
      pathsOut: set,
      stats: document,
    };
  },
  "opt-pen-lift": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const iterations = Math.max(1, Math.round(toNumber(ctx.parameters.iterations, 4)));
    let polylines = [...set.polylines];
    for (let i = 0; i < iterations; i += 1) {
      polylines = sortPaths(polylines, 5);
      polylines = joinNearbyEndpoints(polylines, 2);
    }
    return { optimized: { ...set, polylines } };
  },
  "opt-plotter-safe": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("paths"), ctx.definition.name);
    const profile = String(ctx.parameters.profile ?? "default");
    const presets = {
      default: { simplify: 1.2, minLength: 4, join: 5 },
      speed: { simplify: 2, minLength: 6, join: 8 },
      quality: { simplify: 0.8, minLength: 2, join: 4 },
    } as const;
    const settings = presets[profile as keyof typeof presets] ?? presets.default;
    let polylines = set.polylines
      .map((polyline) => simplifyPolyline(polyline, settings.simplify))
      .filter((polyline) => polylineLength(polyline) >= settings.minLength);
    polylines = joinNearbyEndpoints(polylines, settings.join);
    polylines = sortPaths(polylines, settings.join);
    return { safe: { ...set, polylines } };
  },
  "layout-transform": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const translate = parseVector2(ctx.parameters.translate, { x: 0, y: 0 });
    const scale = parseVector2(ctx.parameters.scale, { x: 1, y: 1 });
    const rotation = toNumber(ctx.parameters.rotation, 0);
    const transformed = transformPolylineSet(set, {
      scaleX: scale.x,
      scaleY: scale.y,
      translateX: translate.x,
      translateY: translate.y,
      rotate: rotation,
    });
    return { polylines: transformed };
  },
  "layout-scale-to-page": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const pageSetting = String(ctx.parameters.page ?? "letter-portrait");
    const [preset, orient] = pageSetting.split("-");
    const pageConfig = {
      presetId: (preset as PagePresetId) ?? "letter",
      orientation: (orient as "portrait" | "landscape") ?? "portrait",
    };
    const { width: pageWidth, height: pageHeight } = resolvePageSize(pageConfig);
    const margin = clamp(toNumber(ctx.parameters.margin, 10), 0, Math.min(pageWidth, pageHeight) / 2);
    const bounds = getSetBounds(set);
    if (!bounds) {
      return { polylines: set };
    }
    const availableWidth = Math.max(pageWidth - margin * 2, 1);
    const availableHeight = Math.max(pageHeight - margin * 2, 1);
    const preserve = toBoolean(ctx.parameters.preserveAspect, true);
    const rawScaleX = availableWidth / Math.max(bounds.maxX - bounds.minX, 1);
    const rawScaleY = availableHeight / Math.max(bounds.maxY - bounds.minY, 1);
    const uniformScale = preserve ? Math.min(rawScaleX, rawScaleY) : 1;
    const scaleX = preserve ? uniformScale : rawScaleX;
    const scaleY = preserve ? uniformScale : rawScaleY;
    const scaledWidth = (bounds.maxX - bounds.minX) * scaleX;
    const scaledHeight = (bounds.maxY - bounds.minY) * scaleY;
    const align = String(ctx.parameters.align ?? "center");
    let translateX = margin - bounds.minX * scaleX;
    let translateY = margin - bounds.minY * scaleY;
    const horizSpace = availableWidth - scaledWidth;
    const vertSpace = availableHeight - scaledHeight;
    switch (align) {
      case "top-left":
        translateX = margin - bounds.minX * scaleX;
        translateY = margin - bounds.minY * scaleY;
        break;
      case "top-right":
        translateX = margin + horizSpace - bounds.minX * scaleX;
        translateY = margin - bounds.minY * scaleY;
        break;
      case "bottom-left":
        translateX = margin - bounds.minX * scaleX;
        translateY = margin + vertSpace - bounds.minY * scaleY;
        break;
      case "bottom-right":
        translateX = margin + horizSpace - bounds.minX * scaleX;
        translateY = margin + vertSpace - bounds.minY * scaleY;
        break;
      case "center":
      default:
        translateX = margin + horizSpace / 2 - bounds.minX * scaleX;
        translateY = margin + vertSpace / 2 - bounds.minY * scaleY;
        break;
    }
    const transformed = transformPolylineSet(set, {
      scaleX,
      scaleY,
      translateX,
      translateY,
    });
    return { polylines: transformed };
  },
  "layout-compose-layers": (ctx) => {
    const inputs = ctx.getInputValues("inputs");
    const layers: PlotLayer[] = [];
    inputs.forEach((input, index) => {
      if (!input) return;
      if ((input as LayeredGeometry).layers) {
        layers.push(...((input as LayeredGeometry).layers ?? []));
      } else if ((input as PolylineSet).polylines) {
        const set = input as PolylineSet;
        layers.push(polylineSetToLayer(set, `Layer ${index + 1}`));
      }
    });
    if (!layers.length) {
      throw new Error("Compose Layers needs at least one geometry input.");
    }
    const geometry: LayeredGeometry = { layers, metadata: { source: ctx.node.id } };
    return { layers: geometry };
  },
  "layout-crop-page": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const pageSetting = String(ctx.parameters.page ?? "letter-portrait");
    let width = toNumber(ctx.parameters.width, 215.9);
    let height = toNumber(ctx.parameters.height, 279.4);
    if (pageSetting !== "custom") {
      const [preset, orient] = pageSetting.split("-");
      const pageConfig = {
        presetId: (preset as PagePresetId) ?? "letter",
        orientation: (orient as "portrait" | "landscape") ?? "portrait",
      };
      const resolved = resolvePageSize(pageConfig);
      width = resolved.width;
      height = resolved.height;
    }
    const clipped = clipPolylineSetToBounds(set, {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height,
    });
    return { polylines: clipped };
  },
  "layout-tile": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const columns = Math.max(1, Math.round(toNumber(ctx.parameters.columns, 3)));
    const rows = Math.max(1, Math.round(toNumber(ctx.parameters.rows, 3)));
    const spacing = parseVector2(ctx.parameters.spacing, { x: 10, y: 10 });
    const bounds = getSetBounds(set) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const tiled: Polyline[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const offsetX = col * (width + spacing.x);
        const offsetY = row * (height + spacing.y);
        set.polylines.forEach((polyline, index) => {
          tiled.push({
            ...polyline,
            id: `${polyline.id}-tile-${row}-${col}-${index}`,
            points: polyline.points.map((point) => ({
              x: point.x + offsetX,
              y: point.y + offsetY,
            })),
          });
        });
      }
    }
    return { tiled: { ...set, polylines: tiled } };
  },
  "layout-mirror": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const axis = String(ctx.parameters.axis ?? "x");
    const bounds = getSetBounds(set) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const mirrored = set.polylines.map((polyline, index) => ({
      ...polyline,
      id: `${polyline.id}-mirror-${index}`,
      points: polyline.points.map((point) => {
        if (axis === "y") {
          return { x: center.x * 2 - point.x, y: point.y };
        }
        if (axis === "radial") {
          return { x: center.x * 2 - point.x, y: center.y * 2 - point.y };
        }
        return { x: point.x, y: center.y * 2 - point.y };
      }),
    }));
    return { mirrored: { ...set, polylines: mirrored } };
  },
  "layout-array": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const mode = String(ctx.parameters.mode ?? "grid");
    const count = Math.max(1, Math.round(toNumber(ctx.parameters.count, 6)));
    const radius = Math.max(10, toNumber(ctx.parameters.radius, 200));
    const bounds = getSetBounds(set) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const polylines: Polyline[] = [];
    if (mode === "radial") {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU;
        const offset = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        set.polylines.forEach((polyline, index) => {
          polylines.push({
            ...polyline,
            id: `${polyline.id}-radial-${i}-${index}`,
            points: polyline.points.map((point) => ({
              x: point.x - center.x + center.x + offset.x,
              y: point.y - center.y + center.y + offset.y,
            })),
          });
        });
      }
    } else {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      let placed = 0;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (placed >= count) break;
          const offsetX = col * radius;
          const offsetY = row * radius;
          set.polylines.forEach((polyline, index) => {
            polylines.push({
              ...polyline,
              id: `${polyline.id}-array-${placed}-${index}`,
              points: polyline.points.map((point) => ({
                x: point.x + offsetX,
                y: point.y + offsetY,
              })),
            });
          });
          placed += 1;
        }
      }
    }
    return { arrayed: { ...set, polylines } };
  },
  "layout-frame-guide": (ctx) => {
    const pageSetting = String(ctx.parameters.page ?? "letter-portrait");
    const margin = Math.max(0, toNumber(ctx.parameters.margin, 10));
    const [preset, orient] = pageSetting.split("-");
    const pageConfig = {
      presetId: (preset as PagePresetId) ?? "letter",
      orientation: (orient as "portrait" | "landscape") ?? "portrait",
    };
    const { width, height } = resolvePageSize(pageConfig);
    const outer = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
      { x: 0, y: 0 },
    ];
    const inner = [
      { x: margin, y: margin },
      { x: width - margin, y: margin },
      { x: width - margin, y: height - margin },
      { x: margin, y: height - margin },
      { x: margin, y: margin },
    ];
    return {
      guides: asPolylineSet(ctx.node.id, [
        { id: `${ctx.node.id}-outer`, points: outer, closed: true },
        { id: `${ctx.node.id}-inner`, points: inner, closed: true },
      ]),
    };
  },
  "layout-mask-compose": (ctx) => {
    const geometry = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const mask = ctx.getInputValue("mask") as Mask | undefined;
    if (!mask) {
      throw new Error("Mask Compose requires a mask input.");
    }
    const mode = String(ctx.parameters.mode ?? "inside");
    const insideMode = mode === "inside";
    const composed: Polyline[] = [];
    geometry.polylines.forEach((polyline, index) => {
      const current: Point[] = [];
      polyline.points.forEach((point) => {
        const inside = sampleMaskValue(mask, point) > 0.5;
        if ((inside && insideMode) || (!inside && !insideMode)) {
          current.push({ ...point });
        } else if (current.length > 1) {
          composed.push({ ...polyline, id: `${polyline.id}-mask-${index}-${composed.length}`, points: [...current] });
          current.length = 0;
        } else {
          current.length = 0;
        }
      });
      if (current.length > 1) {
        composed.push({ ...polyline, id: `${polyline.id}-mask-${index}-${composed.length}`, points: [...current] });
      }
    });
    return { masked: { ...geometry, polylines: composed } };
  },
  "layer-assign": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const layerName = String(ctx.parameters.layerName ?? "Layer 1");
    const penName = String(ctx.parameters.penName ?? "Pen A");
    const color = String(ctx.parameters.color ?? "#111111");
    const layer: PlotLayer = {
      id: `${ctx.node.id}-layer`,
      name: layerName,
      color,
      polylines: set.polylines,
    };
    return { layered: { layers: [layer], metadata: { source: ctx.node.id, pen: penName } } };
  },
  "layer-split": (ctx) => {
    const layered = ctx.getInputValue("layered") as LayeredGeometry | undefined;
    if (!layered) {
      throw new Error("Split Layers needs a layered geometry input.");
    }
    const attribute = String(ctx.parameters.attribute ?? "source");
    const groups = new Map<string, PlotLayer>();
    layered.layers.forEach((layer) => {
      let key = layer.name;
      if (attribute === "pen" && typeof layered.metadata?.pen === "string") {
        key = layered.metadata.pen as string;
      } else if (attribute === "source" && typeof layered.metadata?.source === "string") {
        key = layered.metadata.source as string;
      } else if (attribute === "level") {
        const polyMeta = layer.polylines[0]?.metadata;
        if (polyMeta && typeof (polyMeta as Record<string, unknown>).level === "string") {
          key = String((polyMeta as Record<string, unknown>).level);
        }
      }
      if (!groups.has(key)) {
        groups.set(key, { ...layer, id: `${layer.id}-${key}`, polylines: [] });
      }
      groups.get(key)!.polylines.push(...layer.polylines);
    });
    return { layers: { layers: Array.from(groups.values()), metadata: layered.metadata } };
  },
  "layer-merge": (ctx) => {
    const inputs = ctx.getInputValues("layers");
    const layers: PlotLayer[] = [];
    inputs.forEach((input) => {
      const layered = input as LayeredGeometry | undefined;
      if (layered) {
        layers.push(...layered.layers);
      }
    });
    return { merged: { layers, metadata: { source: ctx.node.id } } };
  },
  "layer-recolor-preview": (ctx) => {
    const layered = ctx.getInputValue("layered") as LayeredGeometry | undefined;
    if (!layered) throw new Error("Recolor node needs layered geometry.");
    const color = String(ctx.parameters.palette ?? "#0f172a");
    return {
      recolored: {
        ...layered,
        layers: layered.layers.map((layer) => ({ ...layer, color })),
      },
    };
  },
  "layer-stroke-preview": (ctx) => {
    const layered = ctx.getInputValue("layered") as LayeredGeometry | undefined;
    if (!layered) throw new Error("Stroke Preview needs layered geometry.");
    const width = toNumber(ctx.parameters.width, 0.3);
    const opacity = clamp(toNumber(ctx.parameters.opacity, 1), 0, 1);
    return {
      styled: {
        ...layered,
        metadata: { ...(layered.metadata ?? {}), preview: { width, opacity } },
      },
    };
  },
  "output-svg": (ctx) => {
    const geometry = ctx.getInputValue("geometry") as PolylineSet | undefined;
    const layers = ctx.getInputValue("layers") as LayeredGeometry | undefined;
    let document: PlotDocument | undefined;
    if (layers) {
      document = layeredToDocument(layers);
    } else if (geometry) {
      document = polylinesToDocument(geometry.polylines, geometry.metadata ?? {});
    }
    if (!document) {
      throw new Error("SVG Output needs geometry or layered input.");
    }
    document.metadata = {
      ...document.metadata,
      title: ctx.parameters.title ?? "Plotter Lab",
      page: ctx.parameters.page ?? "letter",
      units: ctx.parameters.units ?? "mm",
    };
    return { document };
  },
  "output-preview": (ctx) => {
    const geometry = ctx.getInputValue("geometry") as PolylineSet | undefined;
    const layers = ctx.getInputValue("layers") as LayeredGeometry | undefined;
    const background = String(ctx.parameters.background ?? "#050608");
    const strokeWidth = toNumber(ctx.parameters.strokeWidth, 0.25);
    const showTravel = toBoolean(ctx.parameters.showTravel, false);
    let document: PlotDocument | undefined;
    if (layers) {
      document = layeredToDocument(layers);
    } else if (geometry) {
      document = polylinesToDocument(geometry.polylines, geometry.metadata ?? {});
    }
    if (!document) {
      throw new Error("Plot Preview needs geometry or layered input.");
    }
    document.metadata = {
      ...(document.metadata ?? {}),
      preview: { background, strokeWidth, showTravel },
    };
    return { preview: document };
  },
  "output-json": (ctx) => {
    const document = ctx.getInputValue("document") as PlotDocument | undefined;
    if (!document) throw new Error("JSON Output needs a PlotDocument input.");
    const pretty = toBoolean(ctx.parameters.pretty, true);
    return { json: JSON.stringify(document, null, pretty ? 2 : undefined) };
  },
  "output-gcode": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const feedRate = toNumber(ctx.parameters.feedRate, 1200);
    let gcode = "G21 ; units in mm\nG90 ; absolute positioning\n";
    set.polylines.forEach((polyline) => {
      const start = polyline.points[0];
      if (!start) return;
      gcode += `G0 X${start.x.toFixed(2)} Y${start.y.toFixed(2)}\nM3\n`;
      for (let i = 1; i < polyline.points.length; i += 1) {
        const point = polyline.points[i]!;
        gcode += `G1 X${point.x.toFixed(2)} Y${point.y.toFixed(2)} F${feedRate}\n`;
      }
      gcode += "M5\n";
    });
    return { gcode };
  },
  "preview-geometry-stats": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const stats = statsFromPolylineSet(set);
    return { stats };
  },
  "preview-field-histogram": (ctx) => {
    const field = expectScalarField(ctx.getInputValue("field"), ctx.definition.name);
    const bins = Math.max(2, Math.round(toNumber(ctx.parameters.bins, 32)));
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < field.data.length; i += 1) {
      const value = field.data[i] ?? 0;
      const index = Math.min(bins - 1, Math.floor(value * bins));
      counts[index] += 1;
    }
    const maxCount = Math.max(...counts, 1);
    const width = bins * 10;
    const height = 100;
    const polylines: Polyline[] = counts.map((count, index) => {
      const barHeight = (count / maxCount) * height;
      const x = index * 10;
      return {
        id: `hist-${index}`,
        points: [
          { x, y: height },
          { x, y: height - barHeight },
          { x: x + 8, y: height - barHeight },
          { x: x + 8, y: height },
          { x, y: height },
        ],
        closed: true,
      };
    });
    return {
      histogram: polylinesToDocument(polylines, {
        bins,
        maxCount,
      }),
    };
  },
  "preview-bounds": (ctx) => {
    const geometry = ctx.getInputValue("geometry") as PolylineSet | undefined;
    const field = ctx.getInputValue("field") as ScalarField | undefined;
    if (geometry) {
      const bounds = getSetBounds(geometry);
      if (bounds) {
        return {
          bounds: {
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
          },
        };
      }
    }
    if (field) {
      return {
        bounds: { x: 0, y: 0, width: field.width, height: field.height },
      };
    }
    throw new Error("Bounds analyzer needs geometry or field input.");
  },
  "preview-intersections": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const threshold = Math.max(1, toNumber(ctx.parameters.threshold, 10));
    const overlaps: Point[] = [];
    for (let i = 0; i < set.polylines.length; i += 1) {
      const a = set.polylines[i]!;
      for (let j = i + 1; j < set.polylines.length; j += 1) {
        const b = set.polylines[j]!;
        const boundsA = computePolylineBounds(a);
        const boundsB = computePolylineBounds(b);
        if (
          !boundsA ||
          !boundsB ||
          boundsA.maxX + threshold < boundsB.minX ||
          boundsB.maxX + threshold < boundsA.minX ||
          boundsA.maxY + threshold < boundsB.minY ||
          boundsB.maxY + threshold < boundsA.minY
        ) {
          continue;
        }
        a.points.forEach((pointA) => {
          b.points.forEach((pointB) => {
            if (distance(pointA, pointB) <= threshold) {
              overlaps.push({
                x: (pointA.x + pointB.x) / 2,
                y: (pointA.y + pointB.y) / 2,
              });
            }
          });
        });
      }
    }
    const crosses = overlaps.map((point, index) => ({
      id: `cross-${index}`,
      points: [
        { x: point.x - 2, y: point.y - 2 },
        { x: point.x + 2, y: point.y + 2 },
        { x: point.x - 2, y: point.y + 2 },
        { x: point.x + 2, y: point.y - 2 },
      ],
    }));
    return {
      report: polylinesToDocument(crosses, { intersections: overlaps.length }),
    };
  },
  "preview-plot-time": (ctx) => {
    const set = expectPolylineSet(ctx.getInputValue("geometry"), ctx.definition.name);
    const penUpSpeed = Math.max(1, toNumber(ctx.parameters.penUpSpeed, 300));
    const penDownSpeed = Math.max(1, toNumber(ctx.parameters.penDownSpeed, 120));
    let penDownLength = 0;
    let penUpLength = 0;
    set.polylines.forEach((polyline, index) => {
      penDownLength += polylineLength(polyline);
      if (index > 0) {
        const prev = set.polylines[index - 1]!;
        const prevEnd = prev.points[prev.points.length - 1] ?? prev.points[0];
        const nextStart = polyline.points[0] ?? prevEnd;
        if (prevEnd && nextStart) {
          penUpLength += distance(prevEnd, nextStart);
        }
      }
    });
    const estimatedTime = penDownLength / penDownSpeed + penUpLength / penUpSpeed;
    return {
      report: polylinesToDocument(set.polylines, {
        penDownLength,
        penUpLength,
        estimatedTime,
      }),
    };
  },
  "util-number": (ctx) => ({
    value: Number(ctx.parameters.value ?? 1),
  }),
  "util-vector2": (ctx) => ({
    value: parseVector2(
      { x: ctx.parameters.x, y: ctx.parameters.y },
      { x: 0, y: 0 },
    ),
  }),
  "util-color": (ctx) => ({
    color: String(ctx.parameters.color ?? "#ffffff"),
  }),
  "util-seed": (ctx) => {
    const seedValue = String(ctx.parameters.seed ?? "plotter");
    const lock = toBoolean(ctx.parameters.lock, true);
    return {
      seed: {
        seed: lock ? seedValue : `${seedValue}-${Date.now()}`,
        randomState: [],
      },
    };
  },
  "util-range": (ctx) => {
    const start = toNumber(ctx.parameters.start, 0);
    const end = toNumber(ctx.parameters.end, 1);
    const steps = Math.max(1, Math.round(toNumber(ctx.parameters.steps, 5)));
    const values = linspace(start, end, steps);
    return { values };
  },
  "util-switch": (ctx) => {
    const condition = ctx.getInputValue("condition");
    const a = ctx.getInputValue("a");
    const b = ctx.getInputValue("b");
    const result = condition ? a : b;
    return { output: result };
  },
  "util-mix": (ctx) => {
    const a = ctx.getInputValue("a");
    const b = ctx.getInputValue("b");
    const mixValue =
      Number(ctx.getInputValue("t")) ??
      toNumber(ctx.parameters.factor, 0.5);
    if (typeof a === "number" && typeof b === "number") {
      const t = clamp(mixValue, 0, 1);
      return { mixed: a * (1 - t) + b * t };
    }
    return { mixed: mixValue >= 0.5 ? b : a };
  },
  "util-compare": (ctx) => {
    const field = ctx.getInputValue("input") as ScalarField | undefined;
    const valueInput = ctx.getInputValue("value") as number | undefined;
    const threshold = toNumber(ctx.parameters.threshold, 0.5);
    const operator = String(ctx.parameters.operator ?? ">");
    if (field) {
      const data = new Uint8Array(field.width * field.height);
      for (let i = 0; i < field.data.length; i += 1) {
        const sample = field.data[i] ?? 0;
        let keep = false;
        switch (operator) {
          case "<":
            keep = sample < threshold;
            break;
          case ">=":
            keep = sample >= threshold;
            break;
          case "<=":
            keep = sample <= threshold;
            break;
          default:
            keep = sample > threshold;
        }
        data[i] = keep ? 255 : 0;
      }
      return {
        mask: { width: field.width, height: field.height, data, mode: "binary" },
        boolean: data.some((value) => value === 255),
      };
    }
    const result = (() => {
      const value = valueInput ?? 0;
      switch (operator) {
        case "<":
          return value < threshold;
        case ">=":
          return value >= threshold;
        case "<=":
          return value <= threshold;
        default:
          return value > threshold;
      }
    })();
    return { boolean: result };
  },
  "util-randomizer": (ctx) => {
    const seedInput = ctx.getInputValue("seed") as SeedState | undefined;
    const min = toNumber(ctx.parameters.min, 0);
    const max = toNumber(ctx.parameters.max, 1);
    const rng = seededRandom(seedInput?.seed ?? ctx.node.id);
    const value = min + rng() * (max - min);
    return { value };
  },
  "macro-generic": (ctx) => {
    const inputs = ctx.getInputValues("inputs");
    return { outputs: inputs };
  },
  "macro-preset": (ctx) => {
    const inputs = ctx.getInputValues("inputs");
    return { outputs: inputs };
  },
};

export const nodeImplementations = implementations;
