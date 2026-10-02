import { MathUtils, Vector3 } from "three";
import type { LightingMode, LightState } from "../types";

export function sphericalToPosition(azimuthDeg: number, elevationDeg: number, distance: number, out = new Vector3()): Vector3 {
  if (![azimuthDeg, elevationDeg, distance].every(Number.isFinite) || distance <= 0) throw new Error("Invalid light position");
  const azimuth = MathUtils.degToRad(azimuthDeg);
  const elevation = MathUtils.degToRad(elevationDeg);
  return out.set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth)).multiplyScalar(distance);
}

export function resolveStudyLight(light: LightState, mode: LightingMode): LightState {
  return mode === "zenithal" || mode === "broad-zenithal" ? { ...light, azimuthDeg: 0, elevationDeg: 90 } : light;
}

// Phones and tablets render the same study as desktop. They only differ in the
// pixel-ratio cap and in dropping resolution while the camera or light moves.
export const RENDER_BUDGET = { primaryShadow: 2048, secondaryShadow: 1024, pcssSamples: 16 } as const;
export const MAX_DPR = { desktop: 1.5, touch: 2 } as const;
export const MOVING_DPR_SCALE = 0.5;
