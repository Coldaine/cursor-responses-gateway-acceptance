import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "yaml";

import { approvePlan, type VerifiedPlan } from "./plan-policy.js";

const execFileAsync = promisify(execFile);

function assertTaskId(taskId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(taskId)) {
    throw new Error("taskId must contain only letters, numbers, dots, underscores, and dashes");
  }
}

function assertPhaseId(phaseId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(phaseId)) {
    throw new Error("phaseId must contain only letters, numbers, dots, underscores, and dashes");
  }
}

export class DispatchService {
  readonly dispatchRoot: string;

  constructor(
    readonly repoRoot: string,
    readonly checksPath = join(repoRoot, "config", "checks.yaml"),
  ) {
    this.dispatchRoot = join(repoRoot, "docs", "dispatch");
  }

  async writeBrief(taskId: string, content: string): Promise<string> {
    assertTaskId(taskId);
    const briefsRoot = join(this.dispatchRoot, "briefs");
    await mkdir(briefsRoot, { recursive: true });
    await mkdir(join(this.dispatchRoot, "plans"), { recursive: true });
    const briefPath = join(briefsRoot, `${taskId}.md`);
    await writeFile(briefPath, `${content.trimEnd()}\n`, "utf8");
    return briefPath;
  }

  async writeDraftPlan(taskId: string, content: string): Promise<string> {
    assertTaskId(taskId);
    const plansRoot = join(this.dispatchRoot, "plans");
    await mkdir(plansRoot, { recursive: true });
    const planPath = join(plansRoot, `${taskId}.md`);
    const body = content.trimEnd();
    await writeFile(planPath, `---\nstatus: draft\n---\n\n${body}\n`, "utf8");
    return planPath;
  }

  async approvePlan(planPath: string): Promise<VerifiedPlan> {
    const resolvedPlanPath = resolve(planPath);
    const relativePlanPath = relative(resolve(this.dispatchRoot), resolvedPlanPath);
    const normalizedPlanPath = relativePlanPath.replaceAll("\\", "/");
    if (
      normalizedPlanPath.startsWith("../") ||
      normalizedPlanPath === "" ||
      !normalizedPlanPath.startsWith("plans/")
    ) {
      throw new Error("Plan must be inside docs/dispatch/plans");
    }
    await mkdir(dirname(resolvedPlanPath), { recursive: true });
    return approvePlan(resolvedPlanPath);
  }

  async runChecks(suite?: string): Promise<CheckResult[]> {
    const loaded = parse(await readFile(this.checksPath, "utf8")) as {
      checks?: Record<string, { command?: unknown }>;
    };
    if (!loaded.checks || typeof loaded.checks !== "object") {
      throw new Error("checks.yaml must contain a checks object");
    }

    const entries = Object.entries(loaded.checks);
    const selected = suite ? entries.filter(([name]) => name === suite) : entries;
    if (suite && selected.length === 0) throw new Error(`Unknown check suite: ${suite}`);
    return Promise.all(
      selected.map(([name, config]) => {
        if (!config || typeof config.command !== "string" || config.command.length === 0) {
          throw new Error(`Check ${name} must define a command`);
        }
        return runCheck(name, config.command, this.repoRoot);
      }),
    );
  }

  async getDiff(taskId?: string): Promise<MeasuredDiff> {
    const baseCommit = taskId ? (await this.readTaskBaseline(taskId)).baseCommit : undefined;
    const [diffstat, diff] = await Promise.all([
      execFileAsync("git", ["diff", "--no-ext-diff", "--stat", ...(baseCommit ? [baseCommit] : [])], {
        cwd: this.repoRoot,
        maxBuffer: 2_000_000,
      }),
      execFileAsync("git", ["diff", "--no-ext-diff", ...(baseCommit ? [baseCommit] : [])], {
        cwd: this.repoRoot,
        maxBuffer: 2_000_000,
      }),
    ]);
    return {
      diffstat: diffstat.stdout.slice(-8_000),
      diff: diff.stdout.slice(-64_000),
      truncated: diff.stdout.length > 64_000,
      ...(baseCommit ? { baseCommit } : {}),
    };
  }

