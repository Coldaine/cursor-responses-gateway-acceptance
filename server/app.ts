import { createHash, randomUUID } from "node:crypto";

import express, { type Express, type Request, type Response } from "express";
import { ZodError } from "zod";

import { CursorSdkRunner, type CursorRunner } from "./cursor.js";
import { DispatchService } from "./dispatch.js";
import { HostedToolExecutor } from "./hosted-tool-executor.js";
import {
  createCompactionResource,
  createCompletedResponse,
  createFunctionCallResponse,
  createHostedToolResponse,
} from "./openresponses.js";
import { type HostedToolType } from "./receipts.js";
import { parseResponseRequest, renderInputForCursor } from "./request.js";
import { writeCompletedResponseStream } from "./sse.js";
import { McpSessionManager } from "./mcp.js";
import {
  InMemoryResponseStore,
  PreviousResponseNotFoundError,
} from "./state.js";

export interface AppOptions {
  apiKey: string;
  cursorApiKey?: string;
  cwd?: string;
  runner?: CursorRunner;
  responseStore?: InMemoryResponseStore;
  defaultModel?: string;
}

interface ErrorPayload {
  error: {
    type: "invalid_request";
    message: string;
  };
}

const unauthorized = (): ErrorPayload => ({
  error: {
    type: "invalid_request",
    message: "Missing or invalid API credential",
  },
});

class InvalidRequestError extends Error {}

const MAX_RESPONSE_TEXT_CHARS = 32_000;

