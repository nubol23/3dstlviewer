import { describe, expect, it } from "vitest";

import {
  assertValueRampState,
  createValueRampColors,
  DEFAULT_VALUE_RAMP,
} from "./valueRamp";

describe("value ramp", () => {
  it.each([3, 4, 5, 6, 7, 8] as const)(
    "creates exactly %i distinct grayscale ramp outputs",
    (stepCount) => {
      const colors = createValueRampColors(DEFAULT_VALUE_RAMP, stepCount);

      expect(colors).toHaveLength(stepCount);
      expect(new Set(colors).size).toBe(stepCount);
      colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
    },
  );

  it("rejects invalid ramp payloads", () => {
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, contrast: 0.5 })).toThrow("Invalid study contrast");
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, contrast: 3.1 })).toThrow("Invalid study contrast");
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, shadowLightness: Number.NaN })).toThrow(
      "Invalid value ramp shadow lightness",
    );
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, shadowLightness: 4 })).toThrow(
      "Invalid value ramp shadow lightness",
    );
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, highlightLightness: 99 })).toThrow(
      "Invalid value ramp highlight lightness",
    );
    expect(() => assertValueRampState({ ...DEFAULT_VALUE_RAMP, bandBias: 0.3 })).toThrow(
      "Invalid value ramp band bias",
    );
    expect(() =>
      assertValueRampState({ ...DEFAULT_VALUE_RAMP, shadowLightness: 45, highlightLightness: 60, bandBias: 0 }),
    ).toThrow("Invalid value ramp contrast");
  });
});
