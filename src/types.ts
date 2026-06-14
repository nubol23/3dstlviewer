import type { Box3, BufferGeometry, Vector3 } from "three";

export type ValueMode = "shaded" | "three-step" | "five-step";

export type ActiveTab = "light" | "model" | "view";

export type OrientationTurn = 0 | 1 | 2 | 3;

export type ModelOrientation = {
  x: OrientationTurn;
  y: OrientationTurn;
  z: OrientationTurn;
};

export type OrientationAxis = keyof ModelOrientation;

export const DEFAULT_MODEL_ORIENTATION: ModelOrientation = {
  x: 0,
  y: 0,
  z: 0,
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
  id: number;
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

export type LightPreset = {
  id: string;
  name: string;
  light: LightState;
  valueMode: ValueMode;
};

export type PersistedViewerState = {
  version: 1;
  light: LightState;
  valueMode: ValueMode;
  floor: FloorState;
  presets: LightPreset[];
};

export type AppState = {
  light: LightState;
  valueMode: ValueMode;
  floor: FloorState;
  activeTab: ActiveTab;
  model: LoadedModel | null;
  error: string | null;
  isLoading: boolean;
  presets: LightPreset[];
};

export type AppAction =
  | { type: "set-light"; patch: Partial<LightState> }
  | { type: "reset-light" }
  | { type: "toggle-lock" }
  | { type: "set-value-mode"; valueMode: ValueMode }
  | { type: "set-floor"; patch: Partial<FloorState> }
  | { type: "set-active-tab"; activeTab: ActiveTab }
  | { type: "load-start" }
  | { type: "load-success"; model: LoadedModel }
  | { type: "replace-model"; model: LoadedModel }
  | { type: "load-error"; message: string }
  | { type: "clear-error" }
  | { type: "save-preset" }
  | { type: "load-preset"; presetId: string };
