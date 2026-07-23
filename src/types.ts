import type { Box3, BufferGeometry, Vector3 } from "three";

export type ValueRenderStyle = "smooth" | "stepped";

export type ValueStepCount = 3 | 4 | 5 | 6 | 7 | 8;

export type LightingMode = "directional" | "classic-top";

export type ActiveTab = "light" | "model" | "view";

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
  bounceStrength: number;
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
  color: string;
  roughness: number;
};

export type ValueRampState = {
  shadowLightness: number;
  highlightLightness: number;
  bandBias: number;
};

export type LightPreset = {
  id: string;
  name: string;
  light: LightState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp: ValueRampState;
  lightingMode: LightingMode;
};

export type PersistedViewerState = {
  version: 4;
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
