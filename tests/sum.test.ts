import { describe, expect, it } from "vitest";

import { sum } from "../server/sum.js";

describe("sum", () => {
  it("adds two positive numbers", () => {
    expect(sum(2, 3)).toBe(5);
  });

  it("adds a negative and a positive number", () => {
    expect(sum(-1, 1)).toBe(0);
  });
});
