import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { DispatchService } from "./dispatch.js";
import { executeDeterministicTool } from "./dispatch-tools.js";
import type { HostedToolType } from "./receipts.js";

const hostedTools: Array<{
  name: HostedToolType;
  description: string;
  inputSchema: Record<string, z.ZodType>;
}> = [
  {
    name: "cursor:explore",
    description: "Find code and return repository file:line hits.",
    inputSchema: { query: z.string(), paths: z.array(z.string()).optional() },
  },
  {
    name: "cursor:plan",
    description: "Write a draft implementation plan from a stored brief.",
    inputSchema: { taskId: z.string(), briefPath: z.string() },
  },
  {
    name: "cursor:implement",
    description: "Execute an approved, hash-verified implementation plan.",
    inputSchema: { taskId: z.string(), planPath: z.string() },
  },
  {
    name: "cursor:review",
    description: "Review a task diff against its plan and brief.",
    inputSchema: { taskId: z.string() },
  },
  {
    name: "cursor:write_brief",
    description: "Write a task brief into the dispatch directory.",
    inputSchema: { taskId: z.string(), content: z.string() },
  },
  {
    name: "cursor:approve_plan",
    description: "Approve a draft plan and bind its SHA-256 body hash.",
    inputSchema: { planPath: z.string() },
  },
  {
    name: "cursor:run_checks",
    description: "Run configured repository checks.",
    inputSchema: { suite: z.string().optional() },
  },
  {
    name: "cursor:get_diff",
    description: "Read the measured git diff for a task.",
    inputSchema: { taskId: z.string(), mode: z.string().optional() },
  },
  {
    name: "cursor:integrate_task",
    description: "Commit a task onto its phase branch.",
    inputSchema: { taskId: z.string(), phaseId: z.string() },
  },
  {
    name: "cursor:gate_phase",
    description: "Create, check, merge, and delete an ephemeral phase PR.",
    inputSchema: { phaseId: z.string() },
  },
];

function buildMcpServer(dispatch: DispatchService): McpServer {
  const server = new McpServer({
    name: "cursor-openresponses-provider",
    version: "0.1.0",
  });

  for (const tool of hostedTools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
      const receipt = await executeDeterministicTool(dispatch, tool.name, args);
      return {
        content: [{ type: "text", text: JSON.stringify(receipt) }],
        isError: receipt.status !== "completed",
      };
    });
  }
  return server;
}

export async function handleMcpRequest(
  request: Request,
  response: Response,
  repoRoot: string,
): Promise<void> {
  const server = buildMcpServer(new DispatchService(repoRoot));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } finally {
    await transport.close();
    await server.close();
  }
}
