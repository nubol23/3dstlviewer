import { z } from "zod";

import type {
  ActiveTab,
  AppAction,
  AppState,
  FloorState,
  LightPreset,
  LightingMode,
  LightState,
  PersistedViewerState,
  ValueRenderStyle,
  ValueStepCount,
} from "./types";
import { assertValueRenderStyle, assertValueStepCount } from "./lib/valueMode";
import { assertValueRampState, DEFAULT_VALUE_RAMP } from "./lib/valueRamp";
import { createUuid } from "./lib/uuid";

export const STORAGE_KEY = "stl-value-viewer:v1";

export const DEFAULT_LIGHT: LightState = {
  azimuthDeg: 315, elevationDeg: 50, distance: 2.8, intensity: 3,
  environmentIntensity: 0.25, spread: 0.5, shadowSoftness: 0.35,
  secondaryIntensity: 0.45, secondaryAzimuthDeg: 135, secondaryElevationDeg: 35,
  sourceSize: 0.15, reflector: false, locked: false,
};
export const DEFAULT_RENDER_STYLE: ValueRenderStyle = "smooth";
export const DEFAULT_VALUE_STEP_COUNT: ValueStepCount = 5;
export const DEFAULT_LIGHTING_MODE: LightingMode = "directional";
export const DEFAULT_FLOOR: FloorState = { color: "#888888", roughness: 1, reflectance: 0.5 };
export type LightSetup = {
  id: string; name: string; description: string;
  light: LightState; lightingMode: LightingMode;
};
export const LIGHT_SETUPS: readonly LightSetup[] = [
  { id: "zenithal", name: "Strict Zenithal", description: "Concentrated overhead light.", lightingMode: "zenithal", light: { ...DEFAULT_LIGHT, azimuthDeg: 0, elevationDeg: 90, environmentIntensity: 0.12 } },
  { id: "broad-zenithal", name: "Broad Zenithal", description: "Overhead light blended with an all-around gradient environment.", lightingMode: "broad-zenithal", light: { ...DEFAULT_LIGHT, azimuthDeg: 0, elevationDeg: 90, spread: 0.65 } },
  { id: "directional", name: "Directional", description: "Upper-front-left key.", lightingMode: "directional", light: { ...DEFAULT_LIGHT } },
  { id: "local", name: "Local Studio", description: "Nearby lamp with distance falloff.", lightingMode: "local", light: { ...DEFAULT_LIGHT, distance: 2, intensity: 3 } },
  { id: "dual", name: "Double Directional", description: "Two independently shadowed lights.", lightingMode: "dual", light: { ...DEFAULT_LIGHT } },
  { id: "reflected", name: "Reflected Fill", description: "Key plus environment and floor; refinement resolves actual bounce.", lightingMode: "reflected", light: { ...DEFAULT_LIGHT, environmentIntensity: 0.55 } },
];
const DEFAULT_PRESETS: LightPreset[] = [];

