// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, type BufferGeometry, Vector3 } from "three";

import type { LightState, LoadedModel, ValueRampState } from "../types";
import { createCubeGeometry } from "../test/fixtures";

const valueBandCleanup = vi.hoisted(() => ({
  applyStudyBandsToGeometry: vi.fn(),
  computeCleanStudyBands: vi.fn(),
  ensureStudyBandAttribute: vi.fn(),
  resetStudyBandAttribute: vi.fn(),
}));

vi.mock("../lib/valueBandCleanup", () => valueBandCleanup);

vi.mock("./StudyMaterial", () => ({
  StudyMaterial: () => null,
}));

import { shouldCastPhysicalShadow, shouldComputeCleanStudyBands, StlModel } from "./StlModel";

const light: LightState = {
  azimuthDeg: 35,
  elevationDeg: 45,
  distance: 5,
  intensity: 1.2,
  bounceStrength: 0.35,
  shadowSoftness: 0.5,
  locked: false,
};

const valueRamp: ValueRampState = {
  shadowLightness: 18,
  highlightLightness: 88,
  bandBias: 0.1,
};

function createModel(geometry: BufferGeometry = createCubeGeometry()): LoadedModel {
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
      triangleCount: 1,
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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("StlModel shadow policy", () => {
  it("casts physical shadows in directional mode", () => {
    expect(shouldCastPhysicalShadow(false)).toBe(true);
  });

  it("does not cast physical ground shadows in zenithal mode", () => {
    expect(shouldCastPhysicalShadow(true)).toBe(false);
  });
});

describe("StlModel value-band cleanup", () => {
  it.each([
    ["shaded", false],
    ["three-step", true],
    ["five-step", true],
  ] as const)("reports whether %s mode needs clean study bands", (valueMode, expected) => {
    expect(shouldComputeCleanStudyBands(valueMode)).toBe(expected);
  });

  it("resets study bands without scheduling cleanup in shaded mode", () => {
    const model = createModel();

    render(
      createElement(StlModel, {
        model,
        light,
        valueMode: "shaded",
        valueRamp,
        zenithalStudy: false,
      }),
    );

    expect(valueBandCleanup.resetStudyBandAttribute).toHaveBeenCalledWith(model.geometry);
    expect(valueBandCleanup.ensureStudyBandAttribute).not.toHaveBeenCalled();
    expect(valueBandCleanup.computeCleanStudyBands).not.toHaveBeenCalled();
  });

  it("schedules clean band recomputation for quantized modes", async () => {
    vi.useFakeTimers();
    const model = createModel();
    const bands = new Int8Array([0, 1]);
    valueBandCleanup.computeCleanStudyBands.mockResolvedValue(bands);

    render(
      createElement(StlModel, {
        model,
        light,
        valueMode: "three-step",
        valueRamp,
        zenithalStudy: true,
      }),
    );

    expect(valueBandCleanup.ensureStudyBandAttribute).toHaveBeenCalledWith(model.geometry);
    expect(valueBandCleanup.computeCleanStudyBands).not.toHaveBeenCalled();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(valueBandCleanup.computeCleanStudyBands).toHaveBeenCalledWith({
      geometry: model.geometry,
      light,
      lightTarget: model.fit.center,
      valueMode: "three-step",
      valueRamp: { bandBias: valueRamp.bandBias },
      zenithalStudy: true,
    });
    expect(valueBandCleanup.applyStudyBandsToGeometry).toHaveBeenCalledWith(model.geometry, bands);
  });

  it("discards late band results after inputs change", async () => {
    vi.useFakeTimers();
    const model = createModel();
    const staleBands = new Int8Array([0]);
    const currentBands = new Int8Array([1]);
    let resolveStaleBands!: (bands: Int8Array) => void;

    valueBandCleanup.computeCleanStudyBands
      .mockReturnValueOnce(new Promise<Int8Array>((resolve) => {
        resolveStaleBands = resolve;
      }))
      .mockResolvedValueOnce(currentBands);

    const { rerender } = render(
      createElement(StlModel, {
        model,
        light,
        valueMode: "three-step",
        valueRamp,
        zenithalStudy: false,
      }),
    );

    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    rerender(
      createElement(StlModel, {
        model,
        light,
        valueMode: "three-step",
        valueRamp: { ...valueRamp, bandBias: -0.1 },
        zenithalStudy: false,
      }),
    );

    await act(async () => {
      resolveStaleBands(staleBands);
      await Promise.resolve();
    });

    expect(valueBandCleanup.applyStudyBandsToGeometry).not.toHaveBeenCalledWith(model.geometry, staleBands);

    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(valueBandCleanup.applyStudyBandsToGeometry).toHaveBeenCalledWith(model.geometry, currentBands);
  });
});
