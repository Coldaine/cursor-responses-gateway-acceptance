import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { approvePlan, type VerifiedPlan } from "./plan-policy.js";

function assertTaskId(taskId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(taskId)) {
    throw new Error("taskId must contain only letters, numbers, dots, underscores, and dashes");
  }
}

export class DispatchService {
  readonly dispatchRoot: string;

  constructor(readonly repoRoot: string) {
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
}
