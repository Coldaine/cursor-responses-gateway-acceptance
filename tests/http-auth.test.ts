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

  it("replays prior input then prior output before new input for previous_response_id", async () => {
    const prompts: string[] = [];
    const outputs = ["OK.", "cobalt"];
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: process.cwd(),
      runner: {
        async run(options: { prompt: string }) {
          prompts.push(options.prompt);
          return { text: outputs.shift() ?? "", events: [] };
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
    const url = `http://127.0.0.1:${address.port}/v1/responses`;
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer test-server-key",
    };

    const first = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "cursor-test",
        input: "Remember the code word: cobalt.",
      }),
    });
    const firstBody = (await first.json()) as { id: string };
    expect(first.status).toBe(200);

    const second = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "cursor-test",
        previous_response_id: firstBody.id,
        input: "What is the code word?",
      }),
    });
    expect(second.status).toBe(200);
    expect(prompts[1]).toBe(
      "[user]\nRemember the code word: cobalt.\n\n[assistant]\nOK.\n\n[user]\nWhat is the code word?",
    );
  });

  it("lists models available from the configured Cursor account", async () => {
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      runner: {
        async listModels() {
          return [{ id: "cursor-test", displayName: "Cursor Test" }];
        },
        async run() {
          return { text: "unused", events: [] };
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

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models`, {
      headers: { authorization: "Bearer test-server-key" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [{ id: "cursor-test", object: "model", owned_by: "cursor" }],
    });
  });

  it("returns an externally hosted function_call item when a client supplies a function tool", async () => {
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: process.cwd(),
      runner: { async run() { return { text: "unused", events: [] }; } },
    } as never);
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a TCP listener");

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-server-key" },
      body: JSON.stringify({
        model: "cursor-test",
        input: "Check the weather.",
        tools: [{ type: "function", name: "get_weather", parameters: { type: "object" } }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      output: [{ type: "function_call", name: "get_weather", arguments: "{}", status: "completed" }],
    });
  });
});
