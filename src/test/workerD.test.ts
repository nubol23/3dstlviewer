import { beforeEach, describe, expect, it } from "vitest";
import {
  appReducer,
  readPersistedState,
  toPersistedState,
  writePersistedState,
  createInitialState,
  STORAGE_KEY,
  DEFAULT_LIGHTING_MODE,
  DEFAULT_RENDER_STYLE,
  DEFAULT_VALUE_STEP_COUNT,
  LIGHT_SETUPS,
  MAX_PRESETS,
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

  it("does not apply setups or color palettes while locked", () => {
    const lockedState = appReducer(createInitialState(), { type: "toggle-lock" });

    expect(appReducer(lockedState, { type: "apply-light-setup", setupId: "dual" })).toBe(lockedState);
    expect(appReducer(lockedState, { type: "set-key-color-preset", preset: "warm" })).toBe(lockedState);
    expect(appReducer(lockedState, { type: "set-fill-palette", palette: "cool" })).toBe(lockedState);
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

describe("opposing directional fill", () => {
  it("links azimuth by default while keeping elevation, ratio and softness independent", () => {
    let state = appReducer(createInitialState(), { type: "apply-light-setup", setupId: "dual" });
    expect(state.light.secondaryOpposite).toBe(true);
    expect(state.light.secondaryAzimuthDeg).toBe(135);
    expect(state.light.secondaryIntensity).toBe(0.3);
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 350, elevationDeg: 70, secondaryElevationDeg: 25, secondaryIntensity: 1.2 } });
    expect(state.light.secondaryAzimuthDeg).toBe(170);
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 180 } });
    expect(state.light.secondaryAzimuthDeg).toBe(0);
    expect(state.light.secondaryElevationDeg).toBe(25);
    expect(state.light.secondaryIntensity).toBe(1.2);
    expect(state.light.shadowSoftness).toBe(0.35);
  });

  it("unlinks without a jump and relinks only the azimuth", () => {
    let state = appReducer(createInitialState(), { type: "apply-light-setup", setupId: "dual" });
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 270 } });
    state = appReducer(state, { type: "set-light", patch: { secondaryOpposite: false } });
    expect(state.light.secondaryAzimuthDeg).toBe(90);
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 30 } });
    expect(state.light.secondaryAzimuthDeg).toBe(90);
    state = appReducer(state, { type: "set-light", patch: { secondaryAzimuthDeg: 80, secondaryElevationDeg: 40 } });
    expect(state.light.secondaryAzimuthDeg).toBe(80);
    state = appReducer(state, { type: "set-light", patch: { secondaryOpposite: true } });
    expect(state.light.secondaryAzimuthDeg).toBe(210);
    expect(state.light.secondaryElevationDeg).toBe(40);
  });

  it("restores linked and independent settings and saved presets", () => {
    let state = appReducer(createInitialState(), { type: "apply-light-setup", setupId: "dual" });
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 350, secondaryElevationDeg: 25, secondaryIntensity: 1.2 } });
    state = appReducer(state, { type: "save-preset" });
    const linkedId = state.presets[0].id;
    state = appReducer(state, { type: "set-light", patch: { secondaryOpposite: false, secondaryAzimuthDeg: 215 } });
    state = appReducer(state, { type: "save-preset" });
    const independentId = state.presets[0].id;
    writePersistedState(state);
    state = createInitialState();
    expect(state.light.secondaryOpposite).toBe(false);
    expect(state.light.secondaryAzimuthDeg).toBe(215);
    state = appReducer(state, { type: "load-preset", presetId: linkedId });
    expect(state.light.secondaryOpposite).toBe(true);
    expect(state.light.secondaryAzimuthDeg).toBe(170);
    state = appReducer(state, { type: "set-light", patch: { azimuthDeg: 0 } });
    expect(state.light.secondaryAzimuthDeg).toBe(180);
    state = appReducer(state, { type: "load-preset", presetId: independentId });
    expect(state.light.secondaryOpposite).toBe(false);
    expect(state.light.secondaryAzimuthDeg).toBe(215);
    expect(state.light.secondaryElevationDeg).toBe(25);
    expect(state.light.secondaryIntensity).toBe(1.2);
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
    expect(staleOlderError.isLoading).toBe(false);
  });

  it("keeps the previous model when the latest replacement fails", () => {
    const model = createModelStub("current", "current.stl");
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });
    const loaded = appReducer(loading, { type: "load-success", requestId: 1, model });
    const loadingReplacement = appReducer(loaded, { type: "load-start", requestId: 2 });
    const failed = appReducer(loadingReplacement, { type: "load-error", requestId: 2, message: "replacement failed" });

    expect(failed.model).toBe(model);
    expect(failed.isLoading).toBe(false);
  });

  it("tracks loading lifecycle without storing transient notices", () => {
    const model = createModelStub("current", "current.stl");
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });
    const loaded = appReducer(loading, { type: "load-success", requestId: 1, model });
    const loadingAgain = appReducer(loaded, { type: "load-start", requestId: 2 });

    expect(loading.isLoading).toBe(true);
    expect(loaded.isLoading).toBe(false);
    expect(loaded.model).toBe(model);
    expect(loadingAgain.isLoading).toBe(true);
    expect(loadingAgain.model).toBe(model);
  });

  it("fails fast when load errors omit their message", () => {
    const loading = appReducer(createInitialState(), { type: "load-start", requestId: 1 });

    expect(() => appReducer(loading, { type: "load-error", requestId: 1, message: "" })).toThrow(
      "Invalid load error message: message is required",
    );
  });
});

