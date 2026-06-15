import { describe, expect, it } from "vitest";

import {
  assertValueRampState,
  createValueRampColors,
  DEFAULT_VALUE_RAMP,
} from "./valueRamp";

describe("value ramp", () => {
  it("creates exactly three grayscale ramp outputs for three-step mode", () => {
    const colors = createValueRampColors(DEFAULT_VALUE_RAMP, 3);

    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(3);
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("creates exactly five grayscale ramp outputs for five-step mode", () => {
    const colors = createValueRampColors(DEFAULT_VALUE_RAMP, 5);

    expect(colors).toHaveLength(5);
    expect(new Set(colors).size).toBe(5);
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("rejects invalid ramp payloads", () => {
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
      assertValueRampState({ shadowLightness: 45, highlightLightness: 60, bandBias: 0 }),
    ).toThrow("Invalid value ramp contrast");
  });
});
