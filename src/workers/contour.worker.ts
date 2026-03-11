/// <reference lib="webworker" />
import { generateContourPolylines } from "@/lib/core/transforms/contours";

interface WorkerRequest {
  id: string;
  payload: Parameters<typeof generateContourPolylines>[0];
}

interface WorkerResponse {
  id: string;
  polylines: ReturnType<typeof generateContourPolylines>;
  error?: string;
}

const ctx = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, payload } = event.data;
  try {
    const polylines = generateContourPolylines(payload);
    const response: WorkerResponse = { id, polylines };
    ctx.postMessage(response);
  } catch (error) {
    ctx.postMessage({
      id,
      polylines: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export {};

