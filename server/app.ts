import express, { type Express, type Request, type Response } from "express";

export interface AppOptions {
  apiKey: string;
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
  app.use(express.json({ limit: "10mb" }));

  app.post("/v1/responses", (request: Request, response: Response) => {
    if (!requestIsAuthenticated(request, options.apiKey)) {
      response.status(401).json(unauthorized());
      return;
    }

    response.status(501).json({
      error: {
        type: "server_error",
        message: "Response execution is not configured",
      },
    });
  });

  return app;
}
