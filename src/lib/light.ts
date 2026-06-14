import { MathUtils, Vector3 } from "three";

import type { LightState, ModelFitState } from "../types";

export const SHADOW_MAP_SIZE_MIN = 256;
export const SHADOW_MAP_SIZE_MAX = 2048;

const LIGHT_DISTANCE_MIN = 0.25;
const FIT_RADIUS_MIN = 0.35;
const SHADOW_BIAS = -0.0004;
const SHADOW_SOFTNESS_MIN = 0;
const SHADOW_SOFTNESS_MAX = 1;

export type LightPose = {
  position: Vector3;
  direction: Vector3;
};

export type LightShadowCameraConfig = {
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function failFastNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function clamp01(value: number): number {
  failFastNumber(value, "normalized ratio");
  return Math.min(1, Math.max(0, value));
}

function clampDistance(distance: number): number {
  failFastNumber(distance, "light distance");
  return Math.max(Math.abs(distance), LIGHT_DISTANCE_MIN);
}

export function sphericalToPosition(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  out: Vector3 = new Vector3(),
): Vector3 {
  failFastNumber(azimuthDeg, "azimuth");
  failFastNumber(elevationDeg, "elevation");
  const azimuth = MathUtils.degToRad(azimuthDeg);
  const elevation = MathUtils.degToRad(elevationDeg);
  const radius = clampDistance(distance);

  const x = Math.cos(elevation) * Math.sin(azimuth) * radius;
  const y = Math.sin(elevation) * radius;
  const z = Math.cos(elevation) * Math.cos(azimuth) * radius;

  return out.set(x, y, z);
}

export function lightPoseFromState(
  light: LightState,
  target: Vector3 = new Vector3(),
): LightPose {
  failFastNumber(light.azimuthDeg, "light azimuth");
  failFastNumber(light.elevationDeg, "light elevation");
  failFastNumber(light.distance, "light distance");
  const position = sphericalToPosition(
    light.azimuthDeg,
    light.elevationDeg,
    light.distance,
  );
  failFastNumber(target.x, "target x");
  failFastNumber(target.y, "target y");
  failFastNumber(target.z, "target z");
  const direction = target
    .clone()
    .sub(position)
    .normalize();

  return {
    direction,
    position,
  };
}

export function computeDirectionalShadowConfig(
  fit: Pick<ModelFitState, "radius"> | null,
  lightDistance: number,
): LightShadowCameraConfig {
  if (fit?.radius !== undefined) {
    failFastNumber(fit.radius, "fit radius");
  }

  const radius = Math.max(fit?.radius ?? 1, FIT_RADIUS_MIN);
  const distance = clampDistance(lightDistance);
  const extentFromModel = radius * 2.2;
  const extentFromLightDistance = distance * 0.35;
  const halfSize = Math.max(extentFromModel, extentFromLightDistance);

  return {
    left: -halfSize,
    right: halfSize,
    top: halfSize,
    bottom: -halfSize,
    near: Math.max(0.05, distance * 0.08),
    far: distance + halfSize * 2.5,
  };
}

export function computeShadowMapSize(softness: number): number {
  const normalized = clamp01(softness);
  const raw = Math.round(
    MathUtils.lerp(SHADOW_MAP_SIZE_MIN, SHADOW_MAP_SIZE_MAX, normalized),
  );
  return Math.max(SHADOW_MAP_SIZE_MIN, raw);
}

export function computeShadowRadius(softness: number): number {
  const normalized = clamp01(softness);
  return MathUtils.lerp(0.4, 4.5, normalized);
}

export function computeShadowBias(softness: number): number {
  const normalized = clamp01(softness);
  const softnessBoost = MathUtils.lerp(-0.0002, 0.0002, normalized);
  return SHADOW_BIAS + softnessBoost;
}

export { SHADOW_BIAS as LIGHT_SHADOW_BIAS };

export function clampShadowSoftness(softness: number): number {
  return MathUtils.clamp(softness, SHADOW_SOFTNESS_MIN, SHADOW_SOFTNESS_MAX);
}
