import { beforeEach, describe, expect, it } from "vitest";
import {
  appReducer,
  readPersistedState,
  toPersistedState,
  writePersistedState,
  createInitialState,
  STORAGE_KEY,
  DEFAULT_LIGHT,
  DEFAULT_ZENITHAL_STUDY,
} from "../state";
import { DEFAULT_VALUE_RAMP } from "../lib/valueRamp";
import {
  computeFitState,
  quantizeValue,
  sphericalToCartesian,
} from "./workerDHelpers";
import { createCubeGeometry } from "./fixtures";
import { Box3, BufferGeometry, Vector3 } from "three";
import type { LoadedModel } from "../types";

const localStorageMock = () => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => {
      return Array.from(store.keys())[index] ?? null;
    },
  } as Storage;
};

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = localStorageMock();
  localStorage.clear();
});

function createModelStub(id: string, fileName: string): LoadedModel {
  const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
  return {
    id,
    sourceGeometry: new BufferGeometry(),
    geometry: new BufferGeometry(),
    orientation: { operations: [] },
    metadata: {
      fileName,
      fileSize: 128,
      triangleCount: 1,
      loadedAt: 1,
    },
    fit: {
      originalBounds: bounds.clone(),
      fittedBounds: bounds.clone(),
      center: new Vector3(0.5, 0.5, 0.5),
      size: new Vector3(1, 1, 1),
      radius: Math.sqrt(3) / 2,
      scale: 1,
    },
  };
}

describe("light spherical conversion", () => {
  it("maps azimuth and elevation at distance onto unit sphere with distance scaling", () => {
    const { x, y, z } = sphericalToCartesian({
      azimuthDeg: 0,
      elevationDeg: 0,
      distance: 4,
    });

    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(4);
  });

  it("maps azimuth 90 degrees to +X direction", () => {
    const { x, y, z } = sphericalToCartesian({
      azimuthDeg: 90,
      elevationDeg: 0,
      distance: 2,
    });

    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
  });

  it("maps elevation 90 degrees to +Y direction", () => {
    const { x, y, z } = sphericalToCartesian({
      azimuthDeg: 45,
      elevationDeg: 90,
      distance: 3,
    });

    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(3);
    expect(z).toBeCloseTo(0);
  });

  it("preserves vector length", () => {
    const { x, y, z } = sphericalToCartesian({
      azimuthDeg: 37,
      elevationDeg: 17,
      distance: 7,
    });
    const length = Math.sqrt(x * x + y * y + z * z);

    expect(length).toBeCloseTo(7);
  });
});

describe("value quantization", () => {
  it("quantizes values to five visible steps", () => {
    expect(quantizeValue(0, 5)).toBe(0);
    expect(quantizeValue(0.12, 5)).toBe(0);
    expect(quantizeValue(0.3, 5)).toBe(0.25);
    expect(quantizeValue(0.49, 5)).toBe(0.5);
    expect(quantizeValue(0.74, 5)).toBe(0.75);
    expect(quantizeValue(1, 5)).toBe(1);
  });

  it("quantizes values to three visible steps", () => {
    expect(quantizeValue(0, 3)).toBe(0);
    expect(quantizeValue(0.25, 3)).toBe(0.5);
    expect(quantizeValue(0.49, 3)).toBe(0.5);
    expect(quantizeValue(0.51, 3)).toBe(0.5);
    expect(quantizeValue(0.75, 3)).toBe(1);
    expect(quantizeValue(1, 3)).toBe(1);
  });
});

describe("geometry fitting", () => {
  it("computes fitted state for bounded geometry", () => {
    const cube = createCubeGeometry(2);
    const fit = computeFitState(cube, 2);

    expect(fit.originalBounds.min.x).toBeCloseTo(-1);
    expect(fit.originalBounds.max.x).toBeCloseTo(1);
    expect(fit.center.toArray()).toEqual([0, 0, 0]);
    expect(fit.size.toArray()).toEqual([2, 2, 2]);
    expect(fit.radius).toBeCloseTo(Math.sqrt(3));
    expect(fit.scale).toBeCloseTo(2 / Math.sqrt(3));
    expect(
      fit.fittedBounds.getSize(new Vector3()).length(),
    ).toBeCloseTo((2 / Math.sqrt(3)) * Math.sqrt(12));
  });

  it("keeps fitted bounds centered on the source center", () => {
    const cube = createCubeGeometry(2);
    const fit = computeFitState(cube, 2);
    const fittedCenter = fit.fittedBounds.getCenter(fit.center.clone());

    expect(fittedCenter.x).toBeCloseTo(fit.center.x);
    expect(fittedCenter.y).toBeCloseTo(fit.center.y);
    expect(fittedCenter.z).toBeCloseTo(fit.center.z);
  });
});

