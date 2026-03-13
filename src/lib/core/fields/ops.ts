import { Mask, ScalarField } from "../types";

export function cloneScalarField(field: ScalarField): ScalarField {
  return {
    width: field.width,
    height: field.height,
    data: new Float32Array(field.data),
  };
}

export function mapScalarField(
  field: ScalarField,
  mapper: (value: number, index: number) => number,
): ScalarField {
  const next = new Float32Array(field.data.length);
  for (let i = 0; i < field.data.length; i += 1) {
    next[i] = mapper(field.data[i]!, i);
  }
  return { width: field.width, height: field.height, data: next };
}

export interface NormalizeFieldOptions {
  outMin?: number;
  outMax?: number;
  clamp?: boolean;
  auto?: boolean;
}

export function normalizeScalarField(
  field: ScalarField,
  options: NormalizeFieldOptions = {},
): ScalarField {
  const { outMin = 0, outMax = 1, clamp = true, auto = true } = options;
  let inMin = 0;
  let inMax = 1;
  if (auto) {
    inMin = Number.POSITIVE_INFINITY;
    inMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < field.data.length; i += 1) {
      const value = field.data[i]!;
      if (value < inMin) inMin = value;
      if (value > inMax) inMax = value;
    }
  }
  const range = inMax - inMin || 1;
  return mapScalarField(field, (value) => {
    const normalized = (value - inMin) / range;
    const mapped = outMin + normalized * (outMax - outMin);
    if (!clamp) {
      return mapped;
    }
    return Math.min(outMax, Math.max(outMin, mapped));
  });
}

export function invertScalarField(field: ScalarField): ScalarField {
  return mapScalarField(field, (value) => 1 - value);
}

export interface LevelsFieldOptions {
  min?: number;
  max?: number;
  bands?: number;
  mode?: "quantize" | "threshold";
}

export function levelsScalarField(
  field: ScalarField,
  options: LevelsFieldOptions = {},
): { field?: ScalarField; mask?: Mask } {
  const {
    min = 0,
    max = 1,
    bands = 4,
    mode = "quantize",
  } = options;

  if (mode === "threshold") {
    const maskData = new Float32Array(field.data.length);
    for (let i = 0; i < field.data.length; i += 1) {
      const value = field.data[i]!;
      maskData[i] = value >= min && value <= max ? 1 : 0;
    }
    return {
      mask: { width: field.width, height: field.height, data: maskData, mode: "grayscale" },
    };
  }

  const quantized = new Float32Array(field.data.length);
  const safeBands = Math.max(1, bands);
  for (let i = 0; i < field.data.length; i += 1) {
    const value = field.data[i]!;
    const normalized = (value - min) / Math.max(max - min, 1e-6);
    const clamped = Math.min(1, Math.max(0, normalized));
    const bucket = Math.floor(clamped * safeBands);
    quantized[i] = bucket / safeBands;
  }
  return {
    field: { width: field.width, height: field.height, data: quantized },
  };
}

export type BlendMode =
  | "add"
  | "subtract"
  | "multiply"
  | "screen"
  | "min"
  | "max"
  | "average";

export function blendScalarFields(
  a: ScalarField,
  b: ScalarField,
  mode: BlendMode,
): ScalarField {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("Blend requires matching field dimensions.");
  }
  const data = new Float32Array(a.data.length);
  for (let i = 0; i < data.length; i += 1) {
    const va = a.data[i]!;
    const vb = b.data[i]!;
    switch (mode) {
      case "add":
        data[i] = va + vb;
        break;
      case "subtract":
        data[i] = va - vb;
        break;
      case "multiply":
        data[i] = va * vb;
        break;
      case "screen":
        data[i] = 1 - (1 - va) * (1 - vb);
        break;
      case "min":
        data[i] = Math.min(va, vb);
        break;
      case "max":
        data[i] = Math.max(va, vb);
        break;
      case "average":
      default:
        data[i] = (va + vb) / 2;
        break;
    }
  }
  return { width: a.width, height: a.height, data };
}
