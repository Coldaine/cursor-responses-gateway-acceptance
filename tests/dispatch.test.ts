import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { DispatchService } from "../server/dispatch.js";

const execFileAsync = promisify(execFile);

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

  it("returns a capped, measured git diff and diffstat", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-diff-"));
    await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "tracked.txt"), "before\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repoRoot });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "baseline"],
      { cwd: repoRoot },
    );
    await writeFile(join(repoRoot, "tracked.txt"), "after\n", "utf8");

    const diff = await new DispatchService(repoRoot).getDiff();
    expect(diff.diff).toContain("-before");
    expect(diff.diff).toContain("+after");
    expect(diff.diffstat).toContain("tracked.txt");
  });
});
