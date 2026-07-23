import { describe, expect, it } from "vitest";

import { createToolReceipt } from "../server/receipts.js";

describe("hosted tool receipts", () => {
  it("retains invocation and result information for a follow-up request", () => {
    const receipt = createToolReceipt({
      type: "cursor:explore",
      invocation: { query: "where is authentication?" },
      result: { hits: [{ path: "server/app.ts", line: 1 }] },
    });

    expect(receipt).toMatchObject({
      id: expect.stringMatching(/^cursor_item_/),
      type: "cursor:explore",
      status: "completed",
      invocation: { query: "where is authentication?" },
      result: { hits: [{ path: "server/app.ts", line: 1 }] },
    });
  });
});
