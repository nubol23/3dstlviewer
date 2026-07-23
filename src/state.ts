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
  azimuthDeg: 315,
  elevationDeg: 50,
  distance: 2.8,
  intensity: 1.25,
  bounceStrength: 0.16,
  shadowSoftness: 0.35,
  locked: false,
};

export const DEFAULT_RENDER_STYLE: ValueRenderStyle = "smooth";
export const DEFAULT_VALUE_STEP_COUNT: ValueStepCount = 5;
export const DEFAULT_LIGHTING_MODE: LightingMode = "directional";

export const DEFAULT_FLOOR: FloorState = {
  color: "#c4c4c1",
  roughness: 0.85,
};

export type LightSetup = {
  id: string;
  name: string;
  description: string;
  light: Omit<LightState, "locked">;
  lightingMode: LightingMode;
};

export const LIGHT_SETUPS: readonly LightSetup[] = [
  {
    id: "bust-left",
    name: "Bust Left",
    description: "Upper-front-left portrait key with restrained fill.",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 315, elevationDeg: 50, bounceStrength: 0.16 },
    lightingMode: "directional",
  },
  {
    id: "bust-right",
    name: "Bust Right",
    description: "Mirrored upper-front-right portrait key.",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 45, elevationDeg: 50, bounceStrength: 0.16 },
    lightingMode: "directional",
  },
  {
    id: "true-zenith",
    name: "True Zenith",
    description: "Single light directly above the model.",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 0, elevationDeg: 90, bounceStrength: 0.12 },
    lightingMode: "directional",
  },
  {
    id: "classic-top",
    name: "Classic Top Prime",
    description: "Broad top-weighted illumination that preserves occluded recesses.",
    light: {
      ...DEFAULT_LIGHT,
      azimuthDeg: 0,
      elevationDeg: 90,
      intensity: 1.15,
      bounceStrength: 0.1,
      shadowSoftness: 0.5,
    },
    lightingMode: "classic-top",
  },
  {
    id: "dramatic-side",
    name: "Dramatic Side",
    description: "Low-fill three-quarter side light for strong form separation.",
    light: {
      ...DEFAULT_LIGHT,
      azimuthDeg: 315,
      elevationDeg: 35,
      intensity: 1.35,
      bounceStrength: 0.08,
      shadowSoftness: 0.22,
    },
    lightingMode: "directional",
  },
] as const;

const DEFAULT_PRESETS: LightPreset[] = [
  {
    id: "front-left-high",
    name: "Bust Left",
    light: { ...DEFAULT_LIGHT },
    renderStyle: "smooth",
    valueStepCount: 5,
    valueRamp: DEFAULT_VALUE_RAMP,
    lightingMode: "directional",
  },
  {
    id: "rim-study",
    name: "Rim Study",
    light: {
      ...DEFAULT_LIGHT,
      azimuthDeg: 155,
      elevationDeg: 34,
      distance: 3.4,
      bounceStrength: 0.12,
    },
    renderStyle: "stepped",
    valueStepCount: 5,
    valueRamp: DEFAULT_VALUE_RAMP,
    lightingMode: "directional",
  },
];

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
      return { ...state, valueStepCount: action.valueStepCount };
    case "set-value-ramp":
      return { ...state, valueRamp: assertValueRampState({ ...state.valueRamp, ...action.patch }) };
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
    version: 4,
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

const LIGHTING_MODE_SCHEMA = z.enum(["directional", "classic-top"], {
  error: (issue) => `Unsupported lighting mode: ${String(issue.input)}`,
});

const ACTIVE_TAB_SCHEMA = z.enum(["light", "model", "view"], {
  error: (issue) => `Unsupported active tab: ${String(issue.input)}`,
});

const LIGHT_STATE_SCHEMA: z.ZodType<LightState> = z.object({
  azimuthDeg: numberRangeSchema("light azimuth", 0, 360),
  elevationDeg: numberRangeSchema("light elevation", -78, 90),
  distance: numberRangeSchema("light distance", 1, 6),
  intensity: numberRangeSchema("light intensity", 0.1, 2.5),
  bounceStrength: numberRangeSchema("light bounce strength", 0, 0.6),
  shadowSoftness: numberRangeSchema("light shadow softness", 0, 1),
  locked: z.boolean({ error: (issue) => `Invalid light locked: ${String(issue.input)}` }),
});

const FLOOR_STATE_SCHEMA: z.ZodType<FloorState> = z.object({
  color: FLOOR_COLOR_SCHEMA,
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

  return {
    id: parseSchema(stringSchema("preset id"), preset.id, "Invalid preset id"),
    name: parseSchema(stringSchema("preset name"), preset.name, "Invalid preset name"),
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
  parseSchema(z.literal(4), persisted.version, "Unsupported persisted viewer state version");
  assertValueRenderStyle(persisted.renderStyle);
  assertValueStepCount(persisted.valueStepCount);
  const presets = parseSchema(
    z.array(z.unknown(), {
      error: "Invalid persisted viewer state: presets must be an array",
    }),
    persisted.presets,
    "Invalid persisted viewer state presets",
  );

  return {
    version: 4,
    light: assertLightState(persisted.light),
    renderStyle: persisted.renderStyle,
    valueStepCount: persisted.valueStepCount,
    valueRamp: assertValueRampState(persisted.valueRamp),
    lightingMode: assertLightingMode(persisted.lightingMode),
    floor: assertFloorState(persisted.floor),
    presets: presets.map(assertPreset),
  };
}
