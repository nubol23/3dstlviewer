import type {
  ActiveTab,
  AppAction,
  AppState,
  FloorState,
  LightPreset,
  LightState,
  PersistedViewerState,
} from "./types";
import { assertValueMode } from "./lib/valueMode";

export const STORAGE_KEY = "stl-value-viewer:v1";

export const DEFAULT_LIGHT: LightState = {
  azimuthDeg: 315,
  elevationDeg: 48,
  distance: 2.8,
  intensity: 1.25,
  bounceStrength: 0.24,
  shadowSoftness: 0.45,
  locked: false,
};

const LEGACY_BACKLIT_DEFAULT_LIGHT: LightState = {
  ...DEFAULT_LIGHT,
  azimuthDeg: 128,
};

export const DEFAULT_FLOOR: FloorState = {
  color: "#c4c4c1",
  roughness: 0.85,
};

const DEFAULT_PRESETS: LightPreset[] = [
  {
    id: "front-left-high",
    name: "Front Left",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 315, elevationDeg: 52, distance: 3 },
    valueMode: "shaded",
  },
  {
    id: "rim-study",
    name: "Rim Study",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 155, elevationDeg: 34, distance: 3.4, bounceStrength: 0.18 },
    valueMode: "five-step",
  },
];

export function createInitialState(): AppState {
  const persisted = readPersistedState();

  return {
    light: persisted?.light ? migrateLegacyDefaultLight(persisted.light) : DEFAULT_LIGHT,
    valueMode: persisted?.valueMode ?? "shaded",
    floor: persisted?.floor ?? DEFAULT_FLOOR,
    activeTab: "light",
    model: null,
    error: null,
    isLoading: false,
    loadRequestId: 0,
    presets: persisted?.presets?.length ? migrateLegacyDefaultPresets(persisted.presets) : DEFAULT_PRESETS,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set-light":
      if (state.light.locked) {
        return state;
      }
      return { ...state, light: assertLightState({ ...state.light, ...action.patch }) };
    case "reset-light":
      if (state.light.locked) {
        return state;
      }
      return { ...state, light: { ...DEFAULT_LIGHT, locked: state.light.locked } };
    case "toggle-lock":
      return { ...state, light: { ...state.light, locked: !state.light.locked } };
    case "set-value-mode":
      assertValueMode(action.valueMode);
      return { ...state, valueMode: action.valueMode };
    case "set-floor":
      return { ...state, floor: assertFloorState({ ...state.floor, ...action.patch }) };
    case "set-active-tab":
      assertActiveTab(action.activeTab);
      return { ...state, activeTab: action.activeTab };
    case "load-start":
      assertLoadRequestId(action.requestId);
      return { ...state, loadRequestId: action.requestId, isLoading: true, error: null };
    case "load-success":
      assertLoadRequestId(action.requestId);
      if (action.requestId !== state.loadRequestId) {
        return state;
      }
      return { ...state, isLoading: false, model: action.model, error: null };
    case "replace-model":
      return { ...state, model: action.model, error: null };
    case "load-error":
      assertLoadRequestId(action.requestId);
      if (action.requestId !== state.loadRequestId) {
        return state;
      }
      return { ...state, isLoading: false, error: formatLoadError(action.message, state.model) };
    case "clear-error":
      return { ...state, error: null };
    case "save-preset": {
      const nextPreset: LightPreset = {
        id: `preset-${crypto.randomUUID()}`,
        name: `Preset ${state.presets.length + 1}`,
        light: { ...state.light, locked: false },
        valueMode: state.valueMode,
      };
      return { ...state, presets: [nextPreset, ...state.presets].slice(0, 8) };
    }
    case "load-preset": {
      const preset = state.presets.find((item) => item.id === action.presetId);
      if (!preset || state.light.locked) {
        return state;
      }
      return {
        ...state,
        light: assertLightState({ ...preset.light, locked: false }),
        valueMode: preset.valueMode,
      };
    }
    default:
      return state;
  }
}

type PersistableAppState = Pick<AppState, "light" | "valueMode" | "floor" | "presets">;

export function toPersistedState(state: PersistableAppState): PersistedViewerState {
  return {
    version: 1,
    light: state.light,
    valueMode: state.valueMode,
    floor: state.floor,
    presets: state.presets,
  };
}

export function writePersistedState(state: PersistableAppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
}

