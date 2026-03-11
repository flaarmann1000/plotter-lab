"use client";

import { ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Section } from "@/components/ui/Section";
import { usePlotterStore } from "@/store/plotterStore";

export function SourcePanel() {
  const sourceKind = usePlotterStore((state) => state.sourceKind);
  const setSourceKind = usePlotterStore((state) => state.setSourceKind);
  const loadImageFile = usePlotterStore((state) => state.loadImageFile);
  const regenerateNoiseField = usePlotterStore(
    (state) => state.regenerateNoiseField,
  );
  const loadAudioFile = usePlotterStore((state) => state.loadAudioFile);
  const imageMeta = usePlotterStore((state) => state.image.metadata);
  const noiseConfig = usePlotterStore((state) => state.noise.fieldConfig);
  const audioSignal = usePlotterStore((state) => state.audio.signal);
  const updateNoiseFieldConfig = usePlotterStore(
    (state) => state.updateNoiseFieldConfig,
  );

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadImageFile(file);
    }
  };

  const handleAudioChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadAudioFile(file);
    }
  };

  const updateNoiseValue = (key: keyof typeof noiseConfig, value: number) => {
    updateNoiseFieldConfig({ [key]: value } as Partial<typeof noiseConfig>);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Source" description="Choose what feeds the pipeline.">
        <div className="grid grid-cols-3 gap-2">
          {(["image", "noise", "audio"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setSourceKind(kind)}
              className={
                sourceKind === kind
                  ? "rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-2 py-2 text-sm font-medium capitalize text-white"
                  : "rounded-lg border border-white/10 bg-transparent px-2 py-2 text-sm capitalize text-slate-300 hover:border-white/30"
              }
            >
              {kind}
            </button>
          ))}
        </div>
      </Section>

      {sourceKind === "image" ? (
        <Section title="Image input" description="Raster to scalar field.">
          <Field label="Upload" description="PNG / JPG / GIF / WEBP">
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleImageChange}
              className="text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-1 file:text-slate-900 file:hover:bg-white/30"
            />
          </Field>
          {imageMeta ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p>
                Dimensions: {imageMeta.width} x {imageMeta.height} px
              </p>
              <p>Histogram buckets: {imageMeta.histogram.length}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Import an image to unlock isolines and edge tracing.
            </p>
          )}
        </Section>
      ) : null}

      {sourceKind === "noise" ? (
        <Section
          title="Procedural field"
          description="Perlin-style noise sampled on a grid."
        >
          <Field
            label="Resolution"
            description={`${noiseConfig.width} px`}
            htmlFor="resolution"
          >
            <input
              id="resolution"
              type="range"
              min={256}
              max={1536}
              step={64}
              value={noiseConfig.width}
              onChange={(event) => {
                const value = Number(event.target.value);
                updateNoiseFieldConfig({ width: value, height: value });
              }}
            />
          </Field>
          <Field
            label="Scale"
            description={`${noiseConfig.scale.toFixed(0)} px`}
            htmlFor="noise-scale"
          >
            <input
              id="noise-scale"
              type="range"
              min={40}
              max={400}
              step={10}
              value={noiseConfig.scale}
              onChange={(event) =>
                updateNoiseValue("scale", Number(event.target.value))
              }
            />
          </Field>
          <Field
            label="Octaves"
            description={`${noiseConfig.octaves}`}
            htmlFor="octaves"
          >
            <input
              id="octaves"
              type="range"
              min={1}
              max={6}
              value={noiseConfig.octaves}
              onChange={(event) =>
                updateNoiseValue("octaves", Number(event.target.value))
              }
            />
          </Field>
          <Field
            label="Persistence"
            description={noiseConfig.persistence.toFixed(2)}
            htmlFor="persistence"
          >
            <input
              id="persistence"
              type="range"
              min={0.2}
              max={0.9}
              step={0.05}
              value={noiseConfig.persistence}
              onChange={(event) =>
                updateNoiseValue("persistence", Number(event.target.value))
              }
            />
          </Field>
          <Field
            label="Lacunarity"
            description={noiseConfig.lacunarity.toFixed(2)}
            htmlFor="lacunarity"
          >
            <input
              id="lacunarity"
              type="range"
              min={1.5}
              max={3.5}
              step={0.1}
              value={noiseConfig.lacunarity}
              onChange={(event) =>
                updateNoiseValue("lacunarity", Number(event.target.value))
              }
            />
          </Field>
          <Field label="Seed">
            <input
              type="text"
              value={noiseConfig.seed}
              onChange={(event) =>
                updateNoiseFieldConfig({ seed: event.target.value })
              }
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
            />
          </Field>
          <Button onClick={regenerateNoiseField}>Regenerate noise</Button>
        </Section>
      ) : null}

      {sourceKind === "audio" ? (
        <Section
          title="Audio input"
          description="Decode a WAV and map samples to strokes."
        >
          <Field label="Upload" description=".wav">
            <input
              type="file"
              accept="audio/wav"
              onChange={handleAudioChange}
              className="text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-1 file:text-slate-900 file:hover:bg-white/30"
            />
          </Field>
          {audioSignal ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p>Duration: {audioSignal.duration.toFixed(2)} s</p>
              <p>Sample rate: {audioSignal.sampleRate} Hz</p>
              <p>Channels decoded: {audioSignal.channels}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Import a WAV file to extract a waveform.
            </p>
          )}
        </Section>
      ) : null}
    </div>
  );
}
