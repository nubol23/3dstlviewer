import { describe, expect, it } from "vitest";
import { DEFAULT_LIGHT } from "../state";
import { resolveStudyLight } from "./light";

describe("study light placement", () => {
  it("keeps both zenithal studies overhead without changing source strength", () => {
    for (const mode of ["zenithal", "broad-zenithal"] as const) {
      expect(resolveStudyLight(DEFAULT_LIGHT, mode)).toEqual({ ...DEFAULT_LIGHT, azimuthDeg: 0, elevationDeg: 90 });
    }
  });
});