export function createInitialState(): AppState {
  const persisted = readPersistedState();

  return {
    light: persisted?.light ?? DEFAULT_LIGHT,
    renderStyle: persisted?.renderStyle ?? DEFAULT_RENDER_STYLE,
    valueStepCount: persisted?.valueStepCount ?? DEFAULT_VALUE_STEP_COUNT,
    valueRamp: persisted?.valueRamp ?? DEFAULT_VALUE_RAMP,
    lightingMode: persisted?.lightingMode ?? DEFAULT_LIGHTING_MODE,
    floor: persisted?.floor ?? DEFAULT_FLOOR,
    activeTab: "light",
    model: null,
    isLoading: false,
    loadRequestId: 0,
    presets: persisted?.presets?.length ? persisted.presets : DEFAULT_PRESETS,
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
      return {
        ...state,
        light: { ...DEFAULT_LIGHT, locked: state.light.locked },
        lightingMode: DEFAULT_LIGHTING_MODE,
      };
    case "toggle-lock":
      return { ...state, light: { ...state.light, locked: !state.light.locked } };
    case "set-render-style":
      assertValueRenderStyle(action.renderStyle);
      return { ...state, renderStyle: action.renderStyle };
    case "set-value-step-count":
      assertValueStepCount(action.valueStepCount);
      return { ...state, valueStepCount: action.valueStepCount, valueRamp: { ...state.valueRamp, thresholds: Array.from({ length: action.valueStepCount - 1 }, (_, i) => (i + 1) / action.valueStepCount) } };
    case "set-value-ramp": {
      const valueRamp = assertValueRampState({ ...state.valueRamp, ...action.patch });
      if (valueRamp.thresholds.length !== state.valueStepCount - 1) throw new Error("Band threshold count must match the value count");
      return { ...state, valueRamp };
    }
    case "set-lighting-mode":
      if (state.light.locked) {
        return state;
      }
      return { ...state, lightingMode: assertLightingMode(action.lightingMode) };
    case "apply-light-setup": {
      if (state.light.locked) {
        return state;
      }
      const setup = LIGHT_SETUPS.find((candidate) => candidate.id === action.setupId);
      if (!setup) {
        throw new Error(`Unsupported light setup: ${String(action.setupId)}`);
      }
      return {
        ...state,
        light: assertLightState({ ...setup.light, locked: false }),
        lightingMode: setup.lightingMode,
      };
    }
    case "set-floor":
      return { ...state, floor: assertFloorState({ ...state.floor, ...action.patch }) };
    case "set-active-tab":
      assertActiveTab(action.activeTab);
      return { ...state, activeTab: action.activeTab };
    case "load-start":
      assertLoadRequestId(action.requestId);
      return { ...state, loadRequestId: action.requestId, isLoading: true };
    case "load-success":
      assertLoadRequestId(action.requestId);
      if (action.requestId !== state.loadRequestId) {
        return state;
      }
      return { ...state, isLoading: false, model: action.model };
    case "replace-model":
      return { ...state, model: action.model };
    case "load-error":
      assertLoadRequestId(action.requestId);
      if (action.requestId !== state.loadRequestId) {
        return state;
      }
      if (!action.message || action.message.trim().length === 0) {
        throw new Error("Invalid load error message: message is required");
      }
      return { ...state, isLoading: false };
    case "save-preset": {
      const nextPreset: LightPreset = {
        id: `preset-${createUuid()}`,
        name: `Preset ${state.presets.length + 1}`,
        floor: { ...state.floor },
        light: { ...state.light, locked: false },
        renderStyle: state.renderStyle,
        valueStepCount: state.valueStepCount,
        valueRamp: state.valueRamp,
        lightingMode: state.lightingMode,
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
        floor: assertFloorState(preset.floor),
        light: assertLightState({ ...preset.light, locked: false }),
        renderStyle: preset.renderStyle,
        valueStepCount: preset.valueStepCount,
        valueRamp: preset.valueRamp,
        lightingMode: preset.lightingMode,
      };
    }
    default:
      return state;
  }
}

type PersistableAppState = Pick<
  AppState,
  "light" | "renderStyle" | "valueStepCount" | "valueRamp" | "lightingMode" | "floor" | "presets"
>;

export function toPersistedState(state: PersistableAppState): PersistedViewerState {
  return {
    version: 5,
    light: state.light,
    renderStyle: state.renderStyle,
    valueStepCount: state.valueStepCount,
    valueRamp: state.valueRamp,
    lightingMode: state.lightingMode,
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
    return assertPersistedViewerState(JSON.parse(raw) as unknown);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, fallbackMessage: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? fallbackMessage);
  }
  return result.data;
}

function finiteNumberSchema(label: string): z.ZodNumber {
  return z.number({ error: (issue) => `Invalid ${label}: ${String(issue.input)}` });
}

function numberRangeSchema(label: string, min: number, max: number) {
  return finiteNumberSchema(label).superRefine((value, context) => {
    if (value < min || value > max) {
      context.addIssue({
        code: "custom",
        message: `Invalid ${label}: ${value} is outside ${min}..${max}`,
      });
    }
  });
}

function stringSchema(label: string): z.ZodType<string> {
  return z
    .string({ error: (issue) => `Invalid ${label}: ${String(issue.input)}` })
    .superRefine((value, context) => {
      if (value.trim().length === 0) {
        context.addIssue({ code: "custom", message: `Invalid ${label}: ${String(value)}` });
      }
    });
}

const FLOOR_COLOR_SCHEMA = z
  .string({ error: (issue) => `Invalid floor color: ${String(issue.input)}` })
  .superRefine((color, context) => {
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      context.addIssue({ code: "custom", message: `Invalid floor color: ${color}` });
    }
  });

const LIGHTING_MODE_SCHEMA = z.enum(["directional", "zenithal", "broad-zenithal", "local", "dual", "reflected"], {
  error: (issue) => `Unsupported lighting mode: ${String(issue.input)}`,
});

const ACTIVE_TAB_SCHEMA = z.enum(["light", "model", "view"], {
  error: (issue) => `Unsupported active tab: ${String(issue.input)}`,
});

