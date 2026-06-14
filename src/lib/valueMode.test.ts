import { describe, expect, it } from "vitest";

import { clamp01, getValueModeDescriptor, quantizeValue } from "./valueMode";

describe("value mode math", () => {
  it("keeps shaded mode continuous", () => {
    expect(quantizeValue(0.3, "shaded")).toBe(0.3);
    expect(clamp01(1.2)).toBe(1);
  });

  it("quantizes three-step mode", () => {
    const descriptor = getValueModeDescriptor("three-step");
    expect(quantizeValue(0, "three-step")).toBe(descriptor.minValue);
    expect(quantizeValue(0.3, "three-step")).toBeGreaterThanOrEqual(descriptor.minValue);
    expect(quantizeValue(0.3, "three-step")).toBeLessThanOrEqual(descriptor.maxValue);
    expect(quantizeValue(0.5, "three-step")).toBeCloseTo(0.5);
    expect(quantizeValue(1, "three-step")).toBe(descriptor.maxValue);
  });

  it("quantizes five-step mode", () => {
    const descriptor = getValueModeDescriptor("five-step");
    expect(quantizeValue(0, "five-step")).toBe(descriptor.minValue);
    expect(quantizeValue(0.55, "five-step")).toBeGreaterThan(descriptor.minValue);
    expect(quantizeValue(0.55, "five-step")).toBeLessThan(descriptor.maxValue);
    expect(quantizeValue(1, "five-step")).toBe(descriptor.maxValue);
  });
});
