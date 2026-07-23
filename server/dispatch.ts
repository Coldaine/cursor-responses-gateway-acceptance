import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  async getDiff(): Promise<MeasuredDiff> {
    const [diffstat, diff] = await Promise.all([
      execFileAsync("git", ["diff", "--no-ext-diff", "--stat"], {
        cwd: this.repoRoot,
        maxBuffer: 2_000_000,
      }),
      execFileAsync("git", ["diff", "--no-ext-diff"], {
        cwd: this.repoRoot,
        maxBuffer: 2_000_000,
      }),
    ]);
    return {
      diffstat: diffstat.stdout.slice(-8_000),
      diff: diff.stdout.slice(-64_000),
      truncated: diff.stdout.length > 64_000,
    };
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

    let stdout = "";
    try {
      const result = await execFileAsync("rg", [
        "--line-number", "--no-heading", "--color", "never", "--ignore-case",
        "--glob", "!node_modules/**", "--glob", "!dist/**", "--glob", "!.git/**",
        searchTerms.join("|"), ...safePaths,
      ], { cwd: this.repoRoot, maxBuffer: 1_000_000 });
      stdout = result.stdout;
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code !== 1) throw error;
    }

    const allLines = stdout.split(/\r?\n/).filter(Boolean);
    const hits = allLines.slice(0, 100).flatMap((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      return match
        ? [{ path: match[1].replaceAll("\\", "/").replace(/^\.\//, ""), line: Number.parseInt(match[2], 10), excerpt: match[3].slice(0, 500) }]
        : [];
    });
    return { query, hits, truncated: allLines.length > hits.length };
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
}

export interface ExploreResult {
  query: string;
  hits: Array<{ path: string; line: number; excerpt: string }>;
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
