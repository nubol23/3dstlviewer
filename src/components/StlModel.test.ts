// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, type BufferGeometry, Vector3 } from "three";

import type { LightState, LoadedModel, ValueRampState } from "../types";
import { createCubeGeometry } from "../test/fixtures";

const valueBandCleanup = vi.hoisted(() => ({
  applyStudyBandsToGeometry: vi.fn(),
  createStudyBandComputationSettings: vi.fn(() => ({ settings: true })),
  ensureStudyBandAttribute: vi.fn(),
  resetStudyBandAttribute: vi.fn(),
}));

const workerClient = vi.hoisted(() => ({
  compute: vi.fn(),
  dispose: vi.fn(),
}));
const valueBandWorkerClientConstructor = vi.hoisted(() =>
  vi.fn(function ValueBandWorkerClient() {
    return workerClient;
  }),
);

vi.mock("../lib/valueBandCleanup", () => valueBandCleanup);
vi.mock("../lib/valueBandWorkerClient", () => ({
  BandRequestSupersededError: class BandRequestSupersededError extends Error {},
  ValueBandWorkerClient: valueBandWorkerClientConstructor,
}));
vi.mock("./StudyMaterial", () => ({ StudyMaterial: () => null }));

import {
  CLEAN_BAND_TRIANGLE_LIMIT,
  shouldCastPhysicalShadow,
  shouldUseCleanBandWorker,
  StlModel,
} from "./StlModel";

const light: LightState = {
  azimuthDeg: 35,
  elevationDeg: 45,
  distance: 5,
  intensity: 1.2,
  bounceStrength: 0.16,
  shadowSoftness: 0.5,
  locked: false,
};

const valueRamp: ValueRampState = {
  shadowLightness: 18,
  highlightLightness: 88,
  bandBias: 0.1,
};

function createModel(
  triangleCount = 12,
  geometry: BufferGeometry = createCubeGeometry(),
): LoadedModel {
  const center = new Vector3(0, 0, 0);
  const size = new Vector3(1, 1, 1);
  const bounds = new Box3(
    new Vector3(-0.5, -0.5, -0.5),
    new Vector3(0.5, 0.5, 0.5),
  );

  return {
    id: "test-model",
    sourceGeometry: createCubeGeometry(),
    geometry,
    orientation: { operations: [] },
    metadata: {
      fileName: "test.stl",
      fileSize: 123,
      triangleCount,
      loadedAt: 1,
    },
    fit: {
      originalBounds: bounds.clone(),
      fittedBounds: bounds.clone(),
      center,
      size,
      radius: 1,
      scale: 1,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StlModel rendering policy", () => {
  it("always casts physical shadows", () => {
    expect(shouldCastPhysicalShadow()).toBe(true);
  });

  it("uses exact cleanup only for stepped models within the quality budget", () => {
    expect(shouldUseCleanBandWorker("smooth", 10)).toBe(false);
    expect(shouldUseCleanBandWorker("stepped", CLEAN_BAND_TRIANGLE_LIMIT)).toBe(true);
    expect(shouldUseCleanBandWorker("stepped", CLEAN_BAND_TRIANGLE_LIMIT + 1)).toBe(false);
  });

  it("does not allocate study-band attributes in initial smooth mode", async () => {
    const model = createModel();
    render(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "smooth",
        valueStepCount: 5,
        valueRamp,
        lightingMode: "directional",
      }),
    );

    await waitFor(() => expect(workerClient.compute).not.toHaveBeenCalled());
    expect(valueBandCleanup.resetStudyBandAttribute).not.toHaveBeenCalled();
    expect(workerClient.compute).not.toHaveBeenCalled();
  });

  it("shows GPU bands immediately and applies sparse worker cleanup", async () => {
    const model = createModel();
    const bands = new Int8Array([-1, 2]);
    const onBandStatusChange = vi.fn();
    workerClient.compute.mockResolvedValue(bands);

    render(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "stepped",
        valueStepCount: 8,
        valueRamp,
        lightingMode: "classic-top",
        onBandStatusChange,
      }),
    );

    await waitFor(() => {
      expect(workerClient.compute).toHaveBeenCalled();
    });
    expect(valueBandCleanup.resetStudyBandAttribute).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(valueBandCleanup.applyStudyBandsToGeometry).toHaveBeenCalledWith(
        model.geometry,
        bands,
      );
      expect(onBandStatusChange).toHaveBeenCalledWith("clean");
    });
  });

  it("keeps high-poly stepped studies on the responsive GPU path", async () => {
    const model = createModel(CLEAN_BAND_TRIANGLE_LIMIT + 1);
    const onBandStatusChange = vi.fn();

    const { rerender } = render(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "stepped",
        valueStepCount: 8,
        valueRamp,
        lightingMode: "directional",
        onBandStatusChange,
      }),
    );

    await waitFor(() => {
      expect(onBandStatusChange).toHaveBeenCalledWith("fast");
    });

    rerender(
      createElement(StlModel, {
        model,
        light: { ...light, azimuthDeg: 120 },
        renderStyle: "stepped",
        valueStepCount: 8,
        valueRamp,
        lightingMode: "directional",
        onBandStatusChange,
      }),
    );

    await waitFor(() => {
      expect(onBandStatusChange).toHaveBeenCalledTimes(2);
    });
    expect(workerClient.compute).not.toHaveBeenCalled();
    expect(valueBandCleanup.resetStudyBandAttribute).not.toHaveBeenCalled();
    expect(valueBandCleanup.applyStudyBandsToGeometry).not.toHaveBeenCalled();
  });

  it("keeps GPU bands active when the cleanup worker cannot start", async () => {
    const model = createModel();
    const onBandStatusChange = vi.fn();
    valueBandWorkerClientConstructor.mockImplementationOnce(() => {
      throw new Error("Worker unavailable");
    });

    render(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "stepped",
        valueStepCount: 5,
        valueRamp,
        lightingMode: "directional",
        onBandStatusChange,
      }),
    );

    await waitFor(() => {
      expect(onBandStatusChange).toHaveBeenCalledWith("error");
    });
    expect(valueBandCleanup.resetStudyBandAttribute).not.toHaveBeenCalled();
    expect(valueBandCleanup.applyStudyBandsToGeometry).not.toHaveBeenCalled();
  });

  it("clears an applied cleanup once when switching back to smooth", async () => {
    const model = createModel();
    workerClient.compute.mockResolvedValue(new Int8Array([-1, 2]));
    const { rerender } = render(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "stepped",
        valueStepCount: 5,
        valueRamp,
        lightingMode: "directional",
      }),
    );

    await waitFor(() => {
      expect(valueBandCleanup.applyStudyBandsToGeometry).toHaveBeenCalled();
    });

    rerender(
      createElement(StlModel, {
        model,
        light,
        renderStyle: "smooth",
        valueStepCount: 5,
        valueRamp,
        lightingMode: "directional",
      }),
    );

    await waitFor(() => {
      expect(valueBandCleanup.resetStudyBandAttribute).toHaveBeenCalledTimes(1);
      expect(valueBandCleanup.resetStudyBandAttribute).toHaveBeenCalledWith(model.geometry);
    });
  });
});
