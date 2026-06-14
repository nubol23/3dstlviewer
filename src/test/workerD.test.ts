import { beforeEach, describe, expect, it } from "vitest";
import {
  appReducer,
  readPersistedState,
  toPersistedState,
  writePersistedState,
  createInitialState,
  STORAGE_KEY,
  DEFAULT_LIGHT,
} from "../state";
import {
  computeFitState,
  quantizeValue,
  sphericalToCartesian,
} from "./workerDHelpers";
import { createCubeGeometry } from "./fixtures";
import { Vector3 } from "three";

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

  it("throws on invalid persisted schema values", () => {
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

    expect(() => readPersistedState()).toThrowError("Unsupported value mode");
  });

  it("throws on unsupported version", () => {
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

    expect(() => readPersistedState()).toThrowError("Unsupported persisted viewer state version");
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
  });
});
