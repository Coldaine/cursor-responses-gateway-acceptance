import { mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { DispatchService } from "../server/dispatch.js";
import { executeDeterministicTool } from "../server/dispatch-tools.js";

const execFileAsync = promisify(execFile);

describe("deterministic hosted tools", () => {
  it("returns bounded repository file-and-line hits for cursor:explore", async () => {
    const root = await mkdtemp(join(tmpdir(), "cursor-explore-"));
    await writeFile(join(root, "response-server.ts"), "export const responseServer = true;\n", "utf8");
    const dispatch = new DispatchService(root);

    const receipt = await executeDeterministicTool(dispatch, "cursor:explore", {
      query: "Find the response server entry point",
    });

    expect(receipt).toMatchObject({
      status: "completed",
      result: { hits: [expect.objectContaining({ path: "response-server.ts", line: 1 })] },
    });
  });

  it("returns a completed receipt for writing a brief and approving its plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "cursor-hosted-tools-"));
    const dispatch = new DispatchService(root);
    const brief = await executeDeterministicTool(dispatch, "cursor:write_brief", {
      taskId: "task-11",
      content: "Add diagnostics.",
    });
    expect(brief).toMatchObject({
      type: "cursor:write_brief",
      status: "completed",
      result: { briefPath: join(root, "docs", "dispatch", "briefs", "task-11.md") },
    });

    const planPath = join(root, "docs", "dispatch", "plans", "task-11.md");
    await writeFile(planPath, "---\nstatus: draft\n---\n\n# Plan\n\nDo it.\n", "utf8");
    const approval = await executeDeterministicTool(dispatch, "cursor:approve_plan", {
      planPath,
    });
    expect(approval).toMatchObject({
      type: "cursor:approve_plan",
      status: "completed",
      result: { planPath, bodyHash: expect.any(String) },
    });
  });

  it("returns a failed receipt rather than touching GitHub when gate_phase has no origin", async () => {
    const root = await mkdtemp(join(tmpdir(), "cursor-gate-no-origin-"));
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "baseline\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: root });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"],
      { cwd: root },
    );
    await execFileAsync("git", ["switch", "-c", "phase/1"], { cwd: root });
    const receipt = await executeDeterministicTool(new DispatchService(root), "cursor:gate_phase", { phaseId: "1" });

    expect(receipt).toMatchObject({
      status: "failed",
      result: { error: "gate_phase requires an origin remote" },
    });
  });
});
