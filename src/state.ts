import type {
  AppAction,
  AppState,
  FloorState,
  LightPreset,
  LightState,
  PersistedViewerState,
  ValueMode,
} from "./types";

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
    presets: persisted?.presets?.length ? migrateLegacyDefaultPresets(persisted.presets) : DEFAULT_PRESETS,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set-light":
      if (state.light.locked) {
        return state;
      }
      return { ...state, light: { ...state.light, ...action.patch } };
    case "reset-light":
      if (state.light.locked) {
        return state;
      }
      return { ...state, light: { ...DEFAULT_LIGHT, locked: state.light.locked } };
    case "toggle-lock":
      return { ...state, light: { ...state.light, locked: !state.light.locked } };
    case "set-value-mode":
      return { ...state, valueMode: action.valueMode };
    case "set-floor":
      return { ...state, floor: { ...state.floor, ...action.patch } };
    case "set-active-tab":
      return { ...state, activeTab: action.activeTab };
    case "load-start":
      return { ...state, isLoading: true, error: null };
    case "load-success":
      return { ...state, isLoading: false, model: action.model, error: null };
    case "replace-model":
      return { ...state, model: action.model, error: null };
    case "load-error":
      return { ...state, isLoading: false, error: action.message };
    case "clear-error":
      return { ...state, error: null };
    case "save-preset": {
      const nextPreset: LightPreset = {
        id: `preset-${Date.now()}`,
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
        light: { ...preset.light, locked: false },
        valueMode: preset.valueMode,
      };
    }
    default:
      return state;
  }
}

export function toPersistedState(state: AppState): PersistedViewerState {
  return {
    version: 1,
    light: state.light,
    valueMode: state.valueMode,
    floor: state.floor,
    presets: state.presets,
  };
}

export function writePersistedState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
}

export function readPersistedState(): PersistedViewerState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as PersistedViewerState;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported persisted viewer state version: ${String(parsed.version)}`);
  }
  assertValueMode(parsed.valueMode);
  return parsed;
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

function assertValueMode(valueMode: ValueMode): void {
  if (valueMode !== "shaded" && valueMode !== "three-step" && valueMode !== "five-step") {
    throw new Error(`Unsupported value mode: ${String(valueMode)}`);
  }
}
