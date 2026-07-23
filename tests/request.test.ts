import { describe, expect, it } from "vitest";

import { parseResponseRequest, renderInputForCursor } from "../server/request.js";

describe("Open Responses request normalization", () => {
  it("keeps system, history, and new user input in request order for Cursor", () => {
    const request = parseResponseRequest({
      model: "cursor-test",
      input: [
        { type: "message", role: "system", content: "Answer tersely." },
        { type: "message", role: "assistant", content: "Prior answer." },
        { type: "message", role: "user", content: "What is next?" },
      ],
    });

    expect(renderInputForCursor(request.input)).toBe(
      "[system]\nAnswer tersely.\n\n[assistant]\nPrior answer.\n\n[user]\nWhat is next?",
    );
    expect(request.stream).toBe(false);
    expect(request.store).toBe(true);
  });
});
