import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { CursorRunner } from "./cursor.js";
import { DispatchService } from "./dispatch.js";
import { verifyApprovedPlan } from "./plan-policy.js";

interface DispatchSnapshot {
  directories: Set<string>;
  files: Map<string, Buffer>;
}

export interface ImplementResult {
  summary: string;
  measuredDiffstat: string;
  flags: string[];
  transcriptPath: string;
}

export interface PlanResult {
  planPath: string;
  transcriptPath: string;
}

export interface ReviewResult {
  verdict: "pass" | "fail";
  summary: string;
  findings: string[];
  transcriptPath: string;
  flags: string[];
}

const MAX_RECEIPT_TEXT = 8_000;

export class CursorTaskDispatcher {
  private implementActive = false;

  constructor(
    private readonly dispatch: DispatchService,
    private readonly runner: Pick<CursorRunner, "run">,
  ) {}

  async plan(options: {
    apiKey: string;
    model: string;
    taskId: string;
    briefPath: string;
  }): Promise<PlanResult> {
    const briefPath = resolve(this.dispatch.repoRoot, options.briefPath);
    const briefsRoot = resolve(join(this.dispatch.dispatchRoot, "briefs"));
    const relativeBriefPath = relative(briefsRoot, briefPath).replaceAll("\\", "/");
    if (relativeBriefPath.startsWith("../") || relativeBriefPath === "") {
      throw new Error("Brief must be inside docs/dispatch/briefs");
    }
    const brief = await readFile(briefPath, "utf8");
    const output = await this.runner.run({
      apiKey: options.apiKey,
      model: options.model,
      cwd: this.dispatch.repoRoot,
      prompt: [
        "You are the planning role for a repository task.",
        "Do not edit files, run commands, or create commits.",
        "Return only a concise Markdown implementation plan for the following brief.",
        "The server will write your response into the plan file.",
        "Brief:",
        brief,
      ].join("\n\n"),
    });
    const [planPath, transcriptPath] = await Promise.all([
      this.dispatch.writeDraftPlan(options.taskId, output.text),
      this.dispatch.writeTranscript(options.taskId, "plan", output.text),
    ]);
    return { planPath, transcriptPath };
  }

  async implement(options: {
    apiKey: string;
    model: string;
    taskId: string;
    planPath: string;
  }): Promise<ImplementResult> {
    if (this.implementActive) {
      throw new Error("An implement run is already active");
    }

    const planPath = this.assertPlanPath(options.planPath);
    const plan = await verifyApprovedPlan(planPath);
    const baseline = await this.dispatch.captureTaskBaseline(options.taskId);
    this.implementActive = true;
    const before = await snapshotDirectory(this.dispatch.dispatchRoot);
    let output: Awaited<ReturnType<Pick<CursorRunner, "run">["run"]>>;
    let dispatchDirectoryChanged = false;

    try {
      output = await this.runner.run({
        apiKey: options.apiKey,
        model: options.model,
        cwd: this.dispatch.repoRoot,
        prompt: [
          "You are the implementation role for a repository task.",
          "Execute only the approved plan below.",
          "Do not edit docs/dispatch; it is controlled by the server.",
          "Do not create commits or pull requests.",
          `Task ID: ${options.taskId}`,
          "Approved plan:",
          plan.body,
        ].join("\n\n"),
      });
    } finally {
      try {
        dispatchDirectoryChanged = !snapshotsEqual(before, await snapshotDirectory(this.dispatch.dispatchRoot));
      } catch {
        dispatchDirectoryChanged = true;
      }
      if (dispatchDirectoryChanged) {
        await restoreDirectory(this.dispatch.dispatchRoot, before);
      }
      this.implementActive = false;
    }

    await this.dispatch.persistTaskBaseline(baseline);
    const measured = await this.dispatch.getDiff(options.taskId);
    return {
      summary: capText(output!.text),
      measuredDiffstat: measured.diffstat,
      flags: dispatchDirectoryChanged ? ["dispatch_directory_edit_reverted"] : [],
      transcriptPath: await this.dispatch.writeTranscript(options.taskId, "implement", output!.text),
    };
  }

