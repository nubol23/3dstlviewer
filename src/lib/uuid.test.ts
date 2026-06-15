import { afterEach, describe, expect, it, vi } from "vitest";

import { createUuid } from "./uuid";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUuid", () => {
  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    });

    expect(createUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index + 1;
        }
        return bytes;
      },
    });

    const id = createUuid();

    expect(id).toMatch(UUID_PATTERN);
    expect(id).toBe("01020304-0506-4708-890a-0b0c0d0e0f10");
  });
});
