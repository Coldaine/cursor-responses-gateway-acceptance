# Progress

## Current phase: live acceptance and external gates

- [x] Read `GOAL.md` and preserved the supplied build documents.
- [x] Initialized the repository without altering the supplied documents.
- [x] Read the current Open Responses reference repository, OpenAPI contract, and CLI compliance runner.
- [x] Verified the runner uses a base URL ending in `/v1`, then calls `/responses` and `/responses/compact`; the server must therefore expose `/v1/responses` and `/v1/responses/compact`.
- [x] Verified the official `@cursor/sdk` lifecycle and model discovery APIs.
- [x] Verified MCP streamable HTTP support in the current stable TypeScript SDK line.
- [x] Bootstrap the TypeScript project and write core contract tests.
- [x] Implement authenticated `/v1/responses` JSON output, current SDK adapter, request normalization, and spec-shaped terminal SSE sequence.
- [x] Implement `/v1/responses/compact`, including the required missing-model rejection.
- [x] Add in-process response continuation and model discovery endpoint.
- [x] Add plan approval/hash verification and hosted-tool receipt construction.
- [x] Expose an authenticated MCP streamable-HTTP initialization surface at `/mcp`.
- [x] Implement deterministic `cursor:write_brief` and `cursor:approve_plan` primitives with dispatch-directory path guards.
- [x] Connect deterministic hosted tools and Cursor-backed `cursor:plan` / `cursor:implement` to the Responses surface. `implement` verifies approval and body hash before invoking Cursor, serializes runs, reverts all `docs/dispatch` edits, and returns server-measured diffstat.
- [x] Connect the same `cursor:plan` and `cursor:implement` execution layer to MCP, including the configured default Cursor model for MCP calls.
- [x] Implement bounded, repository-scoped `cursor:explore` file-and-line receipts on both surfaces.
- [x] Implement `cursor:integrate_task`: it requires a persisted clean-start task baseline, switches or creates `phase/<n>`, stages no dispatch records, and commits task changes without touching the base branch.
- [x] Implement `cursor:gate_phase`: it pushes a phase branch, creates an ephemeral PR, watches checks, closes red gates, and merges/deletes green gates. It returns a failed receipt when this deployment has no `origin`; no external GitHub state was changed during local tests.
- [x] Implement Cursor-backed `cursor:review` on both surfaces. It reads the approved plan, brief, and server-measured task diff; returns a pass/fail verdict and capped findings; stores the full transcript under `docs/dispatch/episodes/`; and reverts any dispatch-directory edit by the reviewer.
- [x] Cap ordinary Responses output at 32,000 characters and retain the full Cursor output under `docs/dispatch/runtime/responses/`; continuation storage preserves the untruncated output.
- [x] Wire `config/model-routing.yaml` aliases and allow-list policy into HTTP request execution; aliases select the actual Cursor model while the Response retains the caller's model id.
- [x] Map Cursor SDK rate limits to Open Responses `too_many_requests` (429) and Cursor execution failures to `model_error` (500).
- [x] Persist a clean-start task baseline before the first implementation; `cursor:get_diff` and implementation receipts measure against that commit instead of an arbitrary working-tree diff.
- [x] Configure `ai-automation/dev` in Doppler for this workspace, promote the
  Cursor project secret to `CURSOR_API_KEY`, and generate the gateway caller
  secret `CURSOR_RESPONSES_API_KEY`. No secret was written to disk.
- [x] Verify the real Cursor key through the official SDK: model discovery
  returned 32 models, including `default`.
- [x] Run the live service with Doppler injection: authenticated model lookup,
  non-streaming response, streaming response, Responses lifecycle, and the
  server-enforced out-of-scope write restoration all completed against Cursor.
- [ ] Complete a fresh full direct acceptance run. The previous scratch
  repository successfully integrated the task, then correctly stopped at the
  expected `origin`-remote requirement for the real ephemeral PR gate.
- [ ] Run the official Open Responses CLI's 10 core tests. The current external
  runner aborts at Bun/Zod schema startup before it can issue an HTTP request;
  see `ACCEPTANCE.md` for the exact boundary.
- [ ] Configure an `origin` remote with authorized GitHub CI before the
  ephemeral-PR gate can be executed end to end.

## Decisions recorded from current sources

- Runtime: Node 22.13 or newer. `GOAL.md` permits Node 20+, but current `@cursor/sdk` 1.0.24 requires Node 22.13+; this repository uses the stricter compatible floor.
- MCP SDK: `@modelcontextprotocol/sdk` 1.x stable line, not the 2.x beta packages.
- MCP tool-name warning: the SDK warns that `cursor:` names are outside its conventional grammar, but the goal explicitly mandates that extension slug. Keep those names; do not invent aliases.
- HTTP routes: `/v1/responses`, `/v1/responses/compact`, and `/mcp`.
- No API keys, bearer tokens, or `.env` files are committed.

## Aperture task zero

- [x] Tailscale's current provider matrix permits `openai_responses` for
  self-hosted providers, but defaults them to `openai_chat`; the provider entry
  enables only the Responses route and uses an origin-only `baseurl`.
- [ ] The documentation does not guarantee custom Open Responses item/SSE
  preservation. The owner-gated Aperture acceptance run must prove it and add
  session-log evidence.
