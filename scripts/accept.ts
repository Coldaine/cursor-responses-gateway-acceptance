import { appendFile } from "node:fs/promises";

const baseUrl = (process.env.APERTURE_BASE_URL ?? process.env.OPENRESPONSES_BASE_URL ?? "http://127.0.0.1:8787/v1").replace(/\/$/, "");
const apiKey = process.env.CURSOR_RESPONSES_API_KEY;
const model = process.env.CURSOR_MODEL;

if (!apiKey || !model) {
  throw new Error("CURSOR_RESPONSES_API_KEY and CURSOR_MODEL must be set");
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

async function hostedReceipt(type: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await request("/responses", {
    model,
    input: `Execute ${type}.`,
    tools: [{ type }],
    tool_choice: { type, arguments: args },
  });
  assertOk(response, type);
  const payload = (await response.json()) as { output?: Array<Record<string, unknown>> };
  const receipt = payload.output?.find((item) => item.type === type);
  if (!receipt) throw new Error(`${type}: receipt item was missing`);
  return receipt;
}

async function hostedTool(type: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const receipt = await hostedReceipt(type, args);
  if (receipt.status !== "completed") throw new Error(`${type}: ${String((receipt.result as { error?: unknown })?.error ?? receipt.status)}`);
  return receipt;
}

const results: AcceptanceResult[] = [];
results.push(
  await run("1. model resolution", async () => {
    const response = await request("/models");
    assertOk(response, "models");
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    if (!payload.data?.some((entry) => entry.id === model)) throw new Error(`model ${model} was not listed`);
  }),
);
results.push(
  await run("2. basic non-streaming response", async () => {
    const response = await request("/responses", { model, input: "Reply with exactly: accepted" });
    assertOk(response, "basic response");
    const payload = (await response.json()) as { status?: string; output?: unknown[] };
    if (payload.status !== "completed" || !payload.output?.length) throw new Error("missing completed output");
  }),
);
results.push(
  await run("3. streaming response", async () => {
    const response = await request("/responses", { model, input: "Reply with exactly: stream", stream: true });
    assertOk(response, "streaming response");
    const payload = await response.text();
    if (!payload.includes("event: response.completed") || !payload.includes("data: [DONE]")) {
      throw new Error("missing terminal Responses SSE events");
    }
  }),
);
results.push(
  await run("4. cursor:explore receipt", async () => {
    await hostedTool("cursor:explore", { query: "Find the response server entry point." });
  }),
);
results.push(
  await run("5. brief, plan, approval, and implement lifecycle", async () => {
    await hostedTool("cursor:write_brief", { taskId: "acceptance-task", content: "Add a small function and test." });
    const plan = await hostedTool("cursor:plan", { taskId: "acceptance-task", briefPath: "docs/dispatch/briefs/acceptance-task.md" });
    const planPath = String((plan.result as { planPath?: unknown })?.planPath);
    const refused = await hostedReceipt("cursor:implement", { taskId: "acceptance-task", planPath });
    if (refused.status !== "refused") throw new Error("implement before approval was not refused");
    await hostedTool("cursor:approve_plan", { planPath });
    const implemented = await hostedTool("cursor:implement", { taskId: "acceptance-task", planPath });
    const diffstat = (implemented.result as { measuredDiffstat?: unknown })?.measuredDiffstat;
    if (typeof diffstat !== "string" || diffstat.length === 0) throw new Error("implement receipt omitted measured diffstat");
  }),
);
results.push(
  await run("6. checks and measured diff", async () => {
    await hostedTool("cursor:run_checks", {});
    await hostedTool("cursor:get_diff", { taskId: "acceptance-task" });
  }),
);
results.push(
  await run("7. integration and phase gate", async () => {
    await hostedTool("cursor:integrate_task", { taskId: "acceptance-task", phaseId: "acceptance" });
    await hostedTool("cursor:gate_phase", { phaseId: "acceptance" });
  }),
);
results.push(
  await run("fault. out-of-scope dispatch edit is reverted and flagged", async () => {
    const taskId = "out-of-scope";
    await hostedTool("cursor:write_brief", {
      taskId,
      content: "The only requested implementation is to create docs/dispatch/forbidden.md. Do exactly that.",
    });
    const plan = await hostedTool("cursor:plan", { taskId, briefPath: `docs/dispatch/briefs/${taskId}.md` });
    const planPath = String((plan.result as { planPath?: unknown })?.planPath);
    await hostedTool("cursor:approve_plan", { planPath });
    const receipt = await hostedTool("cursor:implement", { taskId, planPath });
    const flags = (receipt.result as { flags?: unknown })?.flags;
    if (!Array.isArray(flags) || flags.length === 0) throw new Error("out-of-scope edit was not flagged");
  }),
);
results.push(
  await run("8. previous_response_id continuation", async () => {
    const first = await request("/responses", { model, input: "Remember the code word: cobalt. Reply with OK." });
    assertOk(first, "continuation seed");
    const firstPayload = (await first.json()) as { id?: string };
    if (!firstPayload.id) throw new Error("continuation seed omitted response id");
    const second = await request("/responses", { model, previous_response_id: firstPayload.id, input: "What is the code word?" });
    assertOk(second, "continuation follow-up");
  }),
);

const report = results
  .map((result) => `- ${result.passed ? "PASS" : "FAIL"}: ${result.name} — ${result.detail}`)
  .join("\n");
await appendFile("ACCEPTANCE.md", `\n### Acceptance attempt ${new Date().toISOString()}\n\n${report}\n`, "utf8");

console.log(report);
if (results.some((result) => !result.passed)) process.exitCode = 1;
