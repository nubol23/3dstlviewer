import { z } from "zod";

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
import { assertValueRampState, DEFAULT_VALUE_RAMP } from "./lib/valueRamp";
import { createUuid } from "./lib/uuid";

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

export const DEFAULT_ZENITHAL_STUDY = false;

const DEFAULT_PRESETS: LightPreset[] = [
  {
    id: "front-left-high",
    name: "Front Left",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 315, elevationDeg: 52, distance: 3 },
    valueMode: "shaded",
    valueRamp: DEFAULT_VALUE_RAMP,
    zenithalStudy: DEFAULT_ZENITHAL_STUDY,
  },
  {
    id: "rim-study",
    name: "Rim Study",
    light: { ...DEFAULT_LIGHT, azimuthDeg: 155, elevationDeg: 34, distance: 3.4, bounceStrength: 0.18 },
    valueMode: "five-step",
    valueRamp: DEFAULT_VALUE_RAMP,
    zenithalStudy: DEFAULT_ZENITHAL_STUDY,
  },
];

export function createInitialState(): AppState {
  const persisted = readPersistedState();

  return {
    light: persisted?.light ? migrateLegacyDefaultLight(persisted.light) : DEFAULT_LIGHT,
    valueMode: persisted?.valueMode ?? "shaded",
    valueRamp: persisted?.valueRamp ?? DEFAULT_VALUE_RAMP,
    zenithalStudy: persisted?.zenithalStudy ?? DEFAULT_ZENITHAL_STUDY,
    floor: persisted?.floor ?? DEFAULT_FLOOR,
    activeTab: "light",
    model: null,
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
    case "set-value-ramp":
      return { ...state, valueRamp: assertValueRampState({ ...state.valueRamp, ...action.patch }) };
    case "set-zenithal-study":
      return { ...state, zenithalStudy: assertZenithalStudy(action.zenithalStudy) };
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
      return {
        ...state,
        isLoading: false,
        model: action.model,
      };
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
        valueMode: state.valueMode,
        valueRamp: state.valueRamp,
        zenithalStudy: state.zenithalStudy,
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
        valueRamp: preset.valueRamp,
        zenithalStudy: preset.zenithalStudy,
      };
    }
    default:
      return state;
  }
}

type PersistableAppState = Pick<AppState, "light" | "valueMode" | "valueRamp" | "zenithalStudy" | "floor" | "presets">;

export function toPersistedState(state: PersistableAppState): PersistedViewerState {
  return {
    version: 3,
    light: state.light,
    valueMode: state.valueMode,
    valueRamp: state.valueRamp,
    zenithalStudy: state.zenithalStudy,
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

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, fallbackMessage: string): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? fallbackMessage);
  }

  return result.data;
}

function finiteNumberSchema(label: string): z.ZodNumber {
  return z.number({
    error: (issue) => `Invalid ${label}: ${String(issue.input)}`,
  });
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

function booleanSchema(label: string): z.ZodBoolean {
  return z.boolean({
    error: (issue) => `Invalid ${label}: ${String(issue.input)}`,
  });
}

function stringSchema(label: string): z.ZodType<string> {
  return z
    .string({
      error: (issue) => `Invalid ${label}: ${String(issue.input)}`,
    })
    .superRefine((value, context) => {
      if (value.trim().length === 0) {
        context.addIssue({
          code: "custom",
          message: `Invalid ${label}: ${String(value)}`,
        });
      }
    });
}

const FLOOR_COLOR_SCHEMA: z.ZodType<string> = z
  .string({
    error: (issue) => `Invalid floor color: ${String(issue.input)}`,
  })
  .superRefine((color, context) => {
    if (color.trim().length === 0) {
      context.addIssue({
        code: "custom",
        message: `Invalid floor color: ${String(color)}`,
      });
      return;
    }

    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      context.addIssue({
        code: "custom",
        message: `Invalid floor color: ${color}`,
      });
    }
  });

const ZENITHAL_STUDY_SCHEMA = booleanSchema("zenithal study");

const LOAD_REQUEST_ID_SCHEMA: z.ZodType<number> = finiteNumberSchema("load request id").superRefine(
  (value, context) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
      context.addIssue({
        code: "custom",
        message: `Invalid load request id: ${String(value)}`,
      });
    }
  },
);

const ACTIVE_TAB_SCHEMA = z.enum(["light", "model", "view"], {
  error: (issue) => `Unsupported active tab: ${String(issue.input)}`,
});

