# Build: Cursor as an Open Responses Provider

Build this. Work autonomously. Stop only if genuinely blocked by something this document does not answer.

## What it is

An **Open Responses compliant** HTTP server (https://www.openresponses.org) whose backing model is Cursor, via `@cursor/sdk`. It turns a Cursor subscription into a standard, portable agent endpoint that any Open Responses client can call: AnythingLLM, the Vercel AI SDK, OpenRouter, LM Studio, Ollama, curl, or your own orchestrator.

This is **not** an OpenAI chat-completions endpoint. Open Responses is the Responses API shape: items as the atomic unit, semantic streaming events, state machines, and an agentic tool loop. Read the spec and the OpenAPI reference before writing code; do not guess the schema.

Per Cursor's usage and billing docs, SDK runs follow the same pricing and request pools as IDE runs, and a user API key bills to that user's plan. Execution therefore draws the Cursor subscription's included usage.

## Core surface

`POST /v1/responses` is the product. Also implement `/responses/compact` (the acceptance suite tests it, including the missing-model rejection case).

Requests carry `model`, `input` (items), `tools`, `tool_choice`, `stream`, `store`, `previous_response_id`. Responses are `ResponseResource` objects, or SSE when streaming with `Content-Type: text/event-stream` and a terminal `[DONE]`.

Mapping to Cursor:

| Open Responses concept | Cursor implementation |
|---|---|
| `model` | A Cursor model id; expose the available ones and route per request |
| A response run | `Agent.create({ apiKey, model, local: { cwd } })` then `agent.send(...)`, consuming `run.stream()` |
| Streaming events | Translate Cursor's stream into spec events: `response.created`, `response.in_progress`, `response.output_item.added`, `response.content_part.added`, `response.output_text.delta`, the matching `.done` events, then `response.completed` |
| `previous_response_id` | Cursor session continuation; preserve the ordering `previous.input` then `previous.output` then new `input` |
| Reasoning | A `reasoning` item; use `summary` or `encrypted_content` rather than leaking raw traces |
| Errors | Spec error types: `invalid_request` 400, `not_found` 404, `model_error` 500, `server_error` 500, `too_many_requests` 429. Streaming errors are followed by `response.failed` |

## Coding capabilities as internally-hosted tools

The repo-aware work is exposed as implementor-hosted tools, prefixed with the `cursor` slug per the extension rules. The server executes them and returns results without yielding control to the client.

| Tool | Purpose | Writes |
|---|---|---|
| `cursor:explore` | Find code, map a subsystem, answer where-is-X | No |
| `cursor:plan` | Turn a brief into a plan; the server writes the plan file, never the agent | Plan file only |
| `cursor:implement` | Execute one approved plan | Repo, serialized |
| `cursor:review` | Judge a diff against plan and brief | No |
| `cursor:run_checks`, `cursor:get_diff`, `cursor:integrate_task`, `cursor:gate_phase` | Deterministic repo operations, no model involved | Per operation |

Per the spec, **every hosted tool MUST emit a corresponding item type as a receipt**, carrying `id`, `type`, `status`, how the tool was invoked, and its result, with enough detail to round-trip back into a follow-up request. For example a `cursor:implement` item carries the plan reference, the measured diffstat, and any flags.

Enforced by the server, not by prompting: `implement` refuses unless the plan's front-matter is `approved` and its stored hash matches a fresh hash of the plan body. After every implement the server measures `git diff` itself; that measurement plus `run_checks` is the source of truth, and anything the agent claims is advisory. Edits under the dispatch directory are reverted and flagged in the item receipt. Standard `function` tools from the client are supported normally as externally-hosted tools, and `allowed_tools` is enforced as a hard constraint.

## Fixed decisions

| Decision | Value |
|---|---|
| Executor | `@cursor/sdk`. Not the CLI, not a reverse-engineered proxy |
| Cursor auth | `CURSOR_API_KEY`, a user API key, held only in the server environment |
| Anthropic API | None. Zero `ANTHROPIC_API_KEY` code paths |
| Mocks | None. Every acceptance run hits real Cursor |
| Runtime | Node 20+, TypeScript, ESM |
| Chat completions | Do not implement `/v1/chat/completions`. This is a Responses-shaped server |
| Secondary surface | Also expose MCP over streamable HTTP at `/mcp` exposing the same hosted tools, so MCP-only clients can reach it |
| Isolation | One shared working tree per configured repo; implement runs serialized, read-only roles may run in parallel |
| Pull requests | No standing PRs. Tasks commit to a phase branch; one ephemeral PR per phase gates on CI, auto-merges, deletes itself |
| WebSocket transport | Optional. Attempt it only after everything else passes |

## Success condition

Two parts, both required. Neither is a test the builder wrote.

**Part one: the official Open Responses acceptance suite, run from the CLI.** Clone `github.com/openresponses/openresponses` and use its CLI runner (`bin/compliance-test.ts`), not the web page. Invocation is of the form `bun run test:compliance --base-url http://<host>/v1 --api-key $KEY`, with `--filter` to select tests; check the repo for the current flags. Requires bun.

Pass the 10 core tests: basic text response, assistant message phase, response output phase schema, streaming response, system prompt, tool calling, image input, multi-turn conversation, compaction endpoint, and compaction missing-required-model. The 7 WebSocket tests are a stretch goal; report their status honestly rather than skipping silently. Paste the runner's output into `ACCEPTANCE.md`.

Note the base URL includes `/v1`. If you also want the browser tester at openresponses.org/compliance to work against a local server, the server must answer CORS preflight and send permissive CORS headers, since those requests originate from a page on another origin. That is optional; the CLI runner is the requirement.

**Part two: a set of real calls routed through Aperture.** Aperture (aperture.tailscale.com, Tailscale's AI gateway, beta) is the independent witness. It is the OWNER'S instance, configured against the owner's tailnet: callers authenticate by tailnet identity, not keys, and provider registration is an owner admin action. The builder therefore cannot perform this part alone. The split:

Builder prepares, without needing tailnet access:
- The provider configuration entry for this server, ready to paste, per https://tailscale.com/docs/aperture/how-to/use-self-hosted, with the server's bearer token in the entry so Aperture injects auth.
- `scripts/aperture-accept.ts`: a runnable script taking `APERTURE_BASE_URL` (and model id) that executes the eight calls below against Aperture and writes results to `ACCEPTANCE.md`.
- Task zero, recorded in PROGRESS.md: read https://tailscale.com/docs/aperture/provider-compatibility and confirm whether the self-hosted provider path proxies the Responses format (`/v1/responses`, SSE, custom item types intact) or assumes chat-completions. If not proxied faithfully, note the gap honestly; do not bend the server toward chat-completions.

Owner performs, once:
- Register the provider entry in Aperture.
- Run `scripts/aperture-accept.ts` from any tailnet device, or authorize the builder to run it if the build host is itself a tailnet node, in which case the builder runs it and this part is fully autonomous.

The eight calls, client pointed at Aperture, never at the server directly:

| # | Call through Aperture | Proves |
|---|---|---|
| 1 | Model resolution: the cursor provider's model id resolves and routes | Registration and routing work |
| 2 | Basic non-streaming response | Plain round trip through the gateway |
| 3 | Streaming response | The gateway carries SSE events without mangling them |
| 4 | `cursor:explore` | Hosted tool executes; the receipt item survives the proxy with real file:line hits |
| 5 | Brief, plan, implement-before-approval refused, approve, implement | The full lifecycle through the gateway; measured diffstat in the receipt |
| 6 | `run_checks`, `get_diff`, integrate, gate the phase | Real checks, real diff, lands on base, no PR left open |
| 7 | Out-of-scope edit | Reverted and flagged; the flag visible in the receipt as returned through Aperture |
| 8 | A follow-up using `previous_response_id` | Continuation semantics survive the gateway |

Evidence for every row: the client-side result AND the corresponding Aperture session log entry (dashboard or export) showing caller identity, provider, and model. Paste both into `ACCEPTANCE.md`. Optional but valuable: set a small spend quota on the provider in Aperture and show a call being refused when it is exceeded, which proves the endpoint is metered like any other provider.

AnythingLLM is no longer part of acceptance; it remains a client this server should work with later, via either surface.

## Deliverables

`server/` (Responses implementation, event translation, hosted tools, SDK integration, git operations, MCP surface), `config/` (model routing, `checks.yaml`), `aperture/` (this server's provider configuration entry plus setup notes, per the self-hosted provider guide), `ACCEPTANCE.md` (both parts, with Aperture session-log evidence), `README.md`, `PROGRESS.md`.

Read the Open Responses specification, OpenAPI reference, and acceptance-test pages, plus current `@cursor/sdk` docs and types, before coding. Optional prior art worth a look before writing the SSE event translation layer: `teabranch/open-responses-server` wraps other backends as Responses and shows one working event-emission sequence. Do not confuse the spec org `openresponses/openresponses` with the unrelated `open-responses/open-responses` project. Use cheap Cursor models for acceptance runs. `NORTH_STAR.md` is created as a stub only; do not author its contents.
