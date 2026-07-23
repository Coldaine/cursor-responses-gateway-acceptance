import { createHash, randomUUID } from "node:crypto";

import express, { type Express, type Request, type Response } from "express";
import { ZodError } from "zod";

import { CursorSdkRunner, type CursorRunner } from "./cursor.js";
import {
  createCompactionResource,
  createCompletedResponse,
} from "./openresponses.js";
import { parseResponseRequest, renderInputForCursor } from "./request.js";
import { writeCompletedResponseStream } from "./sse.js";
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

  app.post("/v1/responses", async (request: Request, response: Response) => {
    if (!requestIsAuthenticated(request, options.apiKey)) {
      response.status(401).json(unauthorized());
      return;
    }

    try {
      const input = parseResponseRequest(request.body);
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
      const resource = createCompletedResponse({
        id: `resp_${randomUUID().replaceAll("-", "")}`,
        model: input.model,
        text: output.text,
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