  async captureTaskBaseline(taskId: string): Promise<TaskBaseline> {
    assertTaskId(taskId);
    const existing = await this.tryReadTaskBaseline(taskId);
    if (existing) return existing;
    const dirty = await execFileAsync("git", ["status", "--porcelain", "--", ".", ":(exclude)docs/dispatch/**"], {
      cwd: this.repoRoot,
    });
    if (dirty.stdout.trim().length > 0) {
      throw new Error("Cannot establish a task baseline while non-dispatch workspace changes are present");
    }
    const commit = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.repoRoot });
    const branch = await execFileAsync("git", ["branch", "--show-current"], { cwd: this.repoRoot });
    const baseBranch = branch.stdout.trim();
    if (!baseBranch) throw new Error("Cannot establish a task baseline from a detached HEAD");
    return { taskId, baseCommit: commit.stdout.trim(), baseBranch };
  }

  async persistTaskBaseline(baseline: TaskBaseline): Promise<void> {
    assertTaskId(baseline.taskId);
    const taskPath = this.taskStatePath(baseline.taskId);
    await mkdir(dirname(taskPath), { recursive: true });
    await writeFile(taskPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  }

  async writeTranscript(taskId: string, role: "plan" | "implement" | "review", content: string): Promise<string> {
    assertTaskId(taskId);
    const episodesRoot = join(this.dispatchRoot, "episodes");
    await mkdir(episodesRoot, { recursive: true });
    const transcriptPath = join(episodesRoot, `${taskId}-${role}-${Date.now()}.md`);
    await writeFile(transcriptPath, content, "utf8");
    return transcriptPath;
  }

  async writeResponseTranscript(responseId: string, content: string): Promise<string> {
    if (!/^resp_[a-zA-Z0-9]+$/.test(responseId)) throw new Error("responseId is invalid");
    const responsesRoot = join(this.dispatchRoot, "runtime", "responses");
    await mkdir(responsesRoot, { recursive: true });
    const transcriptPath = join(responsesRoot, `${responseId}.md`);
    await writeFile(transcriptPath, content, "utf8");
    return transcriptPath;
  }

  async integrateTask(taskId: string, phaseId: string): Promise<IntegrationResult> {
    assertTaskId(taskId);
    assertPhaseId(phaseId);
    const baseline = await this.readTaskBaseline(taskId);
    if (baseline.integrationCommit) {
      throw new Error(`Task ${taskId} is already integrated at ${baseline.integrationCommit}`);
    }

    const changed = await execFileAsync("git", ["status", "--porcelain", "--", ".", ":(exclude)docs/dispatch/**"], {
      cwd: this.repoRoot,
    });
    if (changed.stdout.trim().length === 0) {
      throw new Error(`Task ${taskId} has no non-dispatch changes to integrate`);
    }

    const phaseBranch = `phase/${phaseId}`;
    const branchExists = await this.gitRefExists(`refs/heads/${phaseBranch}`);
    if (branchExists) {
      await execFileAsync("git", ["switch", phaseBranch], { cwd: this.repoRoot });
    } else {
      await execFileAsync("git", ["switch", "-c", phaseBranch, baseline.baseCommit], { cwd: this.repoRoot });
    }

    try {
      const staged = await this.stageTaskChanges(baseline.baseCommit);
      if (!staged) throw new Error(`Task ${taskId} produced no stageable changes`);
      await execFileAsync("git", ["commit", "-m", `feat(${taskId}): integrate task`], { cwd: this.repoRoot });
    } catch (error) {
      // captureTaskBaseline requires a clean non-dispatch index before any
      // task begins. Restoring this index therefore cannot discard user work;
      // it only makes a failed integration retryable.
      await execFileAsync("git", ["reset", "--quiet"], { cwd: this.repoRoot });
      throw error;
    }
    const commit = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.repoRoot });
    const integrationCommit = commit.stdout.trim();
    const updated: TaskBaseline = { ...baseline, phaseBranch, integrationCommit };
    await this.persistTaskBaseline(updated);
    return { taskId, phaseBranch, commit: integrationCommit, baseBranch: baseline.baseBranch };
  }

  async gatePhase(phaseId: string): Promise<GateResult> {
    assertPhaseId(phaseId);
    const phaseBranch = `phase/${phaseId}`;
    if (!await this.gitRefExists(`refs/heads/${phaseBranch}`)) {
      throw new Error(`Phase branch ${phaseBranch} does not exist`);
    }
    try {
      await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: this.repoRoot });
    } catch {
      throw new Error("gate_phase requires an origin remote");
    }
    await execFileAsync("git", ["push", "-u", "origin", phaseBranch], { cwd: this.repoRoot });
    const defaultBranch = await execFileAsync("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], {
      cwd: this.repoRoot,
    });
    const baseBranch = defaultBranch.stdout.trim();
    if (!baseBranch) throw new Error("Could not resolve the remote default branch");
    const created = await execFileAsync("gh", [
      "pr", "create", "--base", baseBranch, "--head", phaseBranch,
      "--title", `Phase ${phaseId}`, "--body", `Ephemeral CI gate for ${phaseBranch}.`,
    ], { cwd: this.repoRoot });
    const pullRequestUrl = created.stdout.trim();
    if (!pullRequestUrl) throw new Error("gh pr create did not return a pull request URL");

    try {
      await execFileAsync("gh", ["pr", "checks", pullRequestUrl, "--watch", "--fail-fast", "--interval", "10"], {
        cwd: this.repoRoot,
      });
    } catch {
      const checks = await this.readPrChecks(pullRequestUrl);
      await execFileAsync("gh", ["pr", "close", pullRequestUrl, "--comment", "Closing failed ephemeral phase gate."], {
        cwd: this.repoRoot,
      });
      return { status: "failed", phaseBranch, pullRequestUrl, failedChecks: checks.filter((check) => check.bucket === "fail") };
    }

    await execFileAsync("gh", ["pr", "merge", pullRequestUrl, "--merge", "--delete-branch"], { cwd: this.repoRoot });
    const state = await execFileAsync("gh", ["pr", "view", pullRequestUrl, "--json", "state,mergedAt", "--jq", ".state"], {
      cwd: this.repoRoot,
    });
    if (state.stdout.trim() !== "MERGED") {
      return { status: "pending", phaseBranch, pullRequestUrl, failedChecks: [] };
    }
    return { status: "merged", phaseBranch, pullRequestUrl, failedChecks: [] };
  }

  async explore(query: string, paths?: string[]): Promise<ExploreResult> {
    const terms = query.match(/[a-zA-Z0-9_]{3,}/g)?.map((term) => term.toLowerCase()) ?? [];
    const ignoredTerms = new Set(["find", "where", "what", "with", "from", "that", "this", "code", "file", "files", "the", "and", "for"]);
    const searchTerms = [...new Set(terms.filter((term) => !ignoredTerms.has(term)))];
    if (searchTerms.length === 0) throw new Error("query must contain at least one searchable term");

    const safePaths = (paths ?? ["."]).map((candidate) => {
      const resolvedPath = resolve(this.repoRoot, candidate);
      const relativePath = relative(resolve(this.repoRoot), resolvedPath).replaceAll("\\", "/");
      if (relativePath.startsWith("../") || relativePath === "") {
        if (candidate === ".") return ".";
        throw new Error("explore paths must stay inside the configured repository");
      }
      return relativePath;
    });

    let searchOutput: ExploreSearchOutput = { stdout: "", truncated: false };
    try {
      const result = await execFileAsync("rg", [
        "--line-number", "--no-heading", "--color", "never", "--ignore-case",
        "--glob", "!node_modules/**", "--glob", "!dist/**", "--glob", "!.git/**",
        searchTerms.join("|"), ...safePaths,
      ], { cwd: this.repoRoot, maxBuffer: 1_000_000 });
      searchOutput = { stdout: result.stdout, truncated: false };
    } catch (error: unknown) {
      const code = (error as { code?: unknown }).code;
      if (code === "ENOENT") {
        searchOutput = await this.exploreWithoutRipgrep(searchTerms, safePaths);
      } else if (code !== 1) {
        throw error;
      }
    }

    const allLines = searchOutput.stdout.split(/\r?\n/).filter(Boolean);
    const hits = allLines.slice(0, 100).flatMap((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      return match
        ? [{ path: match[1].replaceAll("\\", "/").replace(/^\.\//, ""), line: Number.parseInt(match[2], 10), excerpt: match[3].slice(0, 500) }]
        : [];
    });
    return { query, hits, truncated: searchOutput.truncated || allLines.length > hits.length };
  }

  private async exploreWithoutRipgrep(searchTerms: string[], paths: string[]): Promise<ExploreSearchOutput> {
    const lines: string[] = [];
    let filesVisited = 0;
    let truncated = false;
    const visit = async (relativePath: string): Promise<void> => {
      if (truncated) return;
      const absolutePath = resolve(this.repoRoot, relativePath);
      const metadata = await stat(absolutePath);
      if (metadata.isDirectory()) {
        for (const entry of await readdir(absolutePath, { withFileTypes: true })) {
          if ([".git", "dist", "node_modules"].includes(entry.name)) continue;
          await visit(join(relativePath, entry.name));
          if (truncated) return;
        }
        return;
      }
      if (!metadata.isFile()) return;
      filesVisited += 1;
      if (filesVisited > 10_000 || metadata.size > 1_000_000) {
        truncated = true;
        return;
      }
      const content = await readFile(absolutePath, "utf8").catch(() => null);
      if (content === null) return;
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (!searchTerms.some((term) => line.toLowerCase().includes(term))) continue;
        lines.push(`${relativePath.replaceAll("\\", "/")}:${index + 1}:${line}`);
        if (lines.length > 100) {
          truncated = true;
          return;
        }
      }
    };

    for (const path of paths) {
      await visit(path);
      if (truncated) break;
    }
    return { stdout: lines.join("\n"), truncated };
  }

  private taskStatePath(taskId: string): string {
    return join(this.dispatchRoot, "runtime", "tasks", `${taskId}.json`);
  }

  private async readTaskBaseline(taskId: string): Promise<TaskBaseline> {
    const baseline = await this.tryReadTaskBaseline(taskId);
    if (!baseline) throw new Error(`No task baseline exists for ${taskId}`);
    return baseline;
  }

  private async tryReadTaskBaseline(taskId: string): Promise<TaskBaseline | null> {
    assertTaskId(taskId);
    try {
      const parsed = JSON.parse(await readFile(this.taskStatePath(taskId), "utf8")) as Partial<TaskBaseline>;
      if (
        parsed.taskId !== taskId ||
        typeof parsed.baseCommit !== "string" || parsed.baseCommit.length === 0 ||
        typeof parsed.baseBranch !== "string" || parsed.baseBranch.length === 0
      ) {
        throw new Error(`Task baseline for ${taskId} is invalid`);
      }
      return {
        taskId,
        baseCommit: parsed.baseCommit,
        baseBranch: parsed.baseBranch,
        ...(typeof parsed.phaseBranch === "string" ? { phaseBranch: parsed.phaseBranch } : {}),
        ...(typeof parsed.integrationCommit === "string" ? { integrationCommit: parsed.integrationCommit } : {}),
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async gitRefExists(ref: string): Promise<boolean> {
    try {
      await execFileAsync("git", ["show-ref", "--verify", "--quiet", ref], { cwd: this.repoRoot });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code === 1) return false;
      throw error;
    }
  }

  private async gitHasChanges(args: string[]): Promise<boolean> {
    try {
      await execFileAsync("git", args, { cwd: this.repoRoot });
      return false;
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code === 1) return true;
      throw error;
    }
  }

  private async stageTaskChanges(baseCommit: string): Promise<boolean> {
    const [tracked, untracked] = await Promise.all([
      execFileAsync("git", ["diff", "--name-only", "-z", baseCommit], { cwd: this.repoRoot }),
      execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: this.repoRoot }),
    ]);
    const paths = [...new Set([...nulPaths(tracked.stdout), ...nulPaths(untracked.stdout)])]
      .filter((path) => path !== "docs/dispatch" && !path.startsWith("docs/dispatch/"));
    if (paths.length === 0) return false;
    await execFileAsync("git", ["add", "-A", "--", ...paths], { cwd: this.repoRoot });
    return this.gitHasChanges(["diff", "--cached", "--quiet"]);
  }

  private async readPrChecks(pullRequestUrl: string): Promise<PrCheck[]> {
    try {
      const result = await execFileAsync("gh", ["pr", "checks", pullRequestUrl, "--json", "name,bucket,state,link"], {
        cwd: this.repoRoot,
      });
      const parsed = JSON.parse(result.stdout) as unknown;
      return Array.isArray(parsed)
        ? parsed.flatMap((entry): PrCheck[] => {
          if (!entry || typeof entry !== "object") return [];
          const candidate = entry as Record<string, unknown>;
          return typeof candidate.name === "string" && typeof candidate.bucket === "string" && typeof candidate.state === "string"
            ? [{ name: candidate.name, bucket: candidate.bucket, state: candidate.state, link: typeof candidate.link === "string" ? candidate.link : undefined }]
            : [];
        })
        : [];
    } catch {
      return [];
    }
  }
}

