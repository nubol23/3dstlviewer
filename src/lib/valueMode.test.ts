import { describe, expect, it } from "vitest";

import { clamp01, getValueModeDescriptor, quantizeValue } from "./valueMode";

describe("value mode math", () => {
  it("keeps shaded mode continuous", () => {
    expect(quantizeValue(0.3, "shaded")).toBe(0.3);
    expect(clamp01(1.2)).toBe(1);
  });

  it("quantizes three-step mode", () => {
    const descriptor = getValueModeDescriptor("three-step");
    expect(descriptor.stepCount).toBe(3);
    expect(quantizeValue(0, "three-step")).toBe(0);
    expect(quantizeValue(0.32, "three-step")).toBe(0);
    expect(quantizeValue(0.34, "three-step")).toBe(0.5);
    expect(quantizeValue(0.66, "three-step")).toBe(0.5);
    expect(quantizeValue(0.67, "three-step")).toBe(1);
    expect(quantizeValue(1, "three-step")).toBe(1);
  });

  it("quantizes five-step mode", () => {
    const descriptor = getValueModeDescriptor("five-step");
    expect(descriptor.stepCount).toBe(5);
    expect(quantizeValue(0, "five-step")).toBe(0);
    expect(quantizeValue(0.19, "five-step")).toBe(0);
    expect(quantizeValue(0.2, "five-step")).toBe(0.25);
    expect(quantizeValue(0.55, "five-step")).toBe(0.5);
    expect(quantizeValue(0.8, "five-step")).toBe(1);
    expect(quantizeValue(1, "five-step")).toBe(1);
  });
});
