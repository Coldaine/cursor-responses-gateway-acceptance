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

  it("records a task baseline and reports only changes after that commit", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-task-baseline-"));
    await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "tracked.txt"), "before\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repoRoot });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "baseline"],
      { cwd: repoRoot },
    );
    const dispatch = new DispatchService(repoRoot);
    const baseline = await dispatch.captureTaskBaseline("task-8");
    await dispatch.persistTaskBaseline(baseline);
    await writeFile(join(repoRoot, "tracked.txt"), "after\n", "utf8");

    const diff = await dispatch.getDiff("task-8");
    expect(diff.baseCommit).toBe(baseline.baseCommit);
    expect(diff.diff).toContain("+after");
  });

  it("integrates only a baselined task onto a phase branch without changing base", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-integrate-"));
    await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "tracked.txt"), "before\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-qm", "baseline"], { cwd: repoRoot });
    const dispatch = new DispatchService(repoRoot);
    const baseline = await dispatch.captureTaskBaseline("task-9");
    await dispatch.persistTaskBaseline(baseline);
    await writeFile(join(repoRoot, "tracked.txt"), "after\n", "utf8");

    const result = await dispatch.integrateTask("task-9", "1");

    expect(result).toMatchObject({ taskId: "task-9", phaseBranch: "phase/1", baseBranch: baseline.baseBranch });
    await expect(execFileAsync("git", ["branch", "--show-current"], { cwd: repoRoot }))
      .resolves.toMatchObject({ stdout: "phase/1\n" });
    await expect(execFileAsync("git", ["show", `${baseline.baseBranch}:tracked.txt`], { cwd: repoRoot }))
      .resolves.toMatchObject({ stdout: "before\n" });
    await expect(execFileAsync("git", ["show", "phase/1:tracked.txt"], { cwd: repoRoot }))
      .resolves.toMatchObject({ stdout: "after\n" });
  });

  it("writes a draft plan from a Cursor planner result without letting the agent choose its path", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-plan-"));
    const dispatch = new DispatchService(repoRoot);
    const briefPath = await dispatch.writeBrief("task-16", "Add an endpoint.");
    const planPath = await dispatch.writeDraftPlan("task-16", "# Plan\n\n1. Add the endpoint.\n");

    expect(planPath).toBe(join(repoRoot, "docs", "dispatch", "plans", "task-16.md"));
    await expect(readFile(planPath, "utf8")).resolves.toBe(
      "---\nstatus: draft\n---\n\n# Plan\n\n1. Add the endpoint.\n",
    );
    expect(briefPath).toContain("docs");
  });
});
