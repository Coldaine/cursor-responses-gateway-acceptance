import type { CursorRunner } from "./cursor.js";
import { CursorTaskDispatcher } from "./cursor-dispatch.js";
import { DispatchService } from "./dispatch.js";
import { executeDeterministicTool } from "./dispatch-tools.js";
import { PlanPolicyError } from "./plan-policy.js";
import { createToolReceipt, type HostedToolType, type ToolReceipt } from "./receipts.js";

export class HostedToolExecutor {
  private readonly cursorTasks: CursorTaskDispatcher;

  constructor(
    private readonly dispatch: DispatchService,
    runner: Pick<CursorRunner, "run">,
    private readonly cursorApiKey?: string,
    private readonly defaultModel?: string,
  ) {
    this.cursorTasks = new CursorTaskDispatcher(dispatch, runner);
  }

  async execute(
    type: HostedToolType,
    args: Record<string, unknown>,
    model = this.defaultModel,
  ): Promise<ToolReceipt> {
    if (type !== "cursor:plan" && type !== "cursor:implement" && type !== "cursor:review") {
      return executeDeterministicTool(this.dispatch, type, args);
    }
    if (!this.cursorApiKey) {
      return createToolReceipt({
        type,
        status: "failed",
        invocation: args,
        result: { error: `CURSOR_API_KEY is not configured for ${type}` },
      });
    }
    if (!model) {
      return createToolReceipt({
        type,
        status: "failed",
        invocation: args,
        result: { error: `A Cursor model is required for ${type}` },
      });
    }

    try {
      if (type === "cursor:plan") {
        const result = await this.cursorTasks.plan({
          apiKey: this.cursorApiKey,
          model,
          taskId: String(args.taskId ?? ""),
          briefPath: String(args.briefPath ?? ""),
        });
        return createToolReceipt({ type, invocation: args, result: { ...result } });
      }
      if (type === "cursor:review") {
        const result = await this.cursorTasks.review({
          apiKey: this.cursorApiKey,
          model,
          taskId: String(args.taskId ?? ""),
        });
        return createToolReceipt({ type, invocation: args, result: { ...result } });
      }
      const result = await this.cursorTasks.implement({
        apiKey: this.cursorApiKey,
        model,
        taskId: String(args.taskId ?? ""),
        planPath: String(args.planPath ?? ""),
      });
      return createToolReceipt({ type, invocation: args, result: { ...result } });
    } catch (error) {
      return createToolReceipt({
        type,
        status: error instanceof PlanPolicyError ? "refused" : "failed",
        invocation: args,
        result: { error: error instanceof Error ? error.message : "Hosted tool failed" },
      });
    }
  }
}
