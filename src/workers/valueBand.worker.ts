/// <reference lib="webworker" />

import { BufferGeometry, Float32BufferAttribute } from "three";

import {
  buildTriangleGraph,
  computeCleanedStudyBandsFromGraph,
  type TriangleGraph,
} from "../lib/valueBandCleanup";
import type {
  ValueBandWorkerInput,
  ValueBandWorkerOutput,
} from "../lib/valueBandWorkerProtocol";

const workerScope = self as DedicatedWorkerGlobalScope;
let graph: TriangleGraph | null = null;

function postError(requestId: number | null, error: unknown): void {
  const message: ValueBandWorkerOutput = {
    type: "error",
    requestId,
    message: error instanceof Error ? error.message : String(error),
  };
  workerScope.postMessage(message);
}

workerScope.onmessage = (event: MessageEvent<ValueBandWorkerInput>) => {
  const message = event.data;

  try {
    if (message.type === "initialize") {
      if (graph) {
        throw new Error("Value band worker was initialized more than once");
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(new Float32Array(message.positions), 3),
      );
      message.groups.forEach((group) => {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      });
      graph = buildTriangleGraph(geometry, { collectBlockedEdges: false });
      geometry.dispose();
      workerScope.postMessage({ type: "ready" } satisfies ValueBandWorkerOutput);
      return;
    }

    if (!graph) {
      throw new Error("Value band worker received a computation before initialization");
    }

    const result = computeCleanedStudyBandsFromGraph(graph, message.settings);
    const bands = result.overrideBands;
    const bandsBuffer = bands.buffer as ArrayBuffer;
    workerScope.postMessage(
      {
        type: "result",
        requestId: message.requestId,
        bands: bandsBuffer,
      } satisfies ValueBandWorkerOutput,
      [bandsBuffer],
    );
  } catch (error) {
    postError(message.type === "compute" ? message.requestId : null, error);
  }
};

export {};