function capResponseText(text: string): string {
  return text.length <= MAX_RESPONSE_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_RESPONSE_TEXT_CHARS)}\n\n[truncated by cursor-openresponses-provider]`;
}

function selectFunctionTool(
  tools: unknown[],
  toolChoice: unknown,
): Record<string, unknown> | undefined {
  const functions = tools.filter((tool): tool is Record<string, unknown> => {
    if (!tool || typeof tool !== "object") return false;
    const candidate = tool as Record<string, unknown>;
    return candidate.type === "function" && typeof candidate.name === "string";
  });

  if (!toolChoice || typeof toolChoice !== "object") return functions[0];
  const choice = toolChoice as Record<string, unknown>;
  if (choice.type !== "allowed_tools") return functions[0];
  if (!Array.isArray(choice.tools)) {
    throw new InvalidRequestError("tool_choice.allowed_tools requires a tools array");
  }

  const allowedNames = new Set(
    choice.tools.flatMap((tool) => {
      if (!tool || typeof tool !== "object") return [];
      const candidate = tool as Record<string, unknown>;
      return candidate.type === "function" && typeof candidate.name === "string"
        ? [candidate.name]
        : [];
    }),
  );
  const selected = functions.find((tool) => allowedNames.has(tool.name as string));
  if (!selected && functions.length > 0) {
    throw new InvalidRequestError("No supplied function tool is permitted by tool_choice.allowed_tools");
  }
  return selected;
}

const hostedToolTypes = new Set<HostedToolType>([
  "cursor:explore", "cursor:plan", "cursor:implement", "cursor:review",
  "cursor:write_brief", "cursor:approve_plan", "cursor:run_checks", "cursor:get_diff",
  "cursor:integrate_task", "cursor:gate_phase",
]);

function selectHostedTool(toolChoice: unknown): { type: HostedToolType; args: Record<string, unknown> } | null {
  if (!toolChoice || typeof toolChoice !== "object") return null;
  const choice = toolChoice as Record<string, unknown>;
  if (typeof choice.type !== "string" || !hostedToolTypes.has(choice.type as HostedToolType)) return null;
  if (!choice.arguments || typeof choice.arguments !== "object" || Array.isArray(choice.arguments)) {
    throw new InvalidRequestError("Hosted tool choice requires an arguments object");
  }
  return { type: choice.type as HostedToolType, args: choice.arguments as Record<string, unknown> };
}

function requestIsAuthenticated(request: Request, apiKey: string): boolean {
  const authorization = request.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const xApiKey = request.get("x-api-key");
  return bearerToken === apiKey || xApiKey === apiKey;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  const runner = options.runner ?? new CursorSdkRunner();
  const responseStore = options.responseStore ?? new InMemoryResponseStore();
  const dispatch = new DispatchService(options.cwd ?? process.cwd());
  const hostedTools = new HostedToolExecutor(
    dispatch,
    runner,
    options.cursorApiKey ?? process.env.CURSOR_API_KEY,
    options.defaultModel,
  );
  const mcpSessions = new McpSessionManager(options.cwd ?? process.cwd(), hostedTools);
  app.use(express.json({ limit: "10mb" }));

  app.get("/v1/models", async (request: Request, response: Response) => {
    if (!requestIsAuthenticated(request, options.apiKey)) {
      response.status(401).json(unauthorized());
      return;
    }

    const cursorApiKey = options.cursorApiKey ?? process.env.CURSOR_API_KEY;
    if (!cursorApiKey) {
      response.status(500).json({
        error: {
          type: "server_error",
          message: "CURSOR_API_KEY is not configured",
        },
      });
      return;
    }

    try {
      const models = await runner.listModels(cursorApiKey);
      response.json({
        object: "list",
        data: models.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "cursor",
        })),
      });
    } catch (error) {
      response.status(500).json({
        error: {
          type: "server_error",
          message: error instanceof Error ? error.message : "Model discovery failed",
        },
      });
    }
  });

  app.post("/mcp", async (request: Request, response: Response) => {
    if (!requestIsAuthenticated(request, options.apiKey)) {
      response.status(401).json(unauthorized());
      return;
    }
    await mcpSessions.handle(request, response);
  });

  app.post("/v1/responses", async (request: Request, response: Response) => {
    if (!requestIsAuthenticated(request, options.apiKey)) {
      response.status(401).json(unauthorized());
      return;
    }

    try {
      const input = parseResponseRequest(request.body);
      const hostedTool = selectHostedTool(input.tool_choice);
      const functionTool = selectFunctionTool(input.tools, input.tool_choice);
      if (hostedTool) {
        const declared = input.tools.some(
          (tool) => tool && typeof tool === "object" && (tool as Record<string, unknown>).type === hostedTool.type,
        );
        if (!declared) throw new InvalidRequestError(`Hosted tool ${hostedTool.type} was not supplied`);
        const receipt = await hostedTools.execute(hostedTool.type, hostedTool.args, input.model);
        const resource = createHostedToolResponse({
          id: `resp_${randomUUID().replaceAll("-", "")}`,
          model: input.model,
          receipt: {
            id: receipt.id,
            type: receipt.type,
            status: receipt.status,
            invocation: receipt.invocation,
            result: receipt.result,
          },
          createdAt: Math.floor(Date.now() / 1000),
          previousResponseId: input.previous_response_id,
          store: input.store,
        });
        response.json(resource);
        return;
      }
      const cursorApiKey = options.cursorApiKey ?? process.env.CURSOR_API_KEY;
      if (!cursorApiKey) {
        response.status(500).json({
          error: {
            type: "server_error",
            message: "CURSOR_API_KEY is not configured",
          },
        });
        return;
      }

      const currentInput = renderInputForCursor(input.input);
      const previous = input.previous_response_id
        ? responseStore.get(input.previous_response_id)
        : null;
      const prompt = [
        input.instructions ? `[instructions]\n${input.instructions}` : null,
        previous?.inputText ?? null,
        previous ? `[assistant]\n${previous.outputText}` : null,
        currentInput,
      ]
        .filter((part): part is string => part !== null)
        .join("\n\n");
      const output = await runner.run({
        apiKey: cursorApiKey,
        model: input.model,
        cwd: options.cwd ?? process.cwd(),
        prompt,
      });
      const responseId = `resp_${randomUUID().replaceAll("-", "")}`;
      const responseText = capResponseText(output.text);
      await dispatch.writeResponseTranscript(responseId, output.text);
      const resource = functionTool
        ? createFunctionCallResponse({
            id: responseId,
            model: input.model,
            functionName: functionTool.name as string,
            createdAt: Math.floor(Date.now() / 1000),
            previousResponseId: input.previous_response_id,
            store: input.store,
          })
        : createCompletedResponse({
        id: responseId,
        model: input.model,
        text: responseText,
        createdAt: Math.floor(Date.now() / 1000),
        previousResponseId: input.previous_response_id,
        store: input.store,
      });
      if (input.store) {
        responseStore.put(resource.id, {
          inputText: [previous?.inputText ?? null, currentInput]
            .filter((part): part is string => part !== null)
            .join("\n\n"),
          outputText: output.text,
        });
      }

      if (input.stream) {
        writeCompletedResponseStream(response, resource);
        return;
      }

      response.json(resource);
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        response.status(400).json({
          error: { type: "invalid_request", message: error.message },
        });
        return;
      }
      if (error instanceof PreviousResponseNotFoundError) {
        response.status(404).json({
          error: {
            type: "not_found",
            message: error.message,
          },
        });
        return;
      }
      if (error instanceof ZodError) {
        response.status(400).json({
          error: {
            type: "invalid_request",
            message: error.issues.map((issue) => issue.message).join("; "),
          },
        });
        return;
      }

      response.status(500).json({
        error: {
          type: "server_error",
          message: error instanceof Error ? error.message : "Response execution failed",
        },
      });
    }
  });

  app.post(
    "/v1/responses/compact",
    (request: Request, response: Response) => {
      if (!requestIsAuthenticated(request, options.apiKey)) {
        response.status(401).json(unauthorized());
        return;
      }

      try {
        const input = parseResponseRequest(request.body);
        const compacted = createCompactionResource({
          id: `resp_${randomUUID().replaceAll("-", "")}`,
          createdAt: Math.floor(Date.now() / 1000),
          opaqueContent: `sha256:${createHash("sha256")
            .update(renderInputForCursor(input.input))
            .digest("base64url")}`,
        });
        response.json(compacted);
      } catch (error) {
        if (error instanceof ZodError) {
          response.status(400).json({
            error: {
              type: "invalid_request",
              message: error.issues.map((issue) => issue.message).join("; "),
            },
          });
          return;
        }

        response.status(500).json({
          error: {
            type: "server_error",
            message: "Compaction failed",
          },
        });
      }
    },
  );

  return app;
}