export interface CheckResult {
  name: string;
  command: string;
  passed: boolean;
  exitCode: number | null;
  outputTail: string;
}

export interface MeasuredDiff {
  diffstat: string;
  diff: string;
  truncated: boolean;
  baseCommit?: string;
}

export interface TaskBaseline {
  taskId: string;
  baseCommit: string;
  baseBranch: string;
  phaseBranch?: string;
  integrationCommit?: string;
}

export interface IntegrationResult {
  taskId: string;
  phaseBranch: string;
  commit: string;
  baseBranch: string;
}

export interface PrCheck {
  name: string;
  bucket: string;
  state: string;
  link?: string;
}

export interface GateResult {
  status: "merged" | "failed" | "pending";
  phaseBranch: string;
  pullRequestUrl: string;
  failedChecks: PrCheck[];
}

export interface ExploreResult {
  query: string;
  hits: Array<{ path: string; line: number; excerpt: string }>;
  truncated: boolean;
}

interface ExploreSearchOutput {
  stdout: string;
  truncated: boolean;
}

async function runCheck(name: string, command: string, cwd: string): Promise<CheckResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolveResult({
        name,
        command,
        passed: exitCode === 0,
        exitCode,
        outputTail: output.slice(-8_000),
      });
    });
  });
}

function nulPaths(stdout: string): string[] {
  return stdout.split("\0").filter(Boolean);
}
