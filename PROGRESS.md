# Progress

## Current phase: contract grounding and bootstrap

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
- [ ] Implement the remaining hosted roles (`review`, `integrate_task`, and `gate_phase`) on both surfaces.
- [x] Persist a clean-start task baseline before the first implementation; `cursor:get_diff` and implementation receipts measure against that commit instead of an arbitrary working-tree diff.
- [ ] Run a real Cursor model-discovery and acceptance pass. The local Doppler CLI is not scoped to a project/config for this workspace, and `CURSOR_API_KEY` is not present in the current process; no secret was written to disk.

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