describe("light reducer lock semantics", () => {
  it("ignores light edits while locked", () => {
    const state = createInitialState();
    const lockedState = appReducer(state, { type: "toggle-lock" });
    const updatedLocked = appReducer(lockedState, {
      type: "set-light",
      patch: { intensity: 10 },
    });

    expect(updatedLocked).toBe(lockedState);
    expect(updatedLocked.light.intensity).toBe(state.light.intensity);
  });

  it("does not reset light state when reset is triggered while locked", () => {
    const state = createInitialState();
    const lockedState = appReducer(state, { type: "toggle-lock" });
    const resetLocked = appReducer(lockedState, { type: "reset-light" });

    expect(resetLocked).toBe(lockedState);
    expect(resetLocked.light).toEqual(lockedState.light);
  });

  it("does not apply preset while locked", () => {
    const state = createInitialState();
    const withPreset = appReducer(state, { type: "save-preset" });
    const lockedState = appReducer(withPreset, { type: "toggle-lock" });
    const loaded = appReducer(lockedState, {
      type: "load-preset",
      presetId: withPreset.presets[0]?.id ?? "missing",
    });

    expect(loaded).toBe(lockedState);
    expect(loaded.light).toEqual(lockedState.light);
  });
});

describe("load reducer lifecycle", () => {
  it("ignores stale successes and stale errors", () => {
    const state = createInitialState();
    const older = createModelStub("older", "older.stl");
    const newer = createModelStub("newer", "newer.stl");

    const loadingOlder = appReducer(state, { type: "load-start", requestId: 1 });
    const loadingNewer = appReducer(loadingOlder, { type: "load-start", requestId: 2 });
    const newerLoaded = appReducer(loadingNewer, { type: "load-success", requestId: 2, model: newer });
    const staleOlderLoaded = appReducer(newerLoaded, { type: "load-success", requestId: 1, model: older });
    const staleOlderError = appReducer(staleOlderLoaded, { type: "load-error", requestId: 1, message: "older failed" });

    expect(staleOlderError.model).toBe(newer);
    expect(staleOlderError.loadNotice).toBe("Loaded newer.stl.");
    expect(staleOlderError.error).toBeNull();
    expect(staleOlderError.isLoading).toBe(false);
  });

  it("keeps the previous model when the latest replacement fails", () => {
    const model = createModelStub("current", "current.stl");
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });
    const loaded = appReducer(loading, { type: "load-success", requestId: 1, model });
    const loadingReplacement = appReducer(loaded, { type: "load-start", requestId: 2 });
    const failed = appReducer(loadingReplacement, { type: "load-error", requestId: 2, message: "replacement failed" });

    expect(failed.model).toBe(model);
    expect(failed.error).toBe("replacement failed. Previous model remains loaded.");
    expect(failed.loadNotice).toBeNull();
    expect(failed.isLoading).toBe(false);
  });

  it("clears stale notices while loading and sets a visible success notice", () => {
    const model = createModelStub("current", "current.stl");
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });
    const loaded = appReducer(loading, { type: "load-success", requestId: 1, model });
    const loadingAgain = appReducer(loaded, { type: "load-start", requestId: 2 });

    expect(loaded.loadNotice).toBe("Loaded current.stl.");
    expect(loadingAgain.loadNotice).toBeNull();
  });

  it("clears load success notices without clearing the loaded model", () => {
    const model = createModelStub("current", "current.stl");
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });
    const loaded = appReducer(loading, { type: "load-success", requestId: 1, model });
    const cleared = appReducer(loaded, { type: "clear-load-notice" });

    expect(cleared.model).toBe(model);
    expect(cleared.loadNotice).toBeNull();
    expect(cleared.error).toBeNull();
  });
});

describe("reducer fail-fast validation", () => {
  it("throws for invalid runtime state payloads", () => {
    const state = createInitialState();

    expect(() => appReducer(state, { type: "set-value-mode", valueMode: "bad" as never })).toThrow("Unsupported value mode");
    expect(() => appReducer(state, { type: "set-active-tab", activeTab: "missing" as never })).toThrow("Unsupported active tab");
    expect(() => appReducer(state, { type: "set-light", patch: { intensity: Number.NaN } })).toThrow("Invalid light intensity");
    expect(() => appReducer(state, { type: "set-value-ramp", patch: { bandBias: Infinity } })).toThrow("Invalid value ramp band bias");
    expect(() => appReducer(state, { type: "set-zenithal-study", zenithalStudy: "yes" as never })).toThrow("Invalid zenithal study");
    expect(() => appReducer(state, { type: "set-floor", patch: { roughness: Infinity } })).toThrow("Invalid floor roughness");
  });
});

