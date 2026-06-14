import { describe, expect, it } from "vitest";

import { LightState } from "../types";
import {
  sphericalToPosition,
  computeDirectionalShadowConfig,
  lightPoseFromState,
  computeShadowMapSize,
  computeShadowRadius,
} from "./light";

const epsilon = 1e-6;

describe("light math", () => {
  it("converts azimuth/elevation/distance into a spherical position", () => {
    const east = sphericalToPosition(90, 0, 2);
    expect(Math.abs(east.x - 2)).toBeLessThan(epsilon);
    expect(Math.abs(east.y)).toBeLessThan(epsilon);
    expect(Math.abs(east.z)).toBeLessThan(epsilon);

    const north = sphericalToPosition(0, 0, 2);
    expect(Math.abs(north.x)).toBeLessThan(epsilon);
    expect(Math.abs(north.y)).toBeLessThan(epsilon);
    expect(Math.abs(north.z - 2)).toBeLessThan(epsilon);

    const up = sphericalToPosition(0, 90, 2);
    expect(Math.abs(up.x)).toBeLessThan(epsilon);
    expect(Math.abs(up.y - 2)).toBeLessThan(epsilon);
    expect(Math.abs(up.z)).toBeLessThan(epsilon);
  });

  it("derives direction and position from light state", () => {
    const light: LightState = {
      azimuthDeg: 45,
      elevationDeg: 30,
      distance: 3,
      intensity: 1,
      bounceStrength: 0.2,
      shadowSoftness: 0.5,
      locked: false,
    };

    const pose = lightPoseFromState(light);

    expect(pose.position.length()).toBeCloseTo(3);
    expect(pose.direction.length()).toBeCloseTo(1);
    expect(pose.direction.dot(pose.position.clone().negate())).toBeGreaterThan(0.99);
  });

  it("produces shadow camera bounds from fit radius and distance", () => {
    const bounds = computeDirectionalShadowConfig({ radius: 1 }, 3);
    expect(bounds.left).toBeLessThan(0);
    expect(bounds.right).toBeGreaterThan(0);
    expect(bounds.top).toBeGreaterThan(0);
    expect(bounds.bottom).toBeLessThan(0);
    expect(bounds.far).toBeGreaterThan(bounds.near);
  });

  it("maps shadow softness to renderer settings", () => {
    expect(computeShadowMapSize(0)).toBe(256);
    expect(computeShadowMapSize(1)).toBe(2048);
    expect(computeShadowRadius(0)).toBeCloseTo(0.4);
    expect(computeShadowRadius(1)).toBeCloseTo(4.5);
  });
});
