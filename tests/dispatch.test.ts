import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DispatchService } from "../server/dispatch.js";

describe("deterministic dispatch operations", () => {
  it("writes briefs only under the dispatch directory and approves plans there", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-dispatch-"));
    const dispatch = new DispatchService(repoRoot);

    const briefPath = await dispatch.writeBrief("task-7", "Add a small feature.");
    expect(briefPath).toBe(join(repoRoot, "docs", "dispatch", "briefs", "task-7.md"));
    await expect(readFile(briefPath, "utf8")).resolves.toBe("Add a small feature.\n");

    const planPath = join(repoRoot, "docs", "dispatch", "plans", "task-7.md");
    await writeFile(planPath, "---\nstatus: draft\n---\n\n# Plan\n\nDo it.\n", "utf8");
    await expect(dispatch.approvePlan(planPath)).resolves.toMatchObject({
      status: "approved",
    });
  });

  it("runs configured checks and returns their measured exit status", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-checks-"));
    const checksPath = join(repoRoot, "checks.yaml");
    await writeFile(
      checksPath,
      'checks:\n  pass:\n    command: "node -e \\\"process.exit(0)\\\""\n  fail:\n    command: "node -e \\\"process.exit(3)\\\""\n',
      "utf8",
    );
    const dispatch = new DispatchService(repoRoot, checksPath);

    await expect(dispatch.runChecks()).resolves.toEqual([
      expect.objectContaining({ name: "pass", passed: true, exitCode: 0 }),
      expect.objectContaining({ name: "fail", passed: false, exitCode: 3 }),
    ]);
  });
});
