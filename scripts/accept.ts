import { appendFile } from "node:fs/promises";

const baseUrl = (process.env.APERTURE_BASE_URL ?? process.env.OPENRESPONSES_BASE_URL ?? "http://127.0.0.1:8787/v1").replace(/\/$/, "");
const apiKey = process.env.OPENRESPONSES_API_KEY;
const model = process.env.CURSOR_MODEL;

if (!apiKey || !model) {
  throw new Error("OPENRESPONSES_API_KEY and CURSOR_MODEL must be set");
}

interface AcceptanceResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function request(path: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function run(name: string, action: () => Promise<void>): Promise<AcceptanceResult> {
  try {
    await action();
    return { name, passed: true, detail: "passed" };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function assertOk(response: Response, name: string): void {
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
}

const results = await Promise.all([
  run("1. model resolution", async () => {
    const response = await request("/models");
    assertOk(response, "models");
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    if (!payload.data?.some((entry) => entry.id === model)) throw new Error(`model ${model} was not listed`);
  }),
  run("2. basic non-streaming response", async () => {
    const response = await request("/responses", { model, input: "Reply with exactly: accepted" });
    assertOk(response, "basic response");
    const payload = (await response.json()) as { status?: string; output?: unknown[] };
    if (payload.status !== "completed" || !payload.output?.length) throw new Error("missing completed output");
  }),
  run("3. streaming response", async () => {
    const response = await request("/responses", { model, input: "Reply with exactly: stream", stream: true });
    assertOk(response, "streaming response");
    const payload = await response.text();
    if (!payload.includes("event: response.completed") || !payload.includes("data: [DONE]")) {
      throw new Error("missing terminal Responses SSE events");
    }
  }),
  run("4. cursor:explore receipt", async () => {
    const response = await request("/responses", {
      model,
      input: "Use cursor:explore to find the response server entry point.",
      tools: [{ type: "cursor:explore" }],
      tool_choice: { type: "cursor:explore" },
    });
    assertOk(response, "cursor:explore");
  }),
]);

const report = results
  .map((result) => `- ${result.passed ? "PASS" : "FAIL"}: ${result.name} — ${result.detail}`)
  .join("\n");
await appendFile("ACCEPTANCE.md", `\n### Acceptance attempt ${new Date().toISOString()}\n\n${report}\n`, "utf8");

console.log(report);
if (results.some((result) => !result.passed)) process.exitCode = 1;
