"use client";

import { Section } from "@/components/ui/Section";
import { Field } from "@/components/ui/Field";
import { usePlotterStore } from "@/store/plotterStore";

const IMAGE_TRANSFORMS = [
  { label: "Brightness isolines", value: "image-brightness" },
  { label: "Edge trace", value: "image-edges" },
  { label: "Tone hatching", value: "image-hatch" },
  { label: "Cross hatching", value: "image-cross-hatch" },
  { label: "Gradient bands", value: "image-gradient-bands" },
  { label: "Ridgeline gradients", value: "image-ridgeline" },
  { label: "Stipple flow", value: "image-stipple-flow" },
  { label: "Halftone spiral", value: "image-halftone-spiral" },
  { label: "Voronoi mosaic", value: "image-voronoi" },
] as const;

const NOISE_TRANSFORMS = [
  { label: "Noise isolines", value: "noise-isolines" },
  { label: "Wave interference", value: "noise-wave-interference" },
] as const;

const AUDIO_TRANSFORMS = [
  { label: "Waveform path", value: "audio-waveform" },
  { label: "Polar spectrum", value: "audio-polar-spectrum" },
  { label: "Temporal ribbon", value: "audio-ribbon" },
] as const;

const AUDIO_LAYOUTS = [
  { label: "Single line", value: "single" },
  { label: "Stacked lines", value: "stacked" },
  { label: "Circle", value: "circle" },
  { label: "Spiral", value: "spiral" },
] as const;

