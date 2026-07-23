import { describe, expect, it } from "vitest";

import { collectAssistantText } from "../server/cursor.js";

describe("Cursor event translation", () => {
  it("collects text blocks from assistant events while ignoring non-text messages", () => {
    const text = collectAssistantText([
      {
        type: "status",
        agent_id: "agent_1",
        run_id: "run_1",
        status: "RUNNING",
      },
      {
        type: "assistant",
        agent_id: "agent_1",
        run_id: "run_1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello " }],
        },
      },
      {
        type: "assistant",
        agent_id: "agent_1",
        run_id: "run_1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "world" }],
        },
      },
    ]);

    expect(text).toBe("hello world");
  });
});