describe("reducer fail-fast validation", () => {
  it("throws for invalid runtime state payloads", () => {
    const state = createInitialState();

    expect(() => appReducer(state, { type: "set-render-style", renderStyle: "bad" as never })).toThrow(
      "Unsupported value render style",
    );
    expect(() =>
      appReducer(state, { type: "set-value-step-count", valueStepCount: 9 as never }),
    ).toThrow("Unsupported value step count");
    expect(() => appReducer(state, { type: "set-key-color-preset", preset: "green" as never })).toThrow("Unsupported key color preset");
    expect(() => appReducer(state, { type: "set-fill-palette", palette: "red" as never })).toThrow("Unsupported fill palette");
    expect(() => appReducer(state, { type: "rename-preset", presetId: "missing", name: "A" })).toThrow("Unknown preset");
    expect(() => appReducer(state, { type: "delete-preset", presetId: "missing" })).toThrow("Unknown preset");
    expect(() => appReducer(state, { type: "apply-light-setup", setupId: "missing" })).toThrow(
      "Unsupported light setup",
    );
    expect(() => appReducer(state, { type: "set-active-tab", activeTab: "missing" as never })).toThrow("Unsupported active tab");
    expect(() => appReducer(state, { type: "set-light", patch: { intensity: Number.NaN } })).toThrow("Invalid light intensity");
    expect(() => appReducer(state, { type: "set-value-ramp", patch: { bandBias: Infinity } })).toThrow("Invalid value ramp band bias");
    expect(() => appReducer(state, { type: "set-floor", patch: { reflectance: Infinity } })).toThrow("Invalid ground reflectance");
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

  it("resets invalid current persisted schema values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 8,
        light: createInitialState().light,
        renderStyle: "not-a-style",
        valueStepCount: 5,
        valueRamp: DEFAULT_VALUE_RAMP,
        lightingMode: DEFAULT_LIGHTING_MODE,
        floor: { color: "#000", reflectance: 1 },
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
        renderStyle: DEFAULT_RENDER_STYLE,
        valueStepCount: DEFAULT_VALUE_STEP_COUNT,
        valueRamp: DEFAULT_VALUE_RAMP,
        lightingMode: DEFAULT_LIGHTING_MODE,
        floor: { color: "#000", reflectance: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards the previous preset schema when opposing fill is introduced", () => {
    const previous = toPersistedState(createInitialState());
    const previousLight = Object.fromEntries(Object.entries(previous.light).filter(([key]) => key !== "secondaryOpposite"));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...previous, version: 7, light: previousLight }));
    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(createInitialState().light.secondaryOpposite).toBe(false);
  });

  it("cleanly resets legacy state instead of adding compatibility shims", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        light: createInitialState().light,
        valueMode: "five-step",
        valueRamp: DEFAULT_VALUE_RAMP,
        zenithalStudy: false,
        floor: { color: "#000", reflectance: 1 },
        presets: [],
      }),
    );

    expect(readPersistedState()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("saves and restores the complete value and lighting study in presets", () => {
    let state = appReducer(createInitialState(), {
      type: "set-value-ramp",
      patch: { shadowLightness: 24, highlightLightness: 92, bandBias: 0.12, contrast: 2.6 },
    });
    state = appReducer(state, { type: "set-render-style", renderStyle: "stepped" });
    state = appReducer(state, { type: "set-value-step-count", valueStepCount: 8 });
    state = appReducer(state, { type: "apply-light-setup", setupId: "broad-zenithal" });
    const withPreset = appReducer(state, { type: "save-preset" });
    const changed = appReducer(withPreset, {
      type: "set-render-style",
      renderStyle: "smooth",
    });
    const restored = appReducer(changed, {
      type: "load-preset",
      presetId: withPreset.presets[0]?.id ?? "missing",
    });

    expect(restored.valueRamp).toEqual(state.valueRamp);
    expect(restored.renderStyle).toBe("stepped");
    expect(restored.valueStepCount).toBe(8);
    expect(restored.lightingMode).toBe("broad-zenithal");
  });

  it("applies artist lighting setups with their intended direction and fill", () => {
    const setup = LIGHT_SETUPS.find((candidate) => candidate.id === "zenithal");
    const state = appReducer(createInitialState(), {
      type: "apply-light-setup",
      setupId: "zenithal",
    });

    expect(setup).toBeDefined();
    expect(state.light.elevationDeg).toBe(90);
    expect(state.light.environmentIntensity).toBe(0.18);
    expect(state.lightingMode).toBe("zenithal");
  });
});