const LIGHT_STATE_SCHEMA: z.ZodType<LightState> = z.object({
  azimuthDeg: numberRangeSchema("light azimuth", 0, 360),
  elevationDeg: numberRangeSchema("light elevation", -78, 90),
  distance: numberRangeSchema("light distance", 1, 6),
  intensity: numberRangeSchema("light intensity", 0, 10),
  environmentIntensity: numberRangeSchema("environment intensity", 0, 3),
  spread: numberRangeSchema("zenithal spread", 0, 1),
  secondaryIntensity: numberRangeSchema("secondary ratio", 0, 2),
  secondaryAzimuthDeg: numberRangeSchema("secondary azimuth", 0, 360),
  secondaryElevationDeg: numberRangeSchema("secondary elevation", -78, 90),
  sourceSize: numberRangeSchema("source size", 0, 1),
  reflector: z.boolean(),
  shadowSoftness: numberRangeSchema("light shadow softness", 0, 1),
  locked: z.boolean({ error: (issue) => `Invalid light locked: ${String(issue.input)}` }),
});

const FLOOR_STATE_SCHEMA: z.ZodType<FloorState> = z.object({
  color: FLOOR_COLOR_SCHEMA,
  reflectance: numberRangeSchema("ground reflectance", 0, 1),
  roughness: numberRangeSchema("floor roughness", 0.05, 1),
});

const PRESET_RECORD_SCHEMA = z.looseObject({}, { error: "Invalid preset: expected object" });
const PERSISTED_VIEWER_RECORD_SCHEMA = z.looseObject(
  {},
  { error: "Invalid persisted viewer state: expected object" },
);

function assertLightingMode(value: unknown): LightingMode {
  return parseSchema(LIGHTING_MODE_SCHEMA, value, "Invalid lighting mode");
}

function assertLoadRequestId(value: unknown): number {
  const schema = finiteNumberSchema("load request id").superRefine((requestId, context) => {
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      context.addIssue({
        code: "custom",
        message: `Invalid load request id: ${String(requestId)}`,
      });
    }
  });
  return parseSchema(schema, value, "Invalid load request id");
}

function assertActiveTab(value: unknown): asserts value is ActiveTab {
  parseSchema(ACTIVE_TAB_SCHEMA, value, "Invalid active tab");
}

function assertLightState(value: unknown): LightState {
  return parseSchema(LIGHT_STATE_SCHEMA, value, "Invalid light state");
}

function assertFloorState(value: unknown): FloorState {
  return parseSchema(FLOOR_STATE_SCHEMA, value, "Invalid floor state");
}

function assertPreset(value: unknown): LightPreset {
  const preset = parseSchema(PRESET_RECORD_SCHEMA, value, "Invalid preset");
  assertValueRenderStyle(preset.renderStyle);
  assertValueStepCount(preset.valueStepCount);

  if (assertValueRampState(preset.valueRamp).thresholds.length !== preset.valueStepCount - 1) throw new Error("Invalid preset threshold count");
  return {
    id: parseSchema(stringSchema("preset id"), preset.id, "Invalid preset id"),
    name: parseSchema(stringSchema("preset name"), preset.name, "Invalid preset name"),
    floor: assertFloorState(preset.floor),
    light: assertLightState(preset.light),
    renderStyle: preset.renderStyle,
    valueStepCount: preset.valueStepCount,
    valueRamp: assertValueRampState(preset.valueRamp),
    lightingMode: assertLightingMode(preset.lightingMode),
  };
}

function assertPersistedViewerState(value: unknown): PersistedViewerState {
  const persisted = parseSchema(
    PERSISTED_VIEWER_RECORD_SCHEMA,
    value,
    "Invalid persisted viewer state",
  );
  parseSchema(z.literal(5), persisted.version, "Unsupported persisted viewer state version");
  assertValueRenderStyle(persisted.renderStyle);
  assertValueStepCount(persisted.valueStepCount);
  const presets = parseSchema(
    z.array(z.unknown(), {
      error: "Invalid persisted viewer state: presets must be an array",
    }),
    persisted.presets,
    "Invalid persisted viewer state presets",
  );

  if (assertValueRampState(persisted.valueRamp).thresholds.length !== persisted.valueStepCount - 1) throw new Error("Invalid persisted threshold count");
  return {
    version: 5,
    light: assertLightState(persisted.light),
    renderStyle: persisted.renderStyle,
    valueStepCount: persisted.valueStepCount,
    valueRamp: assertValueRampState(persisted.valueRamp),
    lightingMode: assertLightingMode(persisted.lightingMode),
    floor: assertFloorState(persisted.floor),
    presets: presets.map(assertPreset),
  };
}
