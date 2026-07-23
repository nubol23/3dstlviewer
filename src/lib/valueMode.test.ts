import { describe, expect, it } from "vitest";

import {
  assertValueRenderStyle,
  assertValueStepCount,
  clamp01,
  quantizeValue,
} from "./valueMode";

describe("value mode math", () => {
  it("keeps smooth rendering continuous", () => {
    expect(quantizeValue(0.3, "smooth", 5)).toBe(0.3);
    expect(clamp01(1.2)).toBe(1);
  });

  it.each([3, 4, 5, 6, 7, 8] as const)(
    "quantizes stepped rendering into %i visible values",
    (stepCount) => {
      expect(quantizeValue(0, "stepped", stepCount)).toBe(0);
      expect(quantizeValue(1, "stepped", stepCount)).toBe(1);
      const outputs = new Set(
        Array.from({ length: 1001 }, (_, index) =>
          quantizeValue(index / 1000, "stepped", stepCount),
        ),
      );
      expect(outputs.size).toBe(stepCount);
    },
  );

  it("fails fast for unsupported render styles and value counts", () => {
    expect(() => assertValueRenderStyle("posterized")).toThrow(
      "Unsupported value render style",
    );
    expect(() => assertValueStepCount(9)).toThrow("Unsupported value step count");
  });
});
