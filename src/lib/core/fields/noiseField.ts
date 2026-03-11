import { createNoise2D } from "simplex-noise";
import { ScalarField } from "../types";

export interface NoiseFieldConfig {
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  seed: string;
  offsetX: number;
  offsetY: number;
}

export function generateNoiseField(config: NoiseFieldConfig): ScalarField {
  const {
    width,
    height,
    scale,
    octaves,
    persistence,
    lacunarity,
    seed,
    offsetX,
    offsetY,
  } = config;

  const random = mulberry32(hashSeed(seed));
  const noise2D = createNoise2D(random);
  const result = new Float32Array(width * height);

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;

      for (let octave = 0; octave < octaves; octave += 1) {
        const sampleX =
          ((x + offsetX) / scale) * frequency + octave * 0.001 * offsetX;
        const sampleY =
          ((y + offsetY) / scale) * frequency + octave * 0.001 * offsetY;
        noiseValue += noise2D(sampleX, sampleY) * amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }

      result[y * width + x] = noiseValue;
      if (noiseValue < minValue) minValue = noiseValue;
      if (noiseValue > maxValue) maxValue = noiseValue;
    }
  }

  const range = maxValue - minValue || 1;
  for (let i = 0; i < result.length; i += 1) {
    result[i] = (result[i]! - minValue) / range;
  }

  return {
    width,
    height,
    data: result,
  };
}

function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

