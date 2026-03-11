import { generateContourPolylines } from "../core/transforms/contours";
import { Polyline } from "../core/types";

interface WorkerResponse {
  id: string;
  polylines: Polyline[];
  error?: string;
}

type Payload = Parameters<typeof generateContourPolylines>[0];

export class ContourWorkerClient {
  private worker?: Worker;
  private queue = new Map<
    string,
    { resolve: (value: Polyline[]) => void; reject: (error: Error) => void }
  >();

  constructor() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      this.worker = new Worker(
        new URL("../../workers/contour.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, polylines, error } = event.data;
        const pending = this.queue.get(id);
        if (!pending) return;
        this.queue.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(polylines);
        }
      };
      this.worker.onerror = (event) => {
        console.error("Contour worker error:", event);
      };
    } catch (error) {
      console.warn("Contour worker unavailable, falling back to main thread.", error);
      this.worker = undefined;
    }
  }

  run(payload: Payload): Promise<Polyline[]> {
    if (!this.worker) {
      return Promise.resolve(generateContourPolylines(payload));
    }

    const id = crypto.randomUUID();
    return new Promise<Polyline[]>((resolve, reject) => {
      this.queue.set(id, { resolve, reject });
      this.worker!.postMessage({ id, payload });
    });
  }

  dispose() {
    this.worker?.terminate();
    this.queue.clear();
  }
}

