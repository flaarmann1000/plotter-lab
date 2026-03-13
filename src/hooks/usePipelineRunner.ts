
import { useEffect, useRef } from "react";
import { ContourWorkerClient } from "@/lib/workers/contourClient";
import { generateContourPolylines } from "@/lib/core/transforms/contours";
import { executeNodeGraph, NodeAssetRecord } from "@/lib/core/nodes/runtime";
import { usePlotterStore } from "@/store/plotterStore";

export function usePipelineRunner() {
  const graph = usePlotterStore((state) => state.graph);
  const graphVersion = usePlotterStore((state) => state.graphVersion);
  const assets = usePlotterStore((state) => state.assets);
  const setNodeStates = usePlotterStore((state) => state.setNodeStates);
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
        const result = await executeNodeGraph(graph, {
          assets: assets as NodeAssetRecord,
          extras: { contourRunner },
        });
        if (!cancelled) {
          setNodeStates(result);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Failed to evaluate node graph.");
          setStatus("idle");
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [graph, graphVersion, assets, setNodeStates, setStatus, setError]);
}
