import type { StudyBandComputationSettings } from "./valueBandCleanup";

export type ValueBandGeometryGroup = {
  start: number;
  count: number;
  materialIndex: number;
};

export type ValueBandWorkerInput =
  | {
      type: "initialize";
      positions: ArrayBuffer;
      groups: ValueBandGeometryGroup[];
    }
  | {
      type: "compute";
      requestId: number;
      settings: StudyBandComputationSettings;
    };

export type ValueBandWorkerOutput =
  | { type: "ready" }
  | { type: "result"; requestId: number; bands: ArrayBuffer }
  | { type: "error"; requestId: number | null; message: string };