const LIGHT_STATE_SCHEMA: z.ZodType<LightState> = z.object(
  {
    azimuthDeg: numberRangeSchema("light azimuth", 0, 360),
    elevationDeg: numberRangeSchema("light elevation", -78, 78),
    distance: numberRangeSchema("light distance", 1, 6),
    intensity: numberRangeSchema("light intensity", 0.1, 2.5),
    bounceStrength: numberRangeSchema("light bounce strength", 0, 0.6),
    shadowSoftness: numberRangeSchema("light shadow softness", 0, 1),
    locked: booleanSchema("light locked"),
  },
  { error: "Invalid light state: expected object" },
);

const FLOOR_STATE_SCHEMA: z.ZodType<FloorState> = z.object(
  {
    color: FLOOR_COLOR_SCHEMA,
    roughness: numberRangeSchema("floor roughness", 0.05, 1),
  },
  { error: "Invalid floor state: expected object" },
);

const PRESET_RECORD_SCHEMA = z.looseObject({}, { error: "Invalid preset: expected object" });

const PERSISTED_VIEWER_RECORD_SCHEMA = z.looseObject(
  {},
  { error: "Invalid persisted viewer state: expected object" },
);

const PERSISTED_VERSION_SCHEMA = z.literal([1, 2, 3], {
  error: (issue) => `Unsupported persisted viewer state version: ${String(issue.input)}`,
});

const PERSISTED_PRESETS_SCHEMA = z.array(z.unknown(), {
  error: "Invalid persisted viewer state: presets must be an array",
});

function assertZenithalStudy(value: unknown): boolean {
  return parseSchema(ZENITHAL_STUDY_SCHEMA, value, "Invalid zenithal study");
}

function assertLoadRequestId(value: unknown): number {
  return parseSchema(LOAD_REQUEST_ID_SCHEMA, value, "Invalid load request id");
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

function assertPreset(
  value: unknown,
  {
    requireValueRamp,
    requireZenithalStudy,
  }: { requireValueRamp: boolean; requireZenithalStudy: boolean },
): LightPreset {
  const preset = parseSchema(PRESET_RECORD_SCHEMA, value, "Invalid preset");
  const valueMode = preset.valueMode;
  assertValueMode(valueMode);

  let valueRamp = DEFAULT_VALUE_RAMP;
  if ("valueRamp" in preset) {
    valueRamp = assertValueRampState(preset.valueRamp);
  } else if (requireValueRamp) {
    throw new Error("Invalid preset value ramp: expected object");
  }

  let zenithalStudy = DEFAULT_ZENITHAL_STUDY;
  if ("zenithalStudy" in preset) {
    zenithalStudy = assertZenithalStudy(preset.zenithalStudy);
  } else if (requireZenithalStudy) {
    throw new Error("Invalid preset zenithal study: expected boolean");
  }

  return {
    id: parseSchema(stringSchema("preset id"), preset.id, "Invalid preset id"),
    name: parseSchema(stringSchema("preset name"), preset.name, "Invalid preset name"),
    light: assertLightState(preset.light),
    valueMode,
    valueRamp,
    zenithalStudy,
  };
}

function assertPersistedViewerState(value: unknown): PersistedViewerState {
  const persisted = parseSchema(
    PERSISTED_VIEWER_RECORD_SCHEMA,
    value,
    "Invalid persisted viewer state",
  );
  const version = parseSchema(
    PERSISTED_VERSION_SCHEMA,
    persisted.version,
    "Unsupported persisted viewer state version",
  );
  const valueMode = persisted.valueMode;
  assertValueMode(valueMode);
  const presets = parseSchema(
    PERSISTED_PRESETS_SCHEMA,
    persisted.presets,
    "Invalid persisted viewer state presets",
  );

  const hasPersistedValueRamp = version === 2 || version === 3;
  const isCurrentVersion = version === 3;
  const valueRamp = hasPersistedValueRamp
    ? assertValueRampState(persisted.valueRamp)
    : DEFAULT_VALUE_RAMP;
  const zenithalStudy = isCurrentVersion
    ? assertZenithalStudy(persisted.zenithalStudy)
    : DEFAULT_ZENITHAL_STUDY;

  return {
    version: 3,
    light: assertLightState(persisted.light),
    valueMode,
    valueRamp,
    zenithalStudy,
    floor: assertFloorState(persisted.floor),
    presets: presets.map((preset) =>
      assertPreset(preset, {
        requireValueRamp: hasPersistedValueRamp,
        requireZenithalStudy: isCurrentVersion,
      }),
    ),
  };
}
