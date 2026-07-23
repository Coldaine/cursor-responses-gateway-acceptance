import { describe, expect, it } from "vitest";

import { normalizeWhitespace } from "../server/acceptance-util.js";

describe("normalizeWhitespace", () => {
  it("trims ends and collapses repeated internal whitespace", () => {
    expect(normalizeWhitespace("  hello   world  ")).toBe("hello world");
  });
});
