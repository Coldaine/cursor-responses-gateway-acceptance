import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CursorTaskDispatcher } from "../server/cursor-dispatch.js";
import { DispatchService } from "../server/dispatch.js";

describe("Cursor task dispatch", () => {
  it("uses Cursor output as a server-written draft plan", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-planner-"));
    const dispatch = new DispatchService(repoRoot);
    const briefPath = await dispatch.writeBrief("task-17", "Add a health endpoint.");
    const prompts: string[] = [];
    const runner = {
      async run(options: { prompt: string }) {
        prompts.push(options.prompt);
        return { text: "# Plan\n\n1. Add health route.\n", events: [] };
      },
    };
    const planner = new CursorTaskDispatcher(dispatch, runner as never);

    const planPath = await planner.plan({
      apiKey: "cursor-key",
      model: "cursor-test",
      taskId: "task-17",
      briefPath,
    });

    expect(prompts[0]).toContain("Do not edit files");
    expect(prompts[0]).toContain("Add a health endpoint.");
    await expect(readFile(planPath, "utf8")).resolves.toContain("status: draft");
  });
});
