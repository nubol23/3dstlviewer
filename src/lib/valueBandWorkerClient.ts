import { BufferAttribute, type BufferGeometry } from "three";

import type { StudyBandComputationSettings } from "./valueBandCleanup";
import type {
  ValueBandWorkerInput,
  ValueBandWorkerOutput,
} from "./valueBandWorkerProtocol";

type PendingRequest = {
  requestId: number;
  settings: StudyBandComputationSettings;
  resolve: (bands: Int8Array) => void;
  reject: (error: Error) => void;
};

export class BandRequestSupersededError extends Error {
  constructor() {
    super("Value band request was superseded by newer settings");
    this.name = "BandRequestSupersededError";
  }
}

export class ValueBandWorkerClient {
  private readonly worker: Worker;
  private ready = false;
  private disposed = false;
  private fatalError: Error | null = null;
  private nextRequestId = 1;
  private activeRequest: PendingRequest | null = null;
  private queuedRequest: PendingRequest | null = null;

  constructor(geometry: BufferGeometry) {
    const position = geometry.getAttribute("position");
    if (!(position instanceof BufferAttribute) || position.itemSize !== 3) {
      throw new Error("Cannot initialize value band worker: invalid position attribute");
    }

    const positions = Float32Array.from(position.array as ArrayLike<number>);
    const groups = geometry.groups.map((group) => ({
      start: group.start,
      count: group.count,
      materialIndex: group.materialIndex ?? 0,
    }));

    this.worker = new Worker(
      new URL("../workers/valueBand.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<ValueBandWorkerOutput>) => {
      this.handleMessage(event.data);
    };
    this.worker.onerror = (event) => {
      this.failPermanently(new Error(`Value band worker failed: ${event.message}`));
    };

    const message: ValueBandWorkerInput = {
      type: "initialize",
      positions: positions.buffer,
      groups,
    };
    this.worker.postMessage(message, [positions.buffer]);
  }

  compute(settings: StudyBandComputationSettings): Promise<Int8Array> {
    if (this.disposed) {
      return Promise.reject(new Error("Cannot compute value bands after worker disposal"));
    }
    if (this.fatalError) {
      return Promise.reject(this.fatalError);
    }

    return new Promise((resolve, reject) => {
      const request: PendingRequest = {
        requestId: this.nextRequestId,
        settings,
        resolve,
        reject,
      };
      this.nextRequestId += 1;

      if (this.activeRequest || !this.ready) {
        this.queuedRequest?.reject(new BandRequestSupersededError());
        this.queuedRequest = request;
        return;
      }

      this.startRequest(request);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.failAll(new Error("Value band worker was disposed"));
    this.worker.terminate();
  }

  private handleMessage(message: ValueBandWorkerOutput): void {
    if (this.disposed) {
      return;
    }

    if (message.type === "ready") {
      this.ready = true;
      this.pumpQueuedRequest();
      return;
    }

    if (message.type === "error") {
      const error = new Error(message.message);
      if (message.requestId === null) {
        this.failPermanently(error);
        return;
      }
      if (this.activeRequest?.requestId === message.requestId) {
        this.activeRequest.reject(error);
        this.activeRequest = null;
        this.pumpQueuedRequest();
      }
      return;
    }

    if (this.activeRequest?.requestId !== message.requestId) {
      return;
    }
    this.activeRequest.resolve(new Int8Array(message.bands));
    this.activeRequest = null;
    this.pumpQueuedRequest();
  }

  private startRequest(request: PendingRequest): void {
    this.activeRequest = request;
    const message: ValueBandWorkerInput = {
      type: "compute",
      requestId: request.requestId,
      settings: request.settings,
    };
    this.worker.postMessage(message);
  }

  private pumpQueuedRequest(): void {
    if (!this.ready || this.activeRequest || !this.queuedRequest || this.disposed) {
      return;
    }
    const request = this.queuedRequest;
    this.queuedRequest = null;
    this.startRequest(request);
  }

  private failAll(error: Error): void {
    this.activeRequest?.reject(error);
    this.queuedRequest?.reject(error);
    this.activeRequest = null;
    this.queuedRequest = null;
  }

  private failPermanently(error: Error): void {
    if (this.fatalError || this.disposed) {
      return;
    }
    this.fatalError = error;
    this.failAll(error);
    this.worker.terminate();
  }
}
