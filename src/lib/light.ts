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

export function lightPoseFromState(light: Pick<LightState, "azimuthDeg" | "elevationDeg" | "distance">, target = new Vector3()) {
  const position = sphericalToPosition(light.azimuthDeg, light.elevationDeg, light.distance).add(target);
  return { position, direction: target.clone().sub(position).normalize() };
}

export const RENDER_BUDGETS = {
  mobile: { dpr: 1, primaryShadow: 1024, secondaryShadow: 512, pcssSamples: 8, aoQuality: "Low" },
  desktop: { dpr: 1.5, primaryShadow: 2048, secondaryShadow: 1024, pcssSamples: 16, aoQuality: "Medium" },
} as const;
