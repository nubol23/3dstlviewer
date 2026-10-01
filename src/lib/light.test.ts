import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { DEFAULT_LIGHT } from "../state";
import { lightPoseFromState, resolveStudyLight } from "./light";

describe("study light placement", () => {
  it("aims the local source at the model center at the requested distance", () => {
    const center = new Vector3(1, 2, 3);
    const pose = lightPoseFromState({ ...DEFAULT_LIGHT, azimuthDeg: 90, elevationDeg: 0, distance: 2 }, center);
    expect(pose.position.distanceTo(center)).toBeCloseTo(2);
    expect(pose.position.x).toBeCloseTo(3);
    expect(pose.direction.x).toBeCloseTo(-1);
  });
  it("keeps both zenithal studies overhead without changing source strength", () => {
    for (const mode of ["zenithal", "broad-zenithal"] as const) {
      expect(resolveStudyLight(DEFAULT_LIGHT, mode)).toEqual({ ...DEFAULT_LIGHT, azimuthDeg: 0, elevationDeg: 90 });
    }
  });
});
