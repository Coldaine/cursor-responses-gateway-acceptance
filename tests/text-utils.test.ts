import { describe, expect, it } from "vitest";

import { clampLength } from "../server/text-utils.js";

describe("clampLength", () => {
  it("returns short strings unchanged", () => {
    expect(clampLength("hello", 10)).toBe("hello");
  });

  it("truncates strings longer than max", () => {
    expect(clampLength("hello world", 5)).toBe("hello");
  });

  it("returns empty input unchanged when max is positive", () => {
    expect(clampLength("", 5)).toBe("");
  });

  it("returns empty string when max is zero or negative", () => {
    expect(clampLength("hello", 0)).toBe("");
    expect(clampLength("hello", -1)).toBe("");
  });
});
