import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../server/app.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

describe("MCP streamable HTTP surface", () => {
  it("accepts an authenticated initialize request at /mcp", async () => {
    const app = createApp({ apiKey: "test-server-key" });
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-server-key",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("Expected an MCP SSE data line");
    expect(JSON.parse(dataLine.slice("data: ".length))).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "cursor-openresponses-provider" } },
    });
  });
});