export function TransformPanel() {
  const transform = usePlotterStore((state) => state.transform);
  const sourceKind = usePlotterStore((state) => state.sourceKind);
  const imageConfig = usePlotterStore((state) => state.imageConfig);
  const noiseConfig = usePlotterStore((state) => state.noise.transformConfig);
  const waveformConfig = usePlotterStore((state) => state.waveformConfig);
  const setTransform = usePlotterStore((state) => state.setTransform);
  const updateImageConfig = usePlotterStore((state) => state.updateImageConfig);
  const updateNoiseTransform = usePlotterStore(
    (state) => state.updateNoiseTransform,
  );
  const updateWaveformConfig = usePlotterStore(
    (state) => state.updateWaveformConfig,
  );

  const renderTransformControls = () => {
    if (transform === "image-brightness") {
      return (
        <>
          <Field
            label="Levels"
            description={`${imageConfig.levels}`}
            htmlFor="image-levels"
          >
            <input
              id="image-levels"
              type="range"
              min={1}
              max={32}
              value={imageConfig.levels}
              onChange={(event) =>
                updateImageConfig({ levels: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Low cutoff"
            description={imageConfig.low.toFixed(2)}
            htmlFor="image-low"
          >
            <input
              id="image-low"
              type="range"
              min={0}
              max={0.95}
              step={0.01}
              value={imageConfig.low}
              onChange={(event) =>
                updateImageConfig({ low: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="High cutoff"
            description={imageConfig.high.toFixed(2)}
            htmlFor="image-high"
          >
            <input
              id="image-high"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.high}
              onChange={(event) =>
                updateImageConfig({ high: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Contour smoothing"
            description={imageConfig.smoothing.toFixed(2)}
            htmlFor="image-smoothing"
          >
            <input
              id="image-smoothing"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={imageConfig.smoothing}
              onChange={(event) =>
                updateImageConfig({ smoothing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-edges") {
      return (
        <>
          <Field
            label="Edge threshold"
            description={imageConfig.edgeThreshold.toFixed(2)}
            htmlFor="edge-threshold"
          >
            <input
              id="edge-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.edgeThreshold}
              onChange={(event) =>
                updateImageConfig({ edgeThreshold: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Smoothing"
            description={imageConfig.smoothing.toFixed(2)}
            htmlFor="edge-smoothing"
          >
            <input
              id="edge-smoothing"
              type="range"
              min={0}
              max={1.25}
              step={0.05}
              value={imageConfig.smoothing}
              onChange={(event) =>
                updateImageConfig({ smoothing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-hatch") {
      return (
        <>
          <Field
            label="Line spacing"
            description={`${imageConfig.hatchSpacing}px`}
            htmlFor="hatch-spacing"
          >
            <input
              id="hatch-spacing"
              type="range"
              min={2}
              max={80}
              value={imageConfig.hatchSpacing}
              onChange={(event) =>
                updateImageConfig({ hatchSpacing: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Visibility threshold"
            description={imageConfig.hatchThreshold.toFixed(2)}
            htmlFor="hatch-threshold"
          >
            <input
              id="hatch-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.hatchThreshold}
              onChange={(event) =>
                updateImageConfig({
                  hatchThreshold: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Line wobble"
            description={`${imageConfig.hatchAmplitude.toFixed(1)}px`}
            htmlFor="hatch-amp"
          >
            <input
              id="hatch-amp"
              type="range"
              min={0}
              max={40}
              step={0.5}
              value={imageConfig.hatchAmplitude}
              onChange={(event) =>
                updateImageConfig({
                  hatchAmplitude: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Sample step"
            description={`${imageConfig.hatchSampleStep}px`}
            htmlFor="hatch-sample"
          >
            <input
              id="hatch-sample"
              type="range"
              min={1}
              max={12}
              value={imageConfig.hatchSampleStep}
              onChange={(event) =>
                updateImageConfig({
                  hatchSampleStep: Number(event.target.value),
                })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-cross-hatch") {
      return (
        <>
          <Field
            label="Families"
            description={`${imageConfig.crossHatchFamilies}`}
            htmlFor="cross-families"
          >
            <input
              id="cross-families"
              type="range"
              min={1}
              max={8}
              value={imageConfig.crossHatchFamilies}
              onChange={(event) =>
                updateImageConfig({
                  crossHatchFamilies: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Angle delta"
            description={`${imageConfig.crossHatchAngleDelta.toFixed(0)}°`}
            htmlFor="cross-angle"
          >
            <input
              id="cross-angle"
              type="range"
              min={5}
              max={90}
              value={imageConfig.crossHatchAngleDelta}
              onChange={(event) =>
                updateImageConfig({
                  crossHatchAngleDelta: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Spacing"
            description={`${imageConfig.hatchSpacing}px`}
            htmlFor="cross-spacing"
          >
            <input
              id="cross-spacing"
              type="range"
              min={2}
              max={80}
              value={imageConfig.hatchSpacing}
              onChange={(event) =>
                updateImageConfig({ hatchSpacing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-gradient-bands") {
      return (
        <>
          <Field
            label="Band count"
            description={`${imageConfig.gradientLevels}`}
            htmlFor="gradient-levels"
          >
            <input
              id="gradient-levels"
              type="range"
              min={2}
              max={24}
              value={imageConfig.gradientLevels}
              onChange={(event) =>
                updateImageConfig({
                  gradientLevels: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Gradient low"
            description={imageConfig.gradientLow.toFixed(2)}
            htmlFor="gradient-low"
          >
            <input
              id="gradient-low"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.gradientLow}
              onChange={(event) =>
                updateImageConfig({
                  gradientLow: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Gradient high"
            description={imageConfig.gradientHigh.toFixed(2)}
            htmlFor="gradient-high"
          >
            <input
              id="gradient-high"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.gradientHigh}
              onChange={(event) =>
                updateImageConfig({
                  gradientHigh: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Smoothing"
            description={imageConfig.smoothing.toFixed(2)}
            htmlFor="gradient-smoothing"
          >
            <input
              id="gradient-smoothing"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={imageConfig.smoothing}
              onChange={(event) =>
                updateImageConfig({ smoothing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-ridgeline") {
      return (
        <>
          <Field
            label="Bands"
            description={`${imageConfig.gradientLevels}`}
            htmlFor="ridge-levels"
          >
            <input
              id="ridge-levels"
              type="range"
              min={2}
              max={24}
              value={imageConfig.gradientLevels}
              onChange={(event) =>
                updateImageConfig({
                  gradientLevels: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Smoothing"
            description={imageConfig.smoothing.toFixed(2)}
            htmlFor="ridge-smoothing"
          >
            <input
              id="ridge-smoothing"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={imageConfig.smoothing}
              onChange={(event) =>
                updateImageConfig({ smoothing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-stipple-flow") {
      return (
        <>
          <Field
            label="Grid spacing"
            description={`${imageConfig.flowSpacing}px`}
            htmlFor="flow-spacing"
          >
            <input
              id="flow-spacing"
              type="range"
              min={2}
              max={64}
              value={imageConfig.flowSpacing}
              onChange={(event) =>
                updateImageConfig({ flowSpacing: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Segment length"
            description={`${imageConfig.flowLength}px`}
            htmlFor="flow-length"
          >
            <input
              id="flow-length"
              type="range"
              min={10}
              max={240}
              value={imageConfig.flowLength}
              onChange={(event) =>
                updateImageConfig({ flowLength: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Step size"
            description={`${imageConfig.flowStep}px`}
            htmlFor="flow-step"
          >
            <input
              id="flow-step"
              type="range"
              min={1}
              max={20}
              value={imageConfig.flowStep}
              onChange={(event) =>
                updateImageConfig({ flowStep: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Brightness threshold"
            description={imageConfig.flowThreshold.toFixed(2)}
            htmlFor="flow-threshold"
          >
            <input
              id="flow-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={imageConfig.flowThreshold}
              onChange={(event) =>
                updateImageConfig({ flowThreshold: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-halftone-spiral") {
      return (
        <>
          <Field
            label="Turns"
            description={`${imageConfig.halftoneTurns}`}
            htmlFor="halftone-turns"
          >
            <input
              id="halftone-turns"
              type="range"
              min={1}
              max={120}
              value={imageConfig.halftoneTurns}
              onChange={(event) =>
                updateImageConfig({
                  halftoneTurns: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Density"
            description={imageConfig.halftoneDensity.toFixed(2)}
            htmlFor="halftone-density"
          >
            <input
              id="halftone-density"
              type="range"
              min={0.1}
              max={2.5}
              step={0.05}
              value={imageConfig.halftoneDensity}
              onChange={(event) =>
                updateImageConfig({
                  halftoneDensity: Number(event.target.value),
                })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "image-voronoi") {
      return (
        <>
          <Field
            label="Point count"
            description={`${imageConfig.voronoiPoints}`}
            htmlFor="voronoi-points"
          >
            <input
              id="voronoi-points"
              type="range"
              min={20}
              max={1000}
              step={10}
              value={imageConfig.voronoiPoints}
              onChange={(event) =>
                updateImageConfig({
                  voronoiPoints: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Relaxation passes"
            description={`${imageConfig.voronoiRelaxations}`}
            htmlFor="voronoi-relax"
          >
            <input
              id="voronoi-relax"
              type="range"
              min={0}
              max={6}
              value={imageConfig.voronoiRelaxations}
              onChange={(event) =>
                updateImageConfig({
                  voronoiRelaxations: Number(event.target.value),
                })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "noise-isolines") {
      return (
        <>
          <Field
            label="Contour count"
            description={`${noiseConfig.thresholds}`}
            htmlFor="noise-levels"
          >
            <input
              id="noise-levels"
              type="range"
              min={1}
              max={40}
              value={noiseConfig.thresholds}
              onChange={(event) =>
                updateNoiseTransform({ thresholds: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Smoothing"
            description={noiseConfig.smoothing.toFixed(2)}
            htmlFor="noise-smoothing"
          >
            <input
              id="noise-smoothing"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={noiseConfig.smoothing}
              onChange={(event) =>
                updateNoiseTransform({ smoothing: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "noise-wave-interference") {
      return (
        <>
          <Field
            label="Contour count"
            description={`${noiseConfig.thresholds}`}
            htmlFor="interference-levels"
          >
            <input
              id="interference-levels"
              type="range"
              min={3}
              max={24}
              value={noiseConfig.thresholds}
              onChange={(event) =>
                updateNoiseTransform({ thresholds: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Mix"
            description={(noiseConfig.interferenceMix * 100).toFixed(0) + "%"}
            htmlFor="interference-mix"
          >
            <input
              id="interference-mix"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={noiseConfig.interferenceMix}
              onChange={(event) =>
                updateNoiseTransform({
                  interferenceMix: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Secondary scale"
            description={`${noiseConfig.secondaryScale}px`}
            htmlFor="interference-scale"
          >
            <input
              id="interference-scale"
              type="range"
              min={20}
              max={800}
              step={10}
              value={noiseConfig.secondaryScale}
              onChange={(event) =>
                updateNoiseTransform({
                  secondaryScale: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Secondary octaves"
            description={`${noiseConfig.secondaryOctaves}`}
            htmlFor="interference-octaves"
          >
            <input
              id="interference-octaves"
              type="range"
              min={1}
              max={8}
              value={noiseConfig.secondaryOctaves}
              onChange={(event) =>
                updateNoiseTransform({
                  secondaryOctaves: Number(event.target.value),
                })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "audio-waveform") {
      return (
        <>
          <Field label="Layout">
            <select
              value={waveformConfig.mode}
              onChange={(event) =>
                updateWaveformConfig({
                  mode: event.target.value as typeof waveformConfig.mode,
                })
              }
              className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white"
            >
              {AUDIO_LAYOUTS.map((layout) => (
                <option key={layout.value} value={layout.value}>
                  {layout.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Sample points"
            description={`${waveformConfig.samplePoints}`}
            htmlFor="waveform-points"
          >
            <input
              id="waveform-points"
              type="range"
              min={100}
              max={8000}
              step={100}
              value={waveformConfig.samplePoints}
              onChange={(event) =>
                updateWaveformConfig({ samplePoints: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Amplitude"
            description={waveformConfig.amplitude.toFixed(2)}
            htmlFor="waveform-amp"
          >
            <input
              id="waveform-amp"
              type="range"
              min={0.05}
              max={3}
              step={0.05}
              value={waveformConfig.amplitude}
              onChange={(event) =>
                updateWaveformConfig({ amplitude: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Smoothing window"
            description={`${waveformConfig.smoothingWindow}`}
            htmlFor="waveform-smoothing"
          >
            <input
              id="waveform-smoothing"
              type="range"
              min={1}
              max={15}
              step={1}
              value={waveformConfig.smoothingWindow}
              onChange={(event) =>
                updateWaveformConfig({
                  smoothingWindow: Number(event.target.value),
                })
              }
            />
          </Field>
          {waveformConfig.mode === "stacked" ? (
            <>
              <Field
                label="Line count"
                description={`${waveformConfig.lineCount}`}
                htmlFor="stacked-count"
              >
                <input
                  id="stacked-count"
                  type="range"
              min={2}
              max={16}
                  value={waveformConfig.lineCount}
                  onChange={(event) =>
                    updateWaveformConfig({
                      lineCount: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                label="Line spacing"
                description={`${waveformConfig.stackSpacing}px`}
                htmlFor="stacked-spacing"
              >
                <input
                  id="stacked-spacing"
                  type="range"
              min={20}
              max={240}
                  step={5}
                  value={waveformConfig.stackSpacing}
                  onChange={(event) =>
                    updateWaveformConfig({
                      stackSpacing: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </>
          ) : null}
          {waveformConfig.mode === "circle" ? (
            <Field
              label="Radius"
              description={`${(waveformConfig.circleRadiusRatio * 100).toFixed(0)}%`}
              htmlFor="circle-radius"
            >
              <input
                id="circle-radius"
                type="range"
              min={0.05}
              max={0.75}
                step={0.02}
                value={waveformConfig.circleRadiusRatio}
                onChange={(event) =>
                  updateWaveformConfig({
                    circleRadiusRatio: Number(event.target.value),
                  })
                }
              />
            </Field>
          ) : null}
          {waveformConfig.mode === "spiral" ? (
            <>
              <Field
                label="Turns"
                description={`${waveformConfig.spiralTurns}`}
                htmlFor="spiral-turns"
              >
                <input
                  id="spiral-turns"
                  type="range"
              min={1}
              max={24}
                  value={waveformConfig.spiralTurns}
                  onChange={(event) =>
                    updateWaveformConfig({
                      spiralTurns: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                label="Inner radius"
                description={`${(waveformConfig.spiralInnerRatio * 100).toFixed(
                  0,
                )}%`}
                htmlFor="spiral-inner"
              >
                <input
                  id="spiral-inner"
                  type="range"
              min={0.02}
              max={0.6}
                  step={0.01}
                  value={waveformConfig.spiralInnerRatio}
                  onChange={(event) =>
                    updateWaveformConfig({
                      spiralInnerRatio: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                label="Outer radius"
                description={`${(waveformConfig.spiralOuterRatio * 100).toFixed(
                  0,
                )}%`}
                htmlFor="spiral-outer"
              >
                <input
                  id="spiral-outer"
                  type="range"
              min={0.3}
              max={0.98}
                  step={0.01}
                  value={waveformConfig.spiralOuterRatio}
                  onChange={(event) =>
                    updateWaveformConfig({
                      spiralOuterRatio: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </>
          ) : null}
        </>
      );
    }

    if (transform === "audio-polar-spectrum") {
      return (
        <>
          <Field
            label="Bins"
            description={`${waveformConfig.spectrumBins}`}
            htmlFor="spectrum-bins"
          >
            <input
              id="spectrum-bins"
              type="range"
              min={6}
              max={96}
              value={waveformConfig.spectrumBins}
              onChange={(event) =>
                updateWaveformConfig({
                  spectrumBins: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Radius"
            description={`${(waveformConfig.spectrumRadiusRatio * 100).toFixed(
              0,
            )}%`}
            htmlFor="spectrum-radius"
          >
            <input
              id="spectrum-radius"
              type="range"
              min={0.05}
              max={0.85}
              step={0.02}
              value={waveformConfig.spectrumRadiusRatio}
              onChange={(event) =>
                updateWaveformConfig({
                  spectrumRadiusRatio: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Amplitude"
            description={waveformConfig.amplitude.toFixed(2)}
            htmlFor="spectrum-amp"
          >
            <input
              id="spectrum-amp"
              type="range"
              min={0.2}
              max={1.5}
              step={0.05}
              value={waveformConfig.amplitude}
              onChange={(event) =>
                updateWaveformConfig({ amplitude: Number(event.target.value) })
              }
            />
          </Field>
        </>
      );
    }

    if (transform === "audio-ribbon") {
      return (
        <>
          <Field
            label="Layers"
            description={`${waveformConfig.ribbonLayers}`}
            htmlFor="ribbon-layers"
          >
            <input
              id="ribbon-layers"
              type="range"
              min={2}
              max={48}
              value={waveformConfig.ribbonLayers}
              onChange={(event) =>
                updateWaveformConfig({
                  ribbonLayers: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Layer offset"
            description={`${waveformConfig.ribbonOffset}px`}
            htmlFor="ribbon-offset"
          >
            <input
              id="ribbon-offset"
              type="range"
              min={0}
              max={80}
              value={waveformConfig.ribbonOffset}
              onChange={(event) =>
                updateWaveformConfig({
                  ribbonOffset: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Horizontal drift"
            description={`${waveformConfig.ribbonDrift.toFixed(1)}px`}
            htmlFor="ribbon-drift"
          >
            <input
              id="ribbon-drift"
              type="range"
              min={0}
              max={80}
              step={1}
              value={waveformConfig.ribbonDrift}
              onChange={(event) =>
                updateWaveformConfig({
                  ribbonDrift: Number(event.target.value),
                })
              }
            />
          </Field>
        </>
      );
    }

    return null;
  };

  const options =
    sourceKind === "image"
      ? IMAGE_TRANSFORMS
      : sourceKind === "noise"
        ? NOISE_TRANSFORMS
        : AUDIO_TRANSFORMS;

  return (
    <Section
      title="Transform"
      description="Convert scalar fields or signals into polylines."
    >
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTransform(option.value)}
            className={
              transform === option.value
                ? "rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100"
                : "rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-white/30"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-3">{renderTransformControls()}</div>
    </Section>
  );
}
