import { describe, expect, it } from "vitest";

import { increment } from "../server/acceptance-helper.js";

describe("increment", () => {
  it("returns n + 1 for a positive number", () => {
    expect(increment(1)).toBe(2);
  });

  it("returns 1 when given 0", () => {
    expect(increment(0)).toBe(1);
  });

  it("handles negative numbers", () => {
    expect(increment(-1)).toBe(0);
  });
});
