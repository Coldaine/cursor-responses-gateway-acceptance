import { describe, expect, it } from "vitest";

import { clamp } from "../server/small.js";

describe("clamp", () => {
  it("returns the value when inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when below the range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("returns max when above the range", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("returns the bounds when equal to min or max", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