describe("light colors", () => {
  it("presents warm and cool choices in color and keeps grayscale when returning to white", () => {
    let state = appReducer(createInitialState(), { type: "set-key-color-preset", preset: "warm" });
    expect(state.light.keyColor).toBe("#ffe2b3");
    expect(state.valueRamp.grayscale).toBe(false);

    state = appReducer(state, { type: "set-value-ramp", patch: { grayscale: true } });
    state = appReducer(state, { type: "set-key-color-preset", preset: "white" });
    expect(state.light.keyColor).toBe("#ffffff");
    expect(state.valueRamp.grayscale).toBe(true);

    state = appReducer(state, { type: "set-fill-palette", palette: "cool" });
    expect(state.light.secondaryColor).toBe("#a8c7ef");
    expect(state.light.environmentColor).toBe("#b6c9e3");
    expect(state.floor.color).toBe("#78899f");
    expect(state.valueRamp.grayscale).toBe(false);
    expect(state.light.keyColor).toBe("#ffffff");
  });

  it("returns every color to neutral when a setup is chosen, keeping floor reflectance", () => {
    let state = appReducer(createInitialState(), { type: "set-key-color-preset", preset: "warm" });
    state = appReducer(state, { type: "set-fill-palette", palette: "cool" });
    state = appReducer(state, { type: "set-floor", patch: { reflectance: 0.8 } });
    state = appReducer(state, { type: "apply-light-setup", setupId: "zenithal" });

    expect(state.light.keyColor).toBe("#ffffff");
    expect(state.light.secondaryColor).toBe("#ffffff");
    expect(state.light.environmentColor).toBe("#ffffff");
    expect(state.floor).toEqual({ color: "#888888", reflectance: 0.8 });
  });
});

describe("value settings reset", () => {
  it("restores default value settings with thresholds for the current band count", () => {
    let state = appReducer(createInitialState(), { type: "set-value-step-count", valueStepCount: 4 });
    state = appReducer(state, { type: "set-value-ramp", patch: { contrast: 2.8, exposure: 1.6, grayscale: false, thresholds: [0.3, 0.5, 0.7] } });
    state = appReducer(state, { type: "reset-value-ramp" });

    expect(state.valueRamp).toEqual({ ...DEFAULT_VALUE_RAMP, thresholds: [0.25, 0.5, 0.75] });
    expect(state.valueStepCount).toBe(4);
  });
});

describe("preset management", () => {
  it("names presets uniquely, renames, deletes and restores them in place", () => {
    let state = createInitialState();
    for (let i = 0; i < 3; i++) state = appReducer(state, { type: "save-preset" });
    expect(state.presets.map((preset) => preset.name)).toEqual(["Preset 3", "Preset 2", "Preset 1"]);

    const middle = state.presets[1];
    state = appReducer(state, { type: "delete-preset", presetId: middle.id });
    state = appReducer(state, { type: "save-preset" });
    expect(state.presets.map((preset) => preset.name)).toEqual(["Preset 4", "Preset 3", "Preset 1"]);

    state = appReducer(state, { type: "rename-preset", presetId: state.presets[0].id, name: "  Rim test  " });
    expect(state.presets[0].name).toBe("Rim test");
    expect(() => appReducer(state, { type: "rename-preset", presetId: state.presets[0].id, name: "   " })).toThrow("Invalid preset name");

    const removed = state.presets[1];
    state = appReducer(state, { type: "delete-preset", presetId: removed.id });
    state = appReducer(state, { type: "restore-preset", preset: removed, index: 1 });
    expect(state.presets.map((preset) => preset.name)).toEqual(["Rim test", "Preset 3", "Preset 1"]);
  });

  it("refuses to save past the preset limit instead of dropping the oldest", () => {
    let state = createInitialState();
    for (let i = 0; i < MAX_PRESETS; i++) state = appReducer(state, { type: "save-preset" });

    expect(state.presets).toHaveLength(MAX_PRESETS);
    expect(() => appReducer(state, { type: "save-preset" })).toThrow(`Cannot save more than ${MAX_PRESETS} presets`);
  });

  it("saves presets while the light is locked", () => {
    const locked = appReducer(createInitialState(), { type: "toggle-lock" });

    expect(appReducer(locked, { type: "save-preset" }).presets).toHaveLength(1);
  });
});
