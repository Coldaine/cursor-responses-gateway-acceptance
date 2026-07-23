import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { CursorRunner } from "./cursor.js";
import { DispatchService } from "./dispatch.js";

export class CursorTaskDispatcher {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly runner: Pick<CursorRunner, "run">,
  ) {}

  async plan(options: {
    apiKey: string;
    model: string;
    taskId: string;
    briefPath: string;
  }): Promise<string> {
    const briefPath = resolve(options.briefPath);
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
    return this.dispatch.writeDraftPlan(options.taskId, output.text);
  }
}
