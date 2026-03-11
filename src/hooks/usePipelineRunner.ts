import { useEffect, useRef } from "react";
import { buildPlotDocument } from "@/lib/core/pipeline";
import { ContourWorkerClient } from "@/lib/workers/contourClient";
import { generateContourPolylines } from "@/lib/core/transforms/contours";
import { usePlotterStore } from "@/store/plotterStore";

export function usePipelineRunner() {
  const transform = usePlotterStore((state) => state.transform);
  const imageField = usePlotterStore((state) => state.image.grayscale);
  const gradientField = usePlotterStore((state) => state.image.gradient);
  const imageVersion = usePlotterStore((state) => state.image.version);
  const noiseField = usePlotterStore((state) => state.noise.field);
  const noiseVersion = usePlotterStore((state) => state.noise.version);
  const noiseFieldConfig = usePlotterStore(
    (state) => state.noise.fieldConfig,
  );
  const noiseConfig = usePlotterStore(
    (state) => state.noise.transformConfig,
  );
  const audioSignal = usePlotterStore((state) => state.audio.signal);
  const audioVersion = usePlotterStore((state) => state.audio.version);
  const imageConfig = usePlotterStore((state) => state.imageConfig);
  const waveformConfig = usePlotterStore((state) => state.waveformConfig);
  const plotConfig = usePlotterStore((state) => state.plotConfig);
  const setDocument = usePlotterStore((state) => state.setDocument);
  const setStatus = usePlotterStore((state) => state.setStatus);
  const setError = usePlotterStore((state) => state.setError);

  const contourClientRef = useRef<ContourWorkerClient | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const client = new ContourWorkerClient();
    contourClientRef.current = client;
    return () => {
      client.dispose();
      contourClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ready = (() => {
      switch (transform) {
        case "image-brightness":
        case "image-hatch":
        case "image-cross-hatch":
        case "image-stipple-flow":
        case "image-halftone-spiral":
        case "image-voronoi":
          return Boolean(imageField);
        case "image-edges":
        case "image-gradient-bands":
        case "image-ridgeline":
          return Boolean(gradientField);
        case "noise-isolines":
        case "noise-wave-interference":
          return Boolean(noiseField);
        case "audio-waveform":
        case "audio-polar-spectrum":
        case "audio-ribbon":
          return Boolean(audioSignal);
        default:
          return false;
      }
    })();

    if (!ready) {
      setDocument(undefined, undefined);
      return;
    }

    let cancelled = false;
    const contourRunner = (payload: Parameters<typeof generateContourPolylines>[0]) => {
      const client = contourClientRef.current;
      if (client) {
        return client.run(payload);
      }
      return Promise.resolve(generateContourPolylines(payload));
    };

    const run = async () => {
      setStatus("computing");
      try {
        const result = await buildPlotDocument({
          transform,
          imageField,
          gradientField,
          noiseField,
          audioSignal,
          noiseFieldConfig,
          imageConfig,
          noiseConfig,
          waveformConfig,
          plotConfig,
          contourRunner,
        });
        if (!cancelled) {
          setDocument(result.document, result.stats);
          setStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Failed to run pipeline.");
          setStatus("idle");
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    transform,
    imageField,
    gradientField,
    noiseField,
    audioSignal,
    imageConfig,
    noiseConfig,
    noiseFieldConfig,
    waveformConfig,
    plotConfig,
    imageVersion,
    noiseVersion,
    audioVersion,
    setDocument,
    setStatus,
    setError,
  ]);
}
