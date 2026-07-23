import { describe, expect, it } from "vitest";

import { clamp } from "../server/clamp.js";

describe("clamp", () => {
  it("returns the value when it is inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when the value is below min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("returns max when the value is above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns the bound when the value equals min or max", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
