import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-mcp-"));
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      defaultModel: "cursor-test",
      cwd: repoRoot,
      runner: { async run() { return { text: "# Plan\n\n1. Add it.\n", events: [] }; } },
    } as never);
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
    const sessionId = response.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const body = await response.text();
    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("Expected an MCP SSE data line");
    expect(JSON.parse(dataLine.slice("data: ".length))).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "cursor-responses-gateway" } },
    });

    const toolResponse = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-server-key",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "cursor:write_brief",
          arguments: { taskId: "task-15", content: "Write this through MCP." },
        },
      }),
    });
    expect(toolResponse.status).toBe(200);
    const toolBody = await toolResponse.text();
    const toolData = toolBody.split("\n").find((line) => line.startsWith("data: "));
    if (!toolData) throw new Error("Expected an MCP tool SSE data line");
    const toolPayload = JSON.parse(toolData.slice("data: ".length)) as {
      result: { content: Array<{ text: string }> };
    };
    expect(JSON.parse(toolPayload.result.content[0].text)).toMatchObject({
      type: "cursor:write_brief",
      status: "completed",
    });
    await expect(readFile(join(repoRoot, "docs", "dispatch", "briefs", "task-15.md"), "utf8"))
      .resolves.toBe("Write this through MCP.\n");

    const planResponse = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-server-key",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId ?? "",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "cursor:plan",
          arguments: { taskId: "task-15", briefPath: "docs/dispatch/briefs/task-15.md" },
        },
      }),
    });
    expect(planResponse.status).toBe(200);
    const planBody = await planResponse.text();
    const planData = planBody.split("\n").find((line) => line.startsWith("data: "));
    if (!planData) throw new Error("Expected an MCP plan SSE data line");
    const planPayload = JSON.parse(planData.slice("data: ".length)) as {
      result: { content: Array<{ text: string }> };
    };
    expect(JSON.parse(planPayload.result.content[0].text)).toMatchObject({
      type: "cursor:plan",
      status: "completed",
    });
    await expect(readFile(join(repoRoot, "docs", "dispatch", "plans", "task-15.md"), "utf8"))
      .resolves.toContain("status: draft");
  });
});
