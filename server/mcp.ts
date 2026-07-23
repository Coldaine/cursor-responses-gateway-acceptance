import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { DispatchService } from "./dispatch.js";
import { HostedToolExecutor } from "./hosted-tool-executor.js";
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

function buildMcpServer(executor: Pick<HostedToolExecutor, "execute">): McpServer {
  const server = new McpServer({
    name: "cursor-responses-gateway",
    version: "0.1.0",
  });

  for (const tool of hostedTools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
      const receipt = await executor.execute(tool.name, args);
      return {
        content: [{ type: "text", text: JSON.stringify(receipt) }],
        isError: receipt.status !== "completed",
      };
    });
  }
  return server;
}

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

export class McpSessionManager {
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    private readonly repoRoot: string,
    private readonly executor?: Pick<HostedToolExecutor, "execute">,
  ) {}

  async handle(request: Request, response: Response): Promise<void> {
    const sessionId = request.get("mcp-session-id");
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        response.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unknown MCP session" },
          id: null,
        });
        return;
      }
      await session.transport.handleRequest(request, response, request.body);
      return;
    }

    const executor = this.executor ?? new HostedToolExecutor(
      new DispatchService(this.repoRoot),
      { async run() { throw new Error("Cursor-backed MCP tools are not configured"); } },
    );
    const server = buildMcpServer(executor);
    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        this.sessions.set(newSessionId, { server, transport });
      },
    });
    transport.onclose = () => {
      const closedSessionId = transport.sessionId;
      if (closedSessionId) this.sessions.delete(closedSessionId);
      void server.close();
    };
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }
}
