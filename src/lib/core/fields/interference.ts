import { ScalarField } from "../types";
import { generateNoiseField, NoiseFieldConfig } from "./noiseField";

export interface InterferenceConfig {
  secondaryScale: number;
  secondaryOctaves: number;
  mix: number;
}

export function buildInterferenceField(
  base: ScalarField,
  noiseConfig: NoiseFieldConfig,
  config: InterferenceConfig,
): ScalarField {
  const secondary = generateNoiseField({
    ...noiseConfig,
    scale: config.secondaryScale,
    octaves: config.secondaryOctaves,
    seed: `${noiseConfig.seed}-secondary`,
  });

  const mix = Math.min(Math.max(config.mix, 0), 1);
  const data = new Float32Array(base.data.length);
  for (let i = 0; i < data.length; i += 1) {
    const value = base.data[i] ?? 0;
    const wave = secondary.data[i] ?? 0;
    data[i] = clamp01(value * (1 - mix) + wave * mix);
  }

  return {
    width: base.width,
    height: base.height,
    data,
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

