import { DispatchService } from "./dispatch.js";
import { createToolReceipt, type HostedToolType, type ToolReceipt } from "./receipts.js";

function stringArgument(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

export async function executeDeterministicTool(
  dispatch: DispatchService,
  type: HostedToolType,
  args: Record<string, unknown>,
): Promise<ToolReceipt> {
  try {
    switch (type) {
      case "cursor:write_brief": {
        const briefPath = await dispatch.writeBrief(
          stringArgument(args, "taskId"),
          stringArgument(args, "content"),
        );
        return createToolReceipt({ type, invocation: args, result: { briefPath } });
      }
      case "cursor:approve_plan": {
        const plan = await dispatch.approvePlan(stringArgument(args, "planPath"));
        return createToolReceipt({
          type,
          invocation: args,
          result: { planPath: plan.path, bodyHash: plan.bodyHash },
        });
      }
      case "cursor:run_checks": {
        const suite = args.suite;
        if (suite !== undefined && typeof suite !== "string") {
          throw new Error("suite must be a string when provided");
        }
        const checks = await dispatch.runChecks(suite);
        return createToolReceipt({ type, invocation: args, result: { checks } });
      }
      default:
        return createToolReceipt({
          type,
          status: "failed",
          invocation: args,
          result: { error: "Hosted tool dispatch is not configured yet" },
        });
    }
  } catch (error) {
    return createToolReceipt({
      type,
      status: "failed",
      invocation: args,
      result: { error: error instanceof Error ? error.message : "Hosted tool failed" },
    });
  }
}
