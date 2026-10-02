import type { Box3, BufferGeometry, Vector3 } from "three";

export type ValueRenderStyle = "smooth" | "stepped";

export type ValueStepCount = 3 | 4 | 5 | 6 | 7 | 8;

export type LightingMode = "directional" | "zenithal" | "broad-zenithal" | "local" | "dual" | "reflected";

export type ActiveTab = "light" | "values" | "scene" | "presets";

export type OrientationTurn = 0 | 1 | 2 | 3;

export type OrientationAxis = "x" | "y" | "z";

export type OrientationTurnOperation = {
  axis: OrientationAxis;
  quarterTurns: Exclude<OrientationTurn, 0>;
};

export type ModelOrientation = {
  operations: OrientationTurnOperation[];
};

export const DEFAULT_MODEL_ORIENTATION: ModelOrientation = {
  operations: [{ axis: "x", quarterTurns: 3 }],
};

export type LightState = {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  intensity: number;
  environmentIntensity: number;
  spread: number;
  secondaryIntensity: number;
  secondaryOpposite: boolean;
  secondaryAzimuthDeg: number;
  secondaryElevationDeg: number;
  sourceSize: number;
  reflector: boolean;
  keyColor: string;
  secondaryColor: string;
  environmentColor: string;
  shadowSoftness: number;
  locked: boolean;
};

export type ModelMetadata = {
  fileName: string;
  fileSize: number;
  triangleCount: number;
  loadedAt: number;
};

export type ModelFitState = {
  originalBounds: Box3;
  fittedBounds: Box3;
  center: Vector3;
  size: Vector3;
  radius: number;
  scale: number;
};

export type LoadedModel = {
  id: string;
  sourceGeometry: BufferGeometry;
  geometry: BufferGeometry;
  orientation: ModelOrientation;
  metadata: ModelMetadata;
  fit: ModelFitState;
};

export type FloorState = {
  reflectance: number;
  color: string;
};

export type ValueRampState = {
  shadowLightness: number;
  highlightLightness: number;
  bandBias: number;
  exposure: number;
  contrast: number;
  smoothingRadius: number;
  thresholds: number[];
  grayscale: boolean;
};

export type LightPreset = {
  floor: FloorState;
  id: string;
  name: string;
  light: LightState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp: ValueRampState;
  lightingMode: LightingMode;
};

export type PersistedViewerState = {
  version: 8;
  light: LightState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp: ValueRampState;
  lightingMode: LightingMode;
  floor: FloorState;
  presets: LightPreset[];
};

export type AppState = {
  light: LightState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp: ValueRampState;
  lightingMode: LightingMode;
  floor: FloorState;
  activeTab: ActiveTab;
  model: LoadedModel | null;
  isLoading: boolean;
  loadRequestId: number;
  presets: LightPreset[];
};

export type AppAction =
  | { type: "set-light"; patch: Partial<LightState> }
  | { type: "reset-light" }
  | { type: "toggle-lock" }
  | { type: "set-render-style"; renderStyle: ValueRenderStyle }
  | { type: "set-value-step-count"; valueStepCount: ValueStepCount }
  | { type: "set-value-ramp"; patch: Partial<ValueRampState> }
  | { type: "set-lighting-mode"; lightingMode: LightingMode }
  | { type: "apply-light-setup"; setupId: string }
  | { type: "set-floor"; patch: Partial<FloorState> }
  | { type: "set-active-tab"; activeTab: ActiveTab }
  | { type: "load-start"; requestId: number }
  | { type: "load-success"; requestId: number; model: LoadedModel }
  | { type: "replace-model"; model: LoadedModel }
  | { type: "load-error"; requestId: number; message: string }
  | { type: "save-preset" }
  | { type: "load-preset"; presetId: string };
