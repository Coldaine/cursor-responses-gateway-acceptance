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

export interface AppOptions {
  apiKey: string;
  cursorApiKey?: string;
  cwd?: string;
  runner?: CursorRunner;
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
  app.use(express.json({ limit: "10mb" }));

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

      const prompt = [
        input.instructions ? `[instructions]\n${input.instructions}` : null,
        renderInputForCursor(input.input),
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

      if (input.stream) {
        writeCompletedResponseStream(response, resource);
        return;
      }

      response.json(resource);
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