export function readPersistedState(): PersistedViewerState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return assertPersistedViewerState(parsed);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function migrateLegacyDefaultLight(light: LightState): LightState {
  if (!matchesLegacyBacklitDefault(light)) {
    return light;
  }

  return {
    ...DEFAULT_LIGHT,
    locked: light.locked,
  };
}

function migrateLegacyDefaultPresets(presets: LightPreset[]): LightPreset[] {
  return presets.map((preset) => {
    if (preset.id === "front-left-high") {
      return DEFAULT_PRESETS[0];
    }

    return preset;
  });
}

function matchesLegacyBacklitDefault(light: LightState): boolean {
  return (
    light.azimuthDeg === LEGACY_BACKLIT_DEFAULT_LIGHT.azimuthDeg &&
    light.elevationDeg === LEGACY_BACKLIT_DEFAULT_LIGHT.elevationDeg &&
    light.distance === LEGACY_BACKLIT_DEFAULT_LIGHT.distance &&
    light.intensity === LEGACY_BACKLIT_DEFAULT_LIGHT.intensity &&
    light.bounceStrength === LEGACY_BACKLIT_DEFAULT_LIGHT.bounceStrength &&
    light.shadowSoftness === LEGACY_BACKLIT_DEFAULT_LIGHT.shadowSoftness
  );
}

function formatLoadError(message: string, currentModel: AppState["model"]): string {
  if (!message || message.trim().length === 0) {
    throw new Error("Invalid load error message: message is required");
  }

  return currentModel ? `${message}. Previous model remains loaded.` : message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function assertNumberRange(value: unknown, label: string, min: number, max: number): number {
  const numberValue = assertFiniteNumber(value, label);
  if (numberValue < min || numberValue > max) {
    throw new Error(`Invalid ${label}: ${numberValue} is outside ${min}..${max}`);
  }
  return numberValue;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function assertColor(value: unknown): string {
  const color = assertString(value, "floor color");
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
    throw new Error(`Invalid floor color: ${color}`);
  }
  return color;
}

function assertLoadRequestId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid load request id: ${String(value)}`);
  }
  return value;
}

function assertActiveTab(value: unknown): asserts value is ActiveTab {
  if (value !== "light" && value !== "model" && value !== "view") {
    throw new Error(`Unsupported active tab: ${String(value)}`);
  }
}

function assertLightState(value: unknown): LightState {
  if (!isRecord(value)) {
    throw new Error("Invalid light state: expected object");
  }

  return {
    azimuthDeg: assertNumberRange(value.azimuthDeg, "light azimuth", 0, 360),
    elevationDeg: assertNumberRange(value.elevationDeg, "light elevation", -78, 78),
    distance: assertNumberRange(value.distance, "light distance", 1, 6),
    intensity: assertNumberRange(value.intensity, "light intensity", 0.1, 2.5),
    bounceStrength: assertNumberRange(value.bounceStrength, "light bounce strength", 0, 0.6),
    shadowSoftness: assertNumberRange(value.shadowSoftness, "light shadow softness", 0, 1),
    locked: assertBoolean(value.locked, "light locked"),
  };
}

function assertFloorState(value: unknown): FloorState {
  if (!isRecord(value)) {
    throw new Error("Invalid floor state: expected object");
  }

  return {
    color: assertColor(value.color),
    roughness: assertNumberRange(value.roughness, "floor roughness", 0.05, 1),
  };
}

function assertPreset(value: unknown): LightPreset {
  if (!isRecord(value)) {
    throw new Error("Invalid preset: expected object");
  }

  const valueMode = value.valueMode;
  assertValueMode(valueMode);

  return {
    id: assertString(value.id, "preset id"),
    name: assertString(value.name, "preset name"),
    light: assertLightState(value.light),
    valueMode,
  };
}

function assertPersistedViewerState(value: unknown): PersistedViewerState {
  if (!isRecord(value)) {
    throw new Error("Invalid persisted viewer state: expected object");
  }

  if (value.version !== 1) {
    throw new Error(`Unsupported persisted viewer state version: ${String(value.version)}`);
  }

  const valueMode = value.valueMode;
  assertValueMode(valueMode);

  if (!Array.isArray(value.presets)) {
    throw new Error("Invalid persisted viewer state: presets must be an array");
  }

  return {
    version: 1,
    light: assertLightState(value.light),
    valueMode,
    floor: assertFloorState(value.floor),
    presets: value.presets.map(assertPreset),
  };
}