  async review(options: {
    apiKey: string;
    model: string;
    taskId: string;
  }): Promise<ReviewResult> {
    const planPath = join(this.dispatch.dispatchRoot, "plans", `${options.taskId}.md`);
    const briefPath = join(this.dispatch.dispatchRoot, "briefs", `${options.taskId}.md`);
    const [plan, brief, diff] = await Promise.all([
      verifyApprovedPlan(planPath),
      readFile(briefPath, "utf8"),
      this.dispatch.getDiff(options.taskId),
    ]);
    const before = await snapshotDirectory(this.dispatch.dispatchRoot);
    let output: Awaited<ReturnType<Pick<CursorRunner, "run">["run"]>>;
    let dispatchDirectoryChanged = false;
    try {
      output = await this.runner.run({
        apiKey: options.apiKey,
        model: options.model,
        cwd: this.dispatch.repoRoot,
        prompt: [
          "You are the read-only review role for a repository task.",
          "Do not edit files, run commands, create commits, or create pull requests.",
          "Review the measured diff against the brief and approved plan.",
          "Begin with exactly VERDICT: PASS or VERDICT: FAIL, then give concise findings as Markdown bullets.",
          `Task ID: ${options.taskId}`,
          "Brief:", brief,
          "Approved plan:", plan.body,
          "Measured diffstat:", diff.diffstat,
          "Measured diff:", diff.diff,
        ].join("\n\n"),
      });
    } finally {
      try {
        dispatchDirectoryChanged = !snapshotsEqual(before, await snapshotDirectory(this.dispatch.dispatchRoot));
      } catch {
        dispatchDirectoryChanged = true;
      }
      if (dispatchDirectoryChanged) await restoreDirectory(this.dispatch.dispatchRoot, before);
    }

    const transcript = output!.text;
    const verdict = /^\s*VERDICT:\s*PASS\b/im.test(transcript) ? "pass" : "fail";
    const findings = transcript
      .split(/\r?\n/)
      .filter((line) => /^\s*[-*]\s+/.test(line))
      .map((line) => line.replace(/^\s*[-*]\s+/, "").slice(0, 1_000))
      .slice(0, 50);
    return {
      verdict,
      summary: capText(transcript),
      findings,
      transcriptPath: await this.dispatch.writeTranscript(options.taskId, "review", transcript),
      flags: dispatchDirectoryChanged ? ["dispatch_directory_edit_reverted"] : [],
    };
  }

  private assertPlanPath(candidate: string): string {
    const planPath = resolve(this.dispatch.repoRoot, candidate);
    const plansRoot = resolve(join(this.dispatch.dispatchRoot, "plans"));
    const relativePlanPath = relative(plansRoot, planPath).replaceAll("\\", "/");
    if (relativePlanPath.startsWith("../") || relativePlanPath === "") {
      throw new Error("Plan must be inside docs/dispatch/plans");
    }
    return planPath;
  }
}

function capText(text: string): string {
  return text.length <= MAX_RECEIPT_TEXT
    ? text
    : `${text.slice(0, MAX_RECEIPT_TEXT)}\n\n[truncated; full transcript is stored on disk]`;
}

async function snapshotDirectory(root: string): Promise<DispatchSnapshot> {
  const directories = new Set<string>([""]);
  const files = new Map<string, Buffer>();

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.add(relativePath);
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.set(relativePath, await readFile(absolutePath));
      } else {
        throw new Error(`Unsupported entry in docs/dispatch: ${relativePath}`);
      }
    }
  }

  await visit(root, "");
  return { directories, files };
}

function snapshotsEqual(left: DispatchSnapshot, right: DispatchSnapshot): boolean {
  if (left.directories.size !== right.directories.size || left.files.size !== right.files.size) return false;
  for (const directory of left.directories) if (!right.directories.has(directory)) return false;
  for (const [path, contents] of left.files) {
    const other = right.files.get(path);
    if (!other || !contents.equals(other)) return false;
  }
  return true;
}

async function restoreDirectory(root: string, snapshot: DispatchSnapshot): Promise<void> {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const directory of [...snapshot.directories].sort((left, right) => left.length - right.length)) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const [path, contents] of snapshot.files) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
