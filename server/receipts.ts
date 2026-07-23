import { randomUUID } from "node:crypto";

export type HostedToolType =
  | "cursor:explore"
  | "cursor:plan"
  | "cursor:implement"
  | "cursor:review"
  | "cursor:write_brief"
  | "cursor:approve_plan"
  | "cursor:run_checks"
  | "cursor:get_diff"
  | "cursor:integrate_task"
  | "cursor:gate_phase";

export interface ToolReceipt {
  id: string;
  type: HostedToolType;
  status: "completed" | "failed" | "refused";
  invocation: Record<string, unknown>;
  result: Record<string, unknown>;
}

export function createToolReceipt(options: {
  type: HostedToolType;
  invocation: Record<string, unknown>;
  result: Record<string, unknown>;
  status?: ToolReceipt["status"];
}): ToolReceipt {
  return {
    id: `cursor_item_${randomUUID().replaceAll("-", "")}`,
    type: options.type,
    status: options.status ?? "completed",
    invocation: options.invocation,
    result: options.result,
  };
}
