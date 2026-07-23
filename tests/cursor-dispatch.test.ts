import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { CursorTaskDispatcher } from "../server/cursor-dispatch.js";
import { DispatchService } from "../server/dispatch.js";
import { approvePlan } from "../server/plan-policy.js";

const execFileAsync = promisify(execFile);

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

  it("refuses an unapproved plan before invoking Cursor", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-implement-refusal-"));
    const dispatch = new DispatchService(repoRoot);
    const planPath = await dispatch.writeDraftPlan("task-19", "# Plan\n\nDo it.\n");
    const runner = { async run() { throw new Error("Cursor must not run"); } };
    const implementer = new CursorTaskDispatcher(dispatch, runner as never);

    await expect(implementer.implement({ apiKey: "cursor-key", model: "cursor-test", taskId: "task-19", planPath }))
      .rejects.toThrow("Plan is not approved");
  });

  it("refuses a plan whose body changed after approval", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-implement-tampered-"));
    const dispatch = new DispatchService(repoRoot);
    const planPath = await dispatch.writeDraftPlan("task-19b", "# Plan\n\nDo it.\n");
    await approvePlan(planPath);
    await writeFile(planPath, "---\nstatus: approved\nbody_sha256: invalid\n---\n\n# Plan\n\nDo it.\n", "utf8");
    const runner = { async run() { throw new Error("Cursor must not run"); } };
    const implementer = new CursorTaskDispatcher(dispatch, runner as never);

    await expect(implementer.implement({ apiKey: "cursor-key", model: "cursor-test", taskId: "task-19b", planPath }))
      .rejects.toThrow("Plan body does not match its approved hash");
  });

  it("reverts dispatch-directory edits and returns the measured diffstat", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-implement-"));
    await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
    const dispatch = new DispatchService(repoRoot);
    const planPath = await dispatch.writeDraftPlan("task-20", "# Plan\n\nDo it.\n");
    await approvePlan(planPath);
    const runner = {
      async run() {
        await writeFile(join(repoRoot, "docs", "dispatch", "agent-edit.md"), "forbidden\n", "utf8");
        return { text: "Implemented the plan.", events: [] };
      },
    };
    const implementer = new CursorTaskDispatcher(dispatch, runner as never);

    const result = await implementer.implement({ apiKey: "cursor-key", model: "cursor-test", taskId: "task-20", planPath });
    expect(result.flags).toContain("dispatch_directory_edit_reverted");
    await expect(readFile(join(repoRoot, "docs", "dispatch", "agent-edit.md"), "utf8")).rejects.toThrow();
    expect(result.measuredDiffstat).toBe("");
  });
});
