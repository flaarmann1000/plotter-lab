import { create } from "zustand";
import { ImageFieldResult, imageFileToFields } from "@/lib/image/imageField";
import { decodeAudioFile } from "@/lib/audio/wav";
import {
  ImageTransformConfig,
  NoiseTransformConfig,
  PlotControlConfig,
  WaveformRenderConfig,
} from "@/lib/core/config";
import { generateNoiseField, NoiseFieldConfig } from "@/lib/core/fields/noiseField";
import {
  PlotDocument,
  PlotStats,
  ScalarField,
  SampledSignal,
  SourceKind,
  TransformMode,
} from "@/lib/core/types";
import { PageConfig } from "@/lib/core/export/pagePresets";

type Status = "idle" | "loading" | "computing";

interface ImageState extends Partial<ImageFieldResult> {
  version: number;
}

interface NoiseState {
  field?: ScalarField;
  fieldConfig: NoiseFieldConfig;
  transformConfig: NoiseTransformConfig;
  version: number;
}

interface AudioState {
  signal?: SampledSignal;
  version: number;
}

interface PlotterStoreState {
  sourceKind: SourceKind;
  transform: TransformMode;
  status: Status;
  error?: string;
  document?: PlotDocument;
  stats?: PlotStats;

  image: ImageState;
  noise: NoiseState;
  audio: AudioState;

  imageConfig: ImageTransformConfig;
  waveformConfig: WaveformRenderConfig;
  plotConfig: PlotControlConfig;

  setSourceKind: (kind: SourceKind) => void;
  setTransform: (mode: TransformMode) => void;
  setStatus: (status: Status) => void;
  setError: (message?: string) => void;
  setDocument: (document?: PlotDocument, stats?: PlotStats) => void;

  updateImageConfig: (patch: Partial<ImageTransformConfig>) => void;
  updateNoiseTransform: (patch: Partial<NoiseTransformConfig>) => void;
  updateNoiseFieldConfig: (patch: Partial<NoiseFieldConfig>) => void;
  updateWaveformConfig: (patch: Partial<WaveformRenderConfig>) => void;
  updatePlotConfig: (patch: Partial<PlotControlConfig>) => void;
  setPageConfig: (page: PageConfig) => void;

  loadImageFile: (file: File) => Promise<void>;
  regenerateNoiseField: () => void;
  loadAudioFile: (file: File) => Promise<void>;
}

const defaultPageConfig: PageConfig = {
  presetId: "letter",
  orientation: "portrait",
};

const defaultPlotConfig: PlotControlConfig = {
  simplifyTolerance: 1.2,
  minPathLength: 12,
  joinTolerance: 8,
  orderStrategy: "nearest",
  strokeWidth: 0.3,
  showTravel: false,
  marginMm: 15,
  scale: 0.9,
  page: defaultPageConfig,
};

const defaultImageConfig: ImageTransformConfig = {
  levels: 6,
  low: 0.15,
  high: 0.9,
  smoothing: 0.4,
  edgeThreshold: 0.65,
  hatchSpacing: 12,
  hatchThreshold: 0.65,
  hatchAmplitude: 8,
  hatchSampleStep: 2,
  gradientLevels: 4,
  gradientLow: 0.2,
  gradientHigh: 0.9,
  crossHatchFamilies: 3,
  crossHatchAngleDelta: 25,
  flowSpacing: 16,
  flowLength: 40,
  flowStep: 4,
  flowThreshold: 0.7,
  halftoneTurns: 20,
  halftoneDensity: 0.7,
  voronoiPoints: 180,
  voronoiRelaxations: 1,
  softLevels: 8,
  softBlurRadius: 6,
};

const defaultNoiseTransform: NoiseTransformConfig = {
  thresholds: 7,
  smoothing: 0.3,
  interferenceMix: 0.5,
  secondaryScale: 220,
  secondaryOctaves: 3,
};

const defaultNoiseFieldConfig: NoiseFieldConfig = {
  width: 720,
  height: 720,
  scale: 180,
  octaves: 4,
  persistence: 0.55,
  lacunarity: 2,
  seed: "plotter-lab",
  offsetX: 0,
  offsetY: 0,
};

const defaultWaveformConfig: WaveformRenderConfig = {
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

export const usePlotterStore = create<PlotterStoreState>((set, get) => ({
  sourceKind: "image",
  transform: "image-brightness",
  status: "idle",
  image: { version: 0 },
  noise: {
    version: 0,
    fieldConfig: defaultNoiseFieldConfig,
    transformConfig: defaultNoiseTransform,
  },
  audio: { version: 0 },
  imageConfig: defaultImageConfig,
  waveformConfig: defaultWaveformConfig,
  plotConfig: defaultPlotConfig,

  setSourceKind: (kind) => set({ sourceKind: kind }),
  setTransform: (mode) => set({ transform: mode }),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ error: message }),
  setDocument: (document, stats) => set({ document, stats }),

  updateImageConfig: (patch) =>
    set((state) => ({ imageConfig: { ...state.imageConfig, ...patch } })),
  updateNoiseTransform: (patch) =>
    set((state) => ({
      noise: {
        ...state.noise,
        transformConfig: { ...state.noise.transformConfig, ...patch },
      },
    })),
  updateNoiseFieldConfig: (patch) =>
    set((state) => ({
      noise: {
        ...state.noise,
        fieldConfig: { ...state.noise.fieldConfig, ...patch },
      },
    })),
  updateWaveformConfig: (patch) =>
    set((state) => ({
      waveformConfig: { ...state.waveformConfig, ...patch },
    })),
  updatePlotConfig: (patch) =>
    set((state) => ({ plotConfig: { ...state.plotConfig, ...patch } })),
  setPageConfig: (page) =>
    set((state) => ({ plotConfig: { ...state.plotConfig, page } })),

  loadImageFile: async (file: File) => {
    set({ status: "loading", error: undefined, sourceKind: "image" });
    try {
      const data = await imageFileToFields(file);
      set((state) => ({
        image: { ...data, version: Date.now() },
        transform: state.transform.startsWith("image")
          ? state.transform
          : "image-brightness",
        status: "idle",
      }));
    } catch (error) {
      set({
        status: "idle",
        error:
          error instanceof Error ? error.message : "Failed to process image.",
      });
    }
  },

  regenerateNoiseField: () => {
    const state = get();
    const field = generateNoiseField(state.noise.fieldConfig);
    set({
      sourceKind: "noise",
      transform: "noise-isolines",
      noise: {
        ...state.noise,
        field,
        version: Date.now(),
      },
    });
  },

  loadAudioFile: async (file: File) => {
    set({ status: "loading", error: undefined, sourceKind: "audio" });
    try {
      const signal = await decodeAudioFile(file);
      set({
        audio: { signal, version: Date.now() },
        transform: "audio-waveform",
        status: "idle",
      });
    } catch (error) {
      set({
        status: "idle",
        error:
          error instanceof Error ? error.message : "Failed to decode audio file.",
      });
    }
  },
}));
