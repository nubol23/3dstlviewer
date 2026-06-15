import type { Box3, BufferGeometry, Vector3 } from "three";

export type ValueMode = "shaded" | "three-step" | "five-step";

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
  operations: [],
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
  valueMode: ValueMode;
  valueRamp: ValueRampState;
  zenithalStudy: boolean;
};

export type PersistedViewerState = {
  version: 3;
  light: LightState;
  valueMode: ValueMode;
  valueRamp: ValueRampState;
  zenithalStudy: boolean;
  floor: FloorState;
  presets: LightPreset[];
};

export type AppState = {
  light: LightState;
  valueMode: ValueMode;
  valueRamp: ValueRampState;
  zenithalStudy: boolean;
  floor: FloorState;
  activeTab: ActiveTab;
  model: LoadedModel | null;
  error: string | null;
  loadNotice: string | null;
  isLoading: boolean;
  loadRequestId: number;
  presets: LightPreset[];
};

export type AppAction =
  | { type: "set-light"; patch: Partial<LightState> }
  | { type: "reset-light" }
  | { type: "toggle-lock" }
  | { type: "set-value-mode"; valueMode: ValueMode }
  | { type: "set-value-ramp"; patch: Partial<ValueRampState> }
  | { type: "set-zenithal-study"; zenithalStudy: boolean }
  | { type: "set-floor"; patch: Partial<FloorState> }
  | { type: "set-active-tab"; activeTab: ActiveTab }
  | { type: "load-start"; requestId: number }
  | { type: "load-success"; requestId: number; model: LoadedModel }
  | { type: "replace-model"; model: LoadedModel }
  | { type: "load-error"; requestId: number; message: string }
  | { type: "clear-error" }
  | { type: "clear-load-notice" }
  | { type: "save-preset" }
  | { type: "load-preset"; presetId: string };