describe("persistence codec", () => {
  it("round-trips a persisted state through storage", () => {
    localStorage.clear();

    const baseState = createInitialState();
    writePersistedState(baseState);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();

    const parsed = readPersistedState();
    expect(toPersistedState(baseState)).toEqual(parsed);
    expect(parsed).not.toBeNull();
  });

  it("resets invalid persisted schema values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        light: createInitialState().light,
        valueMode: "not-a-mode",
        floor: { color: "#000", roughness: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("resets unsupported versions", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 999,
        light: createInitialState().light,
        valueMode: "shaded",
        floor: { color: "#000", roughness: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("migrates version 1 persisted state with default value ramp and zenithal settings", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        light: createInitialState().light,
        valueMode: "five-step",
        floor: { color: "#000", roughness: 1 },
        presets: [
          {
            id: "legacy",
            name: "Legacy",
            light: createInitialState().light,
            valueMode: "three-step",
          },
        ],
      }),
    );

    const parsed = readPersistedState();

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(3);
    expect(parsed?.valueRamp).toEqual(DEFAULT_VALUE_RAMP);
    expect(parsed?.zenithalStudy).toBe(DEFAULT_ZENITHAL_STUDY);
    expect(parsed?.presets[0]?.valueRamp).toEqual(DEFAULT_VALUE_RAMP);
    expect(parsed?.presets[0]?.zenithalStudy).toBe(DEFAULT_ZENITHAL_STUDY);
  });

  it("migrates version 2 persisted state with default zenithal settings", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        light: createInitialState().light,
        valueMode: "five-step",
        valueRamp: DEFAULT_VALUE_RAMP,
        floor: { color: "#000", roughness: 1 },
        presets: [
          {
            id: "version-2-preset",
            name: "Version 2",
            light: createInitialState().light,
            valueMode: "three-step",
            valueRamp: DEFAULT_VALUE_RAMP,
          },
        ],
      }),
    );

    const parsed = readPersistedState();

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(3);
    expect(parsed?.zenithalStudy).toBe(DEFAULT_ZENITHAL_STUDY);
    expect(parsed?.presets[0]?.zenithalStudy).toBe(DEFAULT_ZENITHAL_STUDY);
  });

  it("resets version 2 persisted state that is missing value ramp settings", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        light: createInitialState().light,
        valueMode: "shaded",
        floor: { color: "#000", roughness: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("resets current persisted state that is missing zenithal settings", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        light: createInitialState().light,
        valueMode: "shaded",
        valueRamp: DEFAULT_VALUE_RAMP,
        floor: { color: "#000", roughness: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("migrates the legacy backlit default light to the front-side default", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        light: {
          ...DEFAULT_LIGHT,
          azimuthDeg: 128,
          locked: true,
        },
        valueMode: "three-step",
        floor: { color: "#000", roughness: 1 },
        presets: [
          {
            id: "front-left-high",
            name: "Front High",
            light: {
              ...DEFAULT_LIGHT,
              azimuthDeg: 132,
              elevationDeg: 54,
              distance: 3,
            },
            valueMode: "shaded",
          },
        ],
      }),
    );

    const state = createInitialState();

    expect(state.light.azimuthDeg).toBe(315);
    expect(state.light.locked).toBe(true);
    expect(state.presets[0]?.name).toBe("Front Left");
    expect(state.presets[0]?.light.azimuthDeg).toBe(315);
    expect(state.valueRamp).toEqual(DEFAULT_VALUE_RAMP);
    expect(state.zenithalStudy).toBe(DEFAULT_ZENITHAL_STUDY);
  });

  it("saves and restores value ramp settings in presets", () => {
    const state = appReducer(createInitialState(), {
      type: "set-value-ramp",
      patch: { shadowLightness: 24, highlightLightness: 92, bandBias: 0.12 },
    });
    const withPreset = appReducer(state, { type: "save-preset" });
    const changed = appReducer(withPreset, {
      type: "set-value-ramp",
      patch: { shadowLightness: 10, highlightLightness: 70, bandBias: -0.1 },
    });
    const restored = appReducer(changed, {
      type: "load-preset",
      presetId: withPreset.presets[0]?.id ?? "missing",
    });

    expect(restored.valueRamp).toEqual({
      shadowLightness: 24,
      highlightLightness: 92,
      bandBias: 0.12,
    });
  });

  it("saves and restores zenithal study settings in presets", () => {
    const state = appReducer(createInitialState(), {
      type: "set-zenithal-study",
      zenithalStudy: true,
    });
    const withPreset = appReducer(state, { type: "save-preset" });
    const changed = appReducer(withPreset, {
      type: "set-zenithal-study",
      zenithalStudy: false,
    });
    const restored = appReducer(changed, {
      type: "load-preset",
      presetId: withPreset.presets[0]?.id ?? "missing",
    });

    expect(restored.zenithalStudy).toBe(true);
  });
});
