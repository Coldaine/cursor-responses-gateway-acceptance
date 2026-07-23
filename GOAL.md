# GOAL.md — Cursor as an Open Responses Provider

You are the building agent. Build what this file specifies, in this repository, autonomously. Stop only if genuinely blocked by something this file does not answer. Do not redesign, do not propose alternatives, do not ask the owner to re-explain. Ambiguity goes into PROGRESS.md and you keep going.

## What you are building

An **Open Responses compliant** HTTP server (spec: https://www.openresponses.org, read the specification, the OpenAPI reference, and the acceptance-test pages before coding) whose backing model is **Cursor**, via the official `@cursor/sdk`. It turns a Cursor subscription into a standard, portable agent endpoint that any Open Responses client, gateway, or SDK can call.

This is the Responses API shape, not chat completions: `POST /v1/responses` and `POST /responses/compact`, items as the atomic unit, semantic SSE streaming events, item and response state machines, `previous_response_id` continuation, `allowed_tools` enforced as a hard constraint, spec error types. Do not implement `/v1/chat/completions`.

Why it exists: per Cursor's usage and billing docs, SDK runs share the same pricing and request pools as IDE runs, and a user API key bills to that user's plan. Execution through this server draws the Cursor subscription's included usage.

## Fixed decisions

| Decision | Value |
|---|---|
| Executor | `@cursor/sdk` (npm): `Agent.create({ apiKey, model, local: { cwd } })`, `agent.send(...)`, consume `run.stream()`. Not the `cursor-agent` CLI, not a proxy. Look up current SDK usage and model ids from its docs and types; do not guess API shapes |
| Cursor auth | `CURSOR_API_KEY`, a user key, held only in the server environment |
| Anthropic API | None, anywhere. Zero `ANTHROPIC_API_KEY` code paths |
| Mocks | None. Every acceptance run makes real calls. Use cheap Cursor models |
| Runtime | Node 20+, TypeScript, ESM |
| Server auth | Bearer token or `X-API-KEY`, checked per request |
| Secondary surface | MCP over streamable HTTP at `/mcp`, exposing the same hosted tools |
| Parallelism | Cursor allows one active run per agent (409 `agent_busy`); parallel work means multiple agent instances. `implement` runs are serialized; read-only roles may run in parallel |
| Isolation | One shared working tree per configured repo. No git worktrees |
| Pull requests | No standing PRs, ever. Tasks commit to a phase branch; each phase is gated by one ephemeral PR that triggers CI, blocks until green, auto-merges, and deletes itself. A red gate returns the failing checks and never leaves a PR open |
| WebSocket transport | Stretch goal only, after everything else passes |

## Hosted tools

Coding capabilities are implementor-hosted tools, prefixed `cursor:` per the spec's extension rules. Every hosted tool emits a matching item type as a receipt: `id`, `type`, `status`, how it was invoked, and its result, round-trippable in a follow-up request.

| Tool | Purpose | Writes |
|---|---|---|
| `cursor:explore` | Find code, map a subsystem, answer where-is-X; returns file:line hits | No |
| `cursor:plan` | Turn a brief into a plan; the SERVER writes the plan file, never the agent | Plan file only |
| `cursor:implement` | Execute one approved plan | Repo, serialized |
| `cursor:review` | Judge the diff against plan and brief | No |
| `cursor:write_brief` | Render a brief into the dispatch directory | Brief file only |
| `cursor:approve_plan` | Flip plan front-matter `draft` to `approved`; store sha256 of the plan body | Front-matter only |
| `cursor:run_checks` | Run configured check commands; pass/fail plus output tail per check; never throws on a failing check | No |
| `cursor:get_diff` | `git diff` against the task baseline, output capped | No |
| `cursor:integrate_task` | Commit the task's work onto `phase/<n>`; never touches base | Phase branch |
| `cursor:gate_phase` | Open the ephemeral PR, poll checks, auto-merge and delete on green; on red return failing checks, merge nothing, leave no PR open | Base branch on green |

Enforced by the server, never by prompting:
- `implement` refuses unless the plan front-matter is `approved` and its stored hash matches a fresh hash of the plan body. Distinct errors for missing, unapproved, and tampered.
- After every `implement`, the server measures `git diff` itself. That measurement plus `run_checks` is the source of truth; anything the agent claims is advisory. Claimed-versus-measured mismatches are flagged in the receipt.
- Edits under the dispatch directory are reverted and flagged.
- Every response is size-capped; full transcripts go to disk with the path in the receipt.
- Standard client-supplied `function` tools work normally as externally-hosted tools.

## Definition of done

Everything below is recorded in a file named exactly `ACCEPTANCE.md` at the repo root, with pasted command output as evidence. The build is done when all three sections of that file are filled and green.

### 1. Official compliance suite (external checker, you did not write it)

Clone `github.com/openresponses/openresponses` and run its CLI runner (`bin/compliance-test.ts`), of the form `bun run test:compliance --base-url http://localhost:<port>/v1 --api-key $KEY` (needs bun; check the repo for current flags; note the base URL includes `/v1`; do not use the openresponses.org web page). All 10 core tests pass: basic text response, assistant message phase, response output phase schema, streaming response, system prompt, tool calling, image input, multi-turn conversation, compaction endpoint, compaction missing-required-model. Report the 7 WebSocket tests honestly as pass, fail, or not attempted. Paste the runner output into ACCEPTANCE.md section 1.

### 2. The eight-call acceptance script, green against the server

Build `scripts/accept.ts`. It takes a base URL and API key, executes the eight calls below, and appends results to ACCEPTANCE.md section 2. Run it against this server directly and paste the green run.

| # | Call | Proves |
|---|---|---|
| 1 | Model listing/resolution | The configured Cursor model ids resolve |
| 2 | Basic non-streaming response | Plain round trip; a real Cursor run answers |
| 3 | Streaming response | Spec-correct SSE event sequence, terminal `[DONE]` |
| 4 | `cursor:explore` in a scratch repo | Real file:line hits in the receipt item |
| 5 | Brief, plan, implement-before-approval refused, approve, implement | Full lifecycle; refusal error surfaced; real code written; measured diffstat in the receipt |
| 6 | `run_checks` then `get_diff` | The new test actually passes; the diff shows the real change |
| 7 | `integrate_task` then `gate_phase` | Lands on base via the ephemeral PR; no PR left open |
| 8 | A follow-up with `previous_response_id` | Continuation semantics work |

Plus one fault case, also in section 2: a dispatch instructed to edit out of scope comes back reverted and flagged in the receipt.

### 3. Aperture kit, ready for the owner

Aperture (Tailscale's AI gateway) is the owner's instance on the owner's tailnet; you cannot register providers or authenticate to it unless this build host is itself a tailnet node. Deliver:
- `aperture/provider-entry.md`: the ready-to-paste self-hosted provider configuration for this server, per https://tailscale.com/docs/aperture/how-to/use-self-hosted, with auth injection configured.
- Task zero, recorded in PROGRESS.md and ACCEPTANCE.md section 3: read https://tailscale.com/docs/aperture/provider-compatibility and state whether the self-hosted path proxies the Responses format (`/v1/responses`, SSE, custom item types intact) or assumes chat-completions. If it does not proxy faithfully, state the gap; do not bend the server toward chat-completions.
- `scripts/accept.ts` already takes a base URL, so pointing it at Aperture is a one-variable change. If and only if this host is on the owner's tailnet and the owner has registered the provider, run it through Aperture and paste that run too; otherwise write "awaiting owner: register provider, then run scripts/accept.ts against APERTURE_BASE_URL" in section 3.

## Deliverables

`server/`, `config/` (model routing, check commands), `scripts/accept.ts`, `aperture/provider-entry.md`, `ACCEPTANCE.md`, `README.md` (setup, both surfaces, how to rerun acceptance), `PROGRESS.md`, and `NORTH_STAR.md` as a stub containing only a title and `<!-- OWNER WRITES THIS -->`; never author its contents.

Optional prior art for the SSE translation layer: `teabranch/open-responses-server`. Do not confuse the spec org `openresponses/openresponses` with the unrelated `open-responses/open-responses` project.

---

## The /goal line (owner: paste this after "Read ./GOAL.md and build it.")

/goal ACCEPTANCE.md exists at the repo root with all three sections filled: section 1 shows the official Open Responses CLI compliance runner passing all 10 core tests against this server with WebSocket status reported honestly; section 2 shows scripts/accept.ts green against the server on all eight calls plus the out-of-scope fault case reverted and flagged; section 3 contains the Aperture provider entry, the task-zero compatibility finding, and either a green Aperture-routed run or the explicit awaiting-owner note. No mocks anywhere. Stop and report if blocked, or after 40 turns.
