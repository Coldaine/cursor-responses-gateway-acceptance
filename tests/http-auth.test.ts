import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("refuses a function call outside tool_choice.allowed_tools", async () => {
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
        tools: [{ type: "function", name: "get_weather" }],
        tool_choice: { type: "allowed_tools", tools: [{ type: "function", name: "other_tool" }], mode: "required" },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "invalid_request", message: expect.stringContaining("allowed_tools") },
    });
  });

  it("executes a provider-hosted brief tool and returns its receipt item", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-hosted-http-"));
    const app = createApp({ apiKey: "test-server-key", cwd: repoRoot });
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
        input: "Store the brief.",
        tools: [{ type: "cursor:write_brief" }],
        tool_choice: {
          type: "cursor:write_brief",
          arguments: { taskId: "task-14", content: "Add a diagnostic endpoint." },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      output: [{ type: "cursor:write_brief", status: "completed" }],
    });
    await expect(readFile(join(repoRoot, "docs", "dispatch", "briefs", "task-14.md"), "utf8"))
      .resolves.toBe("Add a diagnostic endpoint.\n");
  });

  it("uses Cursor output for a server-written hosted draft plan", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-plan-http-"));
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: repoRoot,
      runner: { async run() { return { text: "# Plan\n\n1. Add it.\n", events: [] }; } },
    } as never);
    const server = app.listen(0);
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a TCP listener");
    const url = `http://127.0.0.1:${address.port}/v1/responses`;
    const headers = { "content-type": "application/json", authorization: "Bearer test-server-key" };

    const brief = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ model: "cursor-test", input: "Store a brief.", tools: [{ type: "cursor:write_brief" }], tool_choice: { type: "cursor:write_brief", arguments: { taskId: "task-18", content: "Add it." } } }),
    });
    expect(brief.status).toBe(200);
    const plan = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ model: "cursor-test", input: "Plan it.", tools: [{ type: "cursor:plan" }], tool_choice: { type: "cursor:plan", arguments: { taskId: "task-18", briefPath: join(repoRoot, "docs", "dispatch", "briefs", "task-18.md") } } }),
    });
    expect(plan.status).toBe(200);
    await expect(plan.json()).resolves.toMatchObject({ output: [{ type: "cursor:plan", status: "completed" }] });
    await expect(readFile(join(repoRoot, "docs", "dispatch", "plans", "task-18.md"), "utf8")).resolves.toContain("status: draft");
  });

  it("returns a refused receipt when cursor:implement receives an unapproved plan", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cursor-implement-http-"));
    const draftPath = join(repoRoot, "docs", "dispatch", "plans", "task-21.md");
    await mkdir(join(repoRoot, "docs", "dispatch", "plans"), { recursive: true });
    await writeFile(draftPath, "---\nstatus: draft\n---\n\n# Plan\n", "utf8");
    const app = createApp({
      apiKey: "test-server-key",
      cursorApiKey: "cursor-key",
      cwd: repoRoot,
      runner: { async run() { throw new Error("Cursor must not run"); } },
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
        input: "Implement it.",
        tools: [{ type: "cursor:implement" }],
        tool_choice: { type: "cursor:implement", arguments: { taskId: "task-21", planPath: draftPath } },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      output: [{ type: "cursor:implement", status: "refused", result: { error: "Plan is not approved" } }],
    });
  });
});
