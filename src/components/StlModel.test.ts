import { describe, expect, it } from "vitest";

import { shouldCastPhysicalShadow } from "./StlModel";

describe("StlModel shadow policy", () => {
  it("casts physical shadows in directional mode", () => {
    expect(shouldCastPhysicalShadow(false)).toBe(true);
  });

  it("does not cast physical ground shadows in zenithal mode", () => {
    expect(shouldCastPhysicalShadow(true)).toBe(false);
  });
});
