import {
  Box3,
  BufferGeometry,
  Vector3,
} from "three";
import type { LightState, ModelFitState } from "../types";

export function sphericalToCartesian(
  light: Pick<LightState, "azimuthDeg" | "elevationDeg" | "distance">,
): { x: number; y: number; z: number } {
  const azimuth = (light.azimuthDeg * Math.PI) / 180;
  const elevation = (light.elevationDeg * Math.PI) / 180;

  return {
    x: Math.cos(elevation) * Math.sin(azimuth) * light.distance,
    y: Math.sin(elevation) * light.distance,
    z: Math.cos(elevation) * Math.cos(azimuth) * light.distance,
  };
}

export function quantizeValue(value: number, steps: 3 | 5): number {
  if (steps !== 3 && steps !== 5) {
    throw new Error(`Unsupported quantization steps: ${String(steps)}`);
  }

  const clamped = Math.min(1, Math.max(0, value));
  if (clamped === 1) {
    return 1;
  }

  const bins = steps - 1;
  return Math.round(clamped * bins) / bins;
}

export function computeFitState(
  geometry: BufferGeometry,
  targetRadius: number,
): ModelFitState {
  geometry.computeBoundingBox();

  const originalBounds = geometry.boundingBox;
  if (!originalBounds) {
    throw new Error("Geometry is missing a valid bounding box");
  }

  const originalClone = originalBounds.clone();
  const center = new Vector3();
  const size = new Vector3();

  originalClone.getCenter(center);
  originalClone.getSize(size);

  const radius = size.length() / 2;
  if (!(radius > 0)) {
    throw new Error("Geometry has no volume and cannot be fitted");
  }

  const scale = targetRadius / radius;
  const fittedSize = size.clone().multiplyScalar(scale);
  const fittedBounds = new Box3().setFromCenterAndSize(center, fittedSize);

  return {
    originalBounds: originalClone,
    fittedBounds,
    center,
    size,
    radius,
    scale,
  };
}
