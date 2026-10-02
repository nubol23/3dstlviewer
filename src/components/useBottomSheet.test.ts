import { describe, expect, it } from "vitest";
import { settleSheet, sheetHeights } from "./useBottomSheet";

const heights = sheetHeights(844);

describe("bottom sheet snapping", () => {
  it("settles a slow release on the nearest stop", () => {
    expect(settleSheet(heights.half + 40, 0, heights)).toBe("half");
    expect(settleSheet(heights.full - 30, 0.1, heights)).toBe("full");
    expect(settleSheet(60, -0.1, heights)).toBe("closed");
  });

  it("moves one stop in the direction of a flick", () => {
    expect(settleSheet(heights.full - 30, 0.8, heights)).toBe("half");
    expect(settleSheet(heights.half - 20, 0.8, heights)).toBe("closed");
    expect(settleSheet(heights.half + 20, -0.8, heights)).toBe("full");
    expect(settleSheet(30, -0.8, heights)).toBe("half");
  });

  it("uses a shorter half stop on short screens", () => {
    expect(sheetHeights(568).half).toBe(Math.round(568 * 0.4));
    expect(sheetHeights(844).half).toBe(Math.round(Math.min(844 * 0.46, 440)));
  });
});
