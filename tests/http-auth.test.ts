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

describe("server authentication", () => {
  it("rejects a response request that has no configured API credential", async () => {
    const app = createApp({ apiKey: "test-server-key" });
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "cursor-test", input: "hello" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        type: "invalid_request",
        message: "Missing or invalid API credential",
      },
    });
  });

  it("turns an authenticated Cursor result into an Open Responses resource", async () => {
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: process.cwd(),
      runner: {
        async run() {
          return { text: "Cursor says hello", events: [] };
        },
      },
    } as never);
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-server-key",
      },
      body: JSON.stringify({
        model: "cursor-test",
        input: [{ type: "message", role: "user", content: "Say hello." }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: "response",
      status: "completed",
      model: "cursor-test",
      output: [
        {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [{ type: "output_text", text: "Cursor says hello" }],
        },
      ],
    });
  });

  it("emits semantic SSE events and a terminal DONE marker when stream is true", async () => {
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: process.cwd(),
      runner: {
        async run() {
          return { text: "streamed answer", events: [] };
        },
      },
    } as never);
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-server-key",
      },
      body: JSON.stringify({
        model: "cursor-test",
        input: "Hello",
        stream: true,
      }),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: response.output_text.delta");
    expect(body).toContain("event: response.completed");
    expect(body.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("returns a compaction resource and rejects compaction requests without a model", async () => {
    const app = createApp({ apiKey: "test-server-key" });
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }
    const url = `http://127.0.0.1:${address.port}/v1/responses/compact`;
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer test-server-key",
    };

    const missingModel = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: "compress this" }),
    });
    expect(missingModel.status).toBe(400);

    const compacted = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "cursor-test", input: "compress this" }),
    });
    expect(compacted.status).toBe(200);
    await expect(compacted.json()).resolves.toMatchObject({
      object: "response.compaction",
      output: [{ type: "compaction" }],
    });
  });
});
